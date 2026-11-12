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
  const settleProfileScroll = () => ev(`new Promise(resolve=>{
    let last=-1,still=0;const start=performance.now();
    function tick(){const top=document.querySelector('.agency-command-profile')?.scrollTop??0;
      still=Math.abs(top-last)<.5?still+1:0;last=top;
      if(still>=6||performance.now()-start>1800)return resolve(true);
      requestAnimationFrame(tick);
    }requestAnimationFrame(()=>requestAnimationFrame(tick));
  })`);
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
    assert.equal(await ev(`document.querySelector('[data-testid="profile-record-context"]').open`),false,'Secondary record metadata starts collapsed');
    await ev(`document.querySelector('[data-testid="profile-record-context"] summary').click()`);
    assert.equal(await ev(`document.querySelector('[data-testid="text-profile-source-period"]').getBoundingClientRect().height>0`),true,'Record metadata remains available');
    await ev(`document.querySelector('[data-testid="profile-record-context"] summary').click()`);
    // The header action must follow the moved preparation content.
    await ev(`document.querySelector('[data-testid="button-profile-prepare-meeting"]').click()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="profile-meeting-brief"]'))`, 'meeting prep action', 10000);
    await ev(`document.querySelector('[data-testid="tab-profile-overview"]').click()`);
    await settleProfileScroll();
    for (const topic of process.env.PROFILE_POLISH_TOPICS?.split(',') || (process.env.PROFILE_POLISH_HEADER_ONLY ? ['overview'] : ['overview', 'equipment', 'purchasing', 'decision_makers', 'operations', 'medicare', 'meeting', 'deal_story', 'evidence'])) {
      if (topic !== 'overview') {
        await ev(`(()=>{const s=document.querySelector('.acp-nav-select');if(s&&getComputedStyle(s).display!=='none'){s.value=${JSON.stringify(topic)};s.dispatchEvent(new Event('change',{bubbles:true}))}else{document.querySelector('[data-testid="tab-profile-${topic}"]').click()}})()`);
        await settleProfileScroll();
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
          summariesHeight:root.querySelector('.acp-hero')?.getBoundingClientRect().height??null,
          summaryFont:root.querySelector('.acp-ledger-value')?getComputedStyle(root.querySelector('.acp-ledger-value')).fontSize:null,
          nameFont:getComputedStyle(root.querySelector('.acp-name')).fontSize,
          equipmentHeight:root.querySelector('[data-testid="profile-equipment-summary"]')?.getBoundingClientRect().height??null,
          removed:!root.querySelector('[data-testid="panel-recommended-next-action"]'),
          icons:[...root.querySelectorAll('svg')].filter(shown).length,
          summaryIcons:[...root.querySelectorAll('.acp-hero svg')].filter(shown).length,
          contentIcons:[...root.querySelectorAll(${JSON.stringify({
            overview: '.acp-hero svg',
            equipment: '.aib-tech svg',
            operations: '.aib-snapshot svg',
            medicare: '.afi svg',
            meeting: '.pds-row svg',
            deal_story: '.dsb-full svg',
          }[topic] || '.acp-section-intro svg')})].filter(shown).length,
          name:root.querySelector('.acp-name').textContent,
          active:root.querySelector('.acp-tab.is-active')?.getAttribute('data-testid'),
          panelRole:root.querySelector('#profile-topic-panel')?.getAttribute('role'),
          panelLabel:root.querySelector('#profile-topic-panel')?.getAttribute('aria-labelledby'),
          panelTop:root.querySelector('#profile-topic-panel')?.getBoundingClientRect().top,
          navBottom:root.querySelector('.acp-nav').getBoundingClientRect().bottom,
          navTop:root.querySelector('.acp-nav').getBoundingClientRect().top,
          stickyBottom:root.querySelector('[data-testid="profile-sticky-header"]').getBoundingClientRect().bottom,
          navTopStyle:getComputedStyle(root.querySelector('.acp-nav')).top,
          navPosition:getComputedStyle(root.querySelector('.acp-nav')).position,
          stickyVariable:root.style.getPropertyValue('--acp-sticky-header-h'),
          stickyHeight:root.querySelector('[data-testid="profile-sticky-header"]').getBoundingClientRect().height,
          navParents:[root.querySelector('.acp-nav').parentElement,root.querySelector('.acp-nav').parentElement.parentElement].map(e=>({cls:e.className,overflow:getComputedStyle(e).overflow,top:e.getBoundingClientRect().top})),
          prepareHeight:root.querySelector('[data-testid="button-profile-prepare-meeting"]')?.getBoundingClientRect().height??null
          ,meetingCount:root.querySelectorAll('[data-testid="profile-meeting-brief"]').length
          ,dealCount:root.querySelectorAll('[data-testid="deal-story-full"]').length
          ,focusCount:root.querySelectorAll('[data-testid="profile-attention-summary"]').length
        }
      })()`);
      assert.ok(geometry.page <= geometry.viewport + 1, `${width}/${topic}: page overflow`);
      if (geometry.profileScroll > geometry.profileWidth + 1) console.log(await ev(`JSON.stringify([...document.querySelectorAll('.agency-command-profile *')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2).map(e=>({cls:e.className,width:e.clientWidth,scroll:e.scrollWidth,text:e.textContent.slice(0,100)})).slice(0,15))`));
      assert.ok(geometry.profileScroll <= geometry.profileWidth + 1, `${width}/${topic}: profile overflow`);
      assert.ok(geometry.removed, 'Removed next-action section must stay removed');
      assert.equal(geometry.profileCount, 1, 'Only one profile may be mounted');
      assert.equal(geometry.navCount, 1, 'Only one topic navigation may be mounted');
      assert.equal(geometry.overviewCount, topic === 'overview' ? 1 : 0, 'Overview must not repeat');
      assert.equal(geometry.meetingCount, topic === 'meeting' ? 1 : 0, 'Meeting preparation only in its own topic');
      assert.equal(geometry.dealCount, topic === 'deal_story' ? 1 : 0, 'Deal story only in its own topic');
      assert.equal(geometry.focusCount, topic === 'overview' ? 1 : 0, 'Opening focus brief only in overview');
      assert.ok(geometry.icons > 5, `${width}/${topic}: meaningful icons rendered`);
      assert.equal(geometry.active, `tab-profile-${topic}`, 'Topic navigation must work');
      assert.equal(geometry.panelRole, 'tabpanel', 'Topic content is an accessible panel');
      assert.equal(geometry.panelLabel, `profile-tab-${topic}`, 'Topic panel is named by its selected tab');
      if (geometry.panelTop < geometry.navBottom - 1) {
        console.log('Topic position', JSON.stringify(geometry));
        const shot = await cdp.send('Page.captureScreenshot', {format:'png'});
        await writeFile(`${out}/${width}-${topic}-position.png`,Buffer.from(shot.result.data,'base64'));
      }
      assert.ok(geometry.panelTop >= geometry.navBottom - 1, `${width}/${topic}: sticky bars must not obscure the topic opening`);
      assert.ok(geometry.navTop >= geometry.stickyBottom - 1, `${width}/${topic}: topic selector must stay below the back bar: ${JSON.stringify(geometry)}`);
      if (width < 768) assert.ok(geometry.prepareHeight >= 44, 'Phone meeting-preparation action must be at least 44px tall');
      if (topic === 'overview') {
        assert.ok(geometry.summaryIcons >= 4, 'The overview needs meaningful topic icons');
        assert.equal(await ev(`document.querySelectorAll('[data-testid^="row-overview-equipment-"]').length`),6,'All six recorded equipment categories are available in the opening profile');
        assert.ok(await ev(`document.querySelector('[data-testid="summary-equipment"]').getBoundingClientRect().top <= document.querySelector('[data-testid="summary-operations"]').getBoundingClientRect().top+1`),'Recorded equipment leads the overview reading order');
      }
      if (['overview','equipment','operations','medicare','meeting','deal_story'].includes(topic)) {
        assert.ok(geometry.contentIcons >= 3, `${topic}: topic content needs its own icons, not just navigation icons`);
      }
      if (['equipment','operations','deal_story'].includes(topic)) {
        const navigationShot = await cdp.send('Page.captureScreenshot',{format:'png'});
        await writeFile(`${out}/${width}-${topic}-navigation.png`,Buffer.from(navigationShot.result.data,'base64'));
      }
      results.push(geometry);
      if (['overview', 'equipment', 'operations', 'medicare', 'meeting', 'deal_story'].includes(topic)) {
        await ev(`document.querySelector('.agency-command-profile').scrollTop=0`);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`${out}/${width}-${topic}.png`, Buffer.from(shot.result.data, 'base64'));
        const contentSelector = {
          overview: '[data-testid="profile-command-overview"]',
          equipment: '[data-testid="profile-equipment-summary"]',
          operations: '[data-testid="baseline-operational-metrics"]',
          medicare: '[data-testid="financial-intelligence"]',
          meeting: '[data-testid="profile-meeting-brief"]',
          deal_story: '[data-testid="deal-story-full"]',
        }[topic];
        await ev(`(()=>{
          const target=document.querySelector(${JSON.stringify(contentSelector)});
          const root=document.querySelector('.agency-command-profile');
          const nav=document.querySelector('.acp-nav');
          if(target)root.scrollTop+=target.getBoundingClientRect().top-nav.getBoundingClientRect().bottom-12;
        })()`);
        await new Promise(resolve => setTimeout(resolve, 150));
        const contentShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`${out}/${width}-${topic}-detail.png`, Buffer.from(contentShot.result.data, 'base64'));
        if (topic === 'equipment') {
          await ev(`document.querySelector('[data-testid="profile-equipment-summary"]').scrollIntoView({block:'start',behavior:'instant'})`);
          const equipmentShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(`${out}/${width}-equipment-content.png`, Buffer.from(equipmentShot.result.data, 'base64'));
        }
      }
      if (topic === 'deal_story') {
        for (const subtopic of ['questions','solution','conversation','brief']) {
          await ev(`document.querySelector('[data-testid="button-dealstory-tab-${subtopic}"]').click()`);
          assert.equal(await ev(`document.querySelector('[data-testid="button-dealstory-tab-${subtopic}"]').getAttribute('aria-pressed')`),'true','Deal story subtopic selected');
          assert.equal(await ev(`getComputedStyle(document.querySelector('[data-testid="button-dealstory-tab-${subtopic}"]')).backgroundColor`),'rgba(0, 0, 0, 0)','Selected deal-story tab uses its readable underline style, not a legacy filled button');
          assert.ok(await ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),'Deal story subtopic fits viewport');
        }
        // Stub only this test browser's clipboard: no user clipboard is written.
        await ev(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked')}}});document.querySelector('[data-testid="button-dealstory-copy-pitch"]').click()`);
        await waitFor(cdp, `document.querySelector('[data-testid="status-dealstory-copy"]').textContent.includes('not available')`,'truthful clipboard failure',5000);
        assert.ok(!await ev(`document.querySelector('[data-testid="button-dealstory-copy-pitch"]').textContent.includes('Copied')`),'Blocked copy must not claim success');
        await ev(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__profileCopiedText=text}}});document.querySelector('[data-testid="button-dealstory-copy-pitch"]').click()`);
        await waitFor(cdp, `document.querySelector('[data-testid="button-dealstory-copy-pitch"]').textContent.includes('Copied')`,'successful copy feedback',5000);
        assert.ok(await ev(`window.__profileCopiedText.includes('confirm what is deployed today')`),'Copy retains the agency-specific opening');
      }
    }
    if (width >= 768) {
      await ev(`document.querySelector('.acp-tab.is-active').focus({preventScroll:true})`);
      await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Home',code:'Home'});
      await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Home',code:'Home'});
      await settleProfileScroll();
      assert.equal(await ev(`document.activeElement?.id`),'profile-tab-overview','Home key selects and focuses Overview');
      await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
      await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
      await settleProfileScroll();
      assert.equal(await ev(`document.activeElement?.id`),'profile-tab-equipment','Arrow navigation keeps focus on the selected tab');
      assert.equal(await ev(`document.querySelector('#profile-topic-panel').getAttribute('aria-labelledby')`),'profile-tab-equipment');
    }
  }
  await writeFile(`${out}/${process.env.PROFILE_POLISH_HEADER_ONLY ? 'header-results' : 'results'}.json`, JSON.stringify(results, null, 2));
  console.log(`PASS profile polish: laptop/phone layouts, ${process.env.PROFILE_POLISH_TOPICS || (process.env.PROFILE_POLISH_HEADER_ONLY ? 'header and phone tap targets' : 'nine topic tabs')}, icons, retained section removal.`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 150));
  await rm(dir, { recursive: true, force: true });
}
