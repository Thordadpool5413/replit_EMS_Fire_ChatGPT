/** Read-only responsive checks against a production build. Never submit profile forms. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson } = await import('./check-profile-overflow.mjs');
const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:5173/';
const output = path.resolve('generated-artifacts/profile-redesign');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), 'profile-redesign-'));
const port = await reservePort();
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + directory, 'about:blank'], { stdio: 'ignore' });
let cdp;
const results = [];
const failures = [];
const topics = ['overview', 'deal_story', 'equipment', 'decision_makers', 'purchasing', 'activity', 'evidence', 'operations', 'medicare', 'meeting'];
try {
  await waitForJson('http://127.0.0.1:' + port + '/json/version');
  const pages = await fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json());
  cdp = createCdpClient(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Use bundled public fixtures only; profile UI checks must never contact cloud records.
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['*googleapis.com*', '*firebaseio.com*', '*firebaseapp.com*', '*replit.app*'] });
  const ev = expression => evaluate(cdp, expression);
  const cases = [
    ...[1366, 1024, 390, 320].map(width => ({ width, agency: '', topics })),
    { width: 1366, agency: 'Miami-Dade County Fire Rescue Department', topics },
    { width: 390, agency: 'Miami-Dade County Fire Rescue Department', topics },
  ];
  for (const scenario of cases) {
    const { width } = scenario;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: base });
    await waitFor(cdp, 'Boolean(document.querySelector("main"))', 'app', 60000);
    await ev('(()=>{const button=[...document.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")||b.innerText).trim()==="Agencies"&&b.getBoundingClientRect().height>0);if(!button)throw Error("Missing Agencies");button.click()})()');
    await waitFor(cdp, 'Boolean(document.querySelector(".agency-lead-cards-grid > div"))', 'agency directory', 60000);
    if (scenario.agency) {
      await ev('(()=>{const input=document.querySelector(\'input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]\');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(input,' + JSON.stringify(scenario.agency) + ');input.dispatchEvent(new Event("input",{bubbles:true}))})()');
      await waitFor(cdp, '[...document.querySelectorAll(".agency-lead-cards-grid > div")].some(e=>e.textContent.includes(' + JSON.stringify(scenario.agency) + '))', 'fire profile fixture', 60000);
      await ev('[...document.querySelectorAll(".agency-lead-cards-grid > div")].find(e=>e.textContent.includes(' + JSON.stringify(scenario.agency) + ')).click()');
    } else {
      await ev('document.querySelector(".agency-lead-cards-grid > div").click()');
    }
    await waitFor(cdp, 'Boolean(document.querySelector(".profile-redesign .acp-header"))', 'profile', 60000);
    await ev('document.fonts.ready.then(()=>true)');
    const storageBefore = await ev('JSON.stringify({...localStorage})');
    assert.equal(await ev('document.querySelector("[data-testid=profile-contact-disclosure]").open'), false, 'Repeated contacts start collapsed');
    await ev('document.querySelector("[data-testid=profile-contact-disclosure] summary").click()');
    assert.equal(await ev('document.querySelector(".agency-identity-strip").getBoundingClientRect().height>0'), true, 'Full address and contact panel remains available');
    await ev('document.querySelector("[data-testid=profile-contact-disclosure] summary").click()');
    assert.ok(await ev('JSON.stringify({...localStorage})') === storageBefore, 'Opening or closing contacts must not save data');
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    assert.equal(await ev('document.querySelector(".agency-identity-strip").getBoundingClientRect().height>0'), true, 'Closed screen contacts remain present in print');
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' });
    for (const topic of scenario.topics) {
      await ev('(()=>{const selector=document.querySelector(".acp-nav-select");if(selector.getBoundingClientRect().height>0){selector.value=' + JSON.stringify(topic) + ';selector.dispatchEvent(new Event("change",{bubbles:true}));return}const tab=document.querySelector("[data-section=' + topic + ']");if(tab){tab.click();return}const more=document.querySelector("[aria-label=\\"Additional account detail\\"]");more.value=' + JSON.stringify(topic) + ';more.dispatchEvent(new Event("change",{bubbles:true}))})()');
      await waitFor(cdp, 'document.querySelector(".agency-command-profile").getAttribute("data-profile-topic")===' + JSON.stringify(topic), 'topic ' + topic, 10000);
      await ev('new Promise(resolve=>{let last=-1,stable=0;const start=performance.now();function frame(){const top=document.querySelector(".agency-command-profile").scrollTop;stable=Math.abs(top-last)<.5?stable+1:0;last=top;if(stable>=8||performance.now()-start>2000)return resolve(true);requestAnimationFrame(frame)}requestAnimationFrame(frame)})');
      const geometry = await ev('(()=>{const root=document.querySelector(".agency-command-profile"), panel=document.querySelector("#profile-topic-panel"), nav=root.querySelector(".acp-nav"), header=root.querySelector("[data-testid=profile-sticky-header]");const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;return {width:' + width + ',topic:' + JSON.stringify(topic) + ',viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,profile:root.clientWidth,scroll:root.scrollWidth,panelTop:panel.getBoundingClientRect().top,navBottom:nav.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,backBottom:header.getBoundingClientRect().bottom,nameFont:parseFloat(getComputedStyle(root.querySelector(".acp-name")).fontSize),background:getComputedStyle(root).backgroundColor,panels:root.querySelectorAll("#profile-topic-panel").length,navigations:root.querySelectorAll(".acp-nav").length,smallControls:[...panel.querySelectorAll("button,select")].filter(visible).filter(e=>e.getBoundingClientRect().height<43).map(e=>e.getAttribute("data-testid")||e.tagName),overflow:[...root.querySelectorAll("*")].filter(visible).filter(e=>e.getBoundingClientRect().right>root.getBoundingClientRect().left+root.clientWidth+1&&!e.closest(".pi-table-region__scroller,[class*=overflow-x-auto]")).slice(0,10).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))}})()');
      results.push(geometry);
      await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      if (width < 768) console.log('MOBILE_GEOMETRY ' + JSON.stringify(geometry));
      try {
      assert.ok(geometry.page <= geometry.viewport + 1, 'Page overflow: ' + JSON.stringify(geometry));
      assert.ok(geometry.scroll <= geometry.profile + 1, 'Profile overflow: ' + JSON.stringify(geometry));
      assert.ok(geometry.panelTop >= geometry.navBottom - 1, 'Topic opening obscured: ' + JSON.stringify(geometry));
      assert.ok(geometry.navTop >= geometry.backBottom - 1, 'Sticky navigation overlaps: ' + JSON.stringify(geometry));
      assert.equal(geometry.panels, 1, 'One topic panel');
      assert.equal(geometry.navigations, 1, 'One topic navigation');
      assert.ok(geometry.nameFont >= 26, 'Readable profile title');
      assert.equal(geometry.background, 'rgb(255, 248, 239)', 'Warm ivory profile surface');
      if (width < 768) assert.deepEqual(geometry.smallControls, [], 'Touch targets at least 44px: ' + JSON.stringify(geometry));
      console.log('PASS ' + width + 'px / ' + topic);
      } catch (error) { failures.push(error.message); console.error('LAYOUT_FAILURE ' + error.message); }
    }
    // Theme changes stay visual and must keep this profile readable.
    await ev('document.documentElement.classList.add("dark")');
    assert.equal(await ev('getComputedStyle(document.querySelector(".agency-command-profile")).backgroundColor'), 'rgb(255, 248, 239)');
    await ev('document.documentElement.classList.remove("dark")');
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  assert.deepEqual(failures, [], 'All responsive profile cases must pass');
  console.log('PASS ' + results.length + ' read-only responsive topic checks; contacts preserve stored data');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (cdp) cdp.close();
  if (chrome.exitCode === null) await new Promise(resolve => { chrome.once('exit', resolve); chrome.kill('SIGTERM'); });
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
