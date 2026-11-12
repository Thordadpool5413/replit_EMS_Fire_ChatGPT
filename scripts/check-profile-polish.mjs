/** Focused, read-only profile presentation check. Never submits or changes agency facts. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson } = await import('./check-profile-overflow.mjs');
const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:80/';
const out = process.env.PROFILE_POLISH_OUTPUT || 'generated-artifacts/profile-polish';
await mkdir(out, { recursive: true });
const dir = await mkdtemp(path.join(os.tmpdir(), 'profile-polish-'));
const port = await reservePort();
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
const results = [];
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  cdp = createCdpClient(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const ev = value => evaluate(cdp, value);
  for (const width of (process.env.PROFILE_POLISH_WIDTHS || '1366,390,320').split(',').map(Number)) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: width < 768, maxTouchPoints: 1 });
    await cdp.send('Page.navigate', { url: base });
    await waitFor(cdp, `Boolean(document.querySelector('main'))`, 'app', 60000);
    await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.innerText).trim()==='Agencies'&&b.getBoundingClientRect().height>0);if(!b)throw Error('Missing Agencies');b.click()})()`);
    await waitFor(cdp, `Boolean(document.querySelector('.agency-lead-cards-grid > div'))`, 'agency cards', 60000);
    if (process.env.PROFILE_POLISH_AGENCY) {
      await ev(`(()=>{
        const input=document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]');
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        setter.call(input,${JSON.stringify(process.env.PROFILE_POLISH_AGENCY)});input.dispatchEvent(new Event('input',{bubbles:true}));
      })()`);
      await waitFor(cdp, `[...document.querySelectorAll('.agency-lead-cards-grid > div')].some(e=>e.textContent.includes(${JSON.stringify(process.env.PROFILE_POLISH_AGENCY)}))`, 'requested agency', 60000);
    }
    await ev(`(()=>{const cards=[...document.querySelectorAll('.agency-lead-cards-grid > div')];const target=${JSON.stringify(process.env.PROFILE_POLISH_AGENCY || '')};(target?cards.find(c=>c.textContent.includes(target)):cards[0]).click()})()`);
    await waitFor(cdp, `Boolean(document.querySelector('.acp-header'))`, 'agency profile', 60000);
    await ev(`document.fonts.ready.then(()=>true)`);
    await new Promise(resolve => setTimeout(resolve, 500));
    for (const topic of process.env.PROFILE_POLISH_TOPICS?.split(',') || (process.env.PROFILE_POLISH_HEADER_ONLY ? ['overview'] : ['overview', 'equipment', 'purchasing', 'decision_makers', 'operations', 'evidence'])) {
      if (topic !== 'overview') {
        await ev(`(()=>{const s=document.querySelector('.acp-nav-select');if(s&&getComputedStyle(s).display!=='none'){s.value=${JSON.stringify(topic)};s.dispatchEvent(new Event('change',{bubbles:true}))}else{document.querySelector('[data-testid="tab-profile-${topic}"]').click()}})()`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      const geometry = await ev(`(()=>{
        const root=document.querySelector('.agency-command-profile');
        const shown=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
        const r=root.getBoundingClientRect();
        return {
          topic:${JSON.stringify(topic)},width:${width},
          viewport:document.documentElement.clientWidth,
          page:document.documentElement.scrollWidth,
          profileWidth:r.width,profileScroll:root.scrollWidth,
          profileCount:document.querySelectorAll('.agency-command-profile').length,
          overviewCount:root.querySelectorAll('[data-testid="profile-command-overview"]').length,
          navCount:root.querySelectorAll('.acp-nav').length,
          headerHeight:document.querySelector('.acp-header').getBoundingClientRect().height,
          summariesHeight:root.querySelector('.acp-summaries')?.getBoundingClientRect().height??null,
          summaryFont:root.querySelector('.acp-summary-value')?getComputedStyle(root.querySelector('.acp-summary-value')).fontSize:null,
          nameFont:getComputedStyle(root.querySelector('.acp-name')).fontSize,
          equipmentHeight:root.querySelector('[data-testid="profile-equipment-summary"]')?.getBoundingClientRect().height??null,
          removed:!root.querySelector('[data-testid="panel-recommended-next-action"]'),
          icons:[...root.querySelectorAll('svg')].filter(shown).length,
          summaryIcons:[...root.querySelectorAll('.acp-summary svg')].filter(shown).length,
          name:root.querySelector('.acp-name').textContent,
          active:root.querySelector('.acp-tab.is-active')?.getAttribute('data-testid'),
          prepareHeight:root.querySelector('[data-testid="button-profile-prepare-meeting"]')?.getBoundingClientRect().height??null
        }
      })()`);
      assert.ok(geometry.page <= geometry.viewport + 1, `${width}/${topic}: page overflow`);
      assert.ok(geometry.profileScroll <= geometry.profileWidth + 1, `${width}/${topic}: profile overflow`);
      assert.ok(geometry.removed, 'Removed next-action section must stay removed');
      assert.equal(geometry.profileCount, 1, 'Only one profile may be mounted');
      assert.equal(geometry.navCount, 1, 'Only one topic navigation may be mounted');
      assert.equal(geometry.overviewCount, topic === 'overview' ? 1 : 0, 'Overview must not repeat');
      assert.ok(geometry.icons > 5, `${width}/${topic}: meaningful icons rendered`);
      assert.equal(geometry.active, `tab-profile-${topic}`, 'Topic navigation must work');
      if (width < 768) assert.ok(geometry.prepareHeight >= 44, 'Phone meeting-preparation action must be at least 44px tall');
      if (topic === 'overview') assert.ok(geometry.summaryIcons >= 4, 'Each overview summary needs an icon');
      results.push(geometry);
      if (['overview', 'equipment'].includes(topic)) {
        await ev(`document.querySelector('.agency-command-profile').scrollTop=0`);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`${out}/${width}-${topic}.png`, Buffer.from(shot.result.data, 'base64'));
        if (topic === 'equipment') {
          await ev(`document.querySelector('[data-testid="profile-equipment-summary"]').scrollIntoView({block:'start',behavior:'instant'})`);
          const equipmentShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(`${out}/${width}-equipment-content.png`, Buffer.from(equipmentShot.result.data, 'base64'));
        }
      }
    }
  }
  await writeFile(`${out}/${process.env.PROFILE_POLISH_HEADER_ONLY ? 'header-results' : 'results'}.json`, JSON.stringify(results, null, 2));
  console.log(`PASS profile polish: laptop/phone layouts, ${process.env.PROFILE_POLISH_TOPICS || (process.env.PROFILE_POLISH_HEADER_ONLY ? 'header and phone tap targets' : 'six topic tabs')}, icons, retained section removal.`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 150));
  await rm(dir, { recursive: true, force: true });
}
