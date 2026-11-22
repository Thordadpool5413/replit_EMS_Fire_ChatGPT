/** Read-only responsive checks against a production build. Never submit profile forms. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson } = await import('./check-profile-overflow.mjs');
const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:5173/';
const output = path.resolve('generated-artifacts/mobile-field-polish');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), 'mobile-field-polish-'));
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
  for (const [width,height] of [[320,568],[390,660],[430,740],[667,375],[1366,768]]) {
    const phone=width<768;
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Page.navigate',{url:base});
    await waitFor(cdp,'Boolean(document.querySelector(".home-map-phone-actions"))','home map',60000);
    await ev('document.fonts.ready.then(()=>true)');
    await waitFor(cdp, 'document.querySelectorAll(".atlas-phone-key").length === '+(phone ? 1 : 0), 'responsive map mode');
    const before=await ev('JSON.stringify({...localStorage})');
    const measure=()=>ev(`(()=>{const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};return {viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,map:r(".home-map-viewport"),nav:r(".pi-mobile-nav"),actions:r(".home-map-phone-actions"),padding:parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom)}})()`);
    const initial=await measure();
    const capture = await cdp.send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
    await writeFile(path.join(output, 'home-'+width+'x'+height+'.png'), Buffer.from(capture.result.data, 'base64'));
    console.log("MAP_GEOMETRY "+JSON.stringify({width,height,...initial}));
    console.log("MAP_ANCESTORS "+JSON.stringify(await ev('(()=>{let e=document.querySelector(".home-map-viewport"),out=[];while(e){let b=e.getBoundingClientRect(),c=getComputedStyle(e);out.push({class:e.className,width:b.width,min:c.minWidth,max:c.maxWidth,display:c.display});e=e.parentElement}return out})()')));
    assert.ok(initial.page<=initial.viewport+1, 'Page overflow at '+width);
    if(phone){
      assert.ok(await ev('[...document.querySelectorAll(".home-map-leader rect")].every(e=>{const r=e.getBoundingClientRect(),v=document.querySelector(".home-map-viewport").getBoundingClientRect();return r.left>=v.left && r.right<=v.right})'), 'Northeast callouts remain inside the map');
      assert.ok(await ev('[...document.querySelectorAll(".home-map-svg text")].filter(t=>/^[A-Z]{2}$/.test(t.textContent)).every(t=>parseFloat(getComputedStyle(t).fontSize)*Math.abs(t.getScreenCTM().a)>=8.5)'), 'State labels remain readable at phone scale');
      assert.equal(await ev('document.querySelectorAll(".atlas-phone-key").length'),1,'One phone map legend');
      assert.equal(await ev('document.querySelectorAll(".home-map-legend-v2").length'),0,'Desktop legend is absent on phones');
      assert.ok(initial.map.bottom<=initial.actions.y+1,'Map appears above phone controls');
      assert.ok(Math.round(initial.actions.height)>=44,'Phone actions meet the minimum touch target');
      assert.ok(initial.map.width>=width-64&&initial.map.right<=initial.viewport+1,'Map fits phone width');
      if(height>width)assert.ok(initial.map.y<initial.nav.y,'Map starts above navigation at '+width);
      await ev('document.querySelector(".home-map-viewport").scrollIntoView({block:"center",behavior:"instant"})');
      const scrolled=await measure();
      if(scrolled.map.height<scrolled.nav.y)assert.ok(scrolled.map.bottom<=scrolled.nav.y+1,'Map scrolls clear of navigation');
      assert.ok(initial.padding>=initial.nav.height,'Scroll clearance below navigation');
      await ev('document.querySelector("[aria-controls=home-map-options]").click()');
      await waitFor(cdp,'document.querySelector("#home-map-options").getBoundingClientRect().height>0','options');
      assert.ok(await ev('document.querySelector("#home-state-map-metric").getBoundingClientRect().height>=44'),'Metric tap target');
      assert.equal(await ev('getComputedStyle(document.querySelector("#home-state-map-metric")).fontSize'),'16px');
      await ev('document.querySelector("[aria-controls=home-map-options]").click()');
      await ev('document.querySelector(".home-map-phone-actions button").click()');
      await waitFor(cdp,'document.querySelector("dialog[aria-labelledby=home-state-picker-title]").open','state picker');
      assert.equal(await ev('document.querySelectorAll(".home-state-picker-results button").length'),51,'All states and DC reachable');
      await ev('(()=>{const input=document.querySelector("#home-state-search");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Florida");input.dispatchEvent(new Event("input",{bubbles:true}))})()');
      await waitFor(cdp,'document.querySelectorAll(".home-state-picker-results button").length===1','state search');
      assert.ok(await ev('document.querySelector(".home-state-picker-results button").textContent.includes("Florida")'),'Name search');
      await ev('document.querySelector("dialog[open] .home-state-picker-heading button").click()');
      assert.equal(await ev('JSON.stringify({...localStorage})'),before,'Controls must not write agency data');
      // Visual-only update notice fixture: never call the real update or save actions.
      await ev('(()=>{const banner=document.createElement("aside");banner.className="pwa-status-banner";banner.innerHTML="<p>An app update is ready. Save your work before updating.</p><button type=button>Update app</button>";document.querySelector("main").before(banner)})()');
      const banner=await ev('(()=>{const e=document.querySelector(".pwa-status-banner"),b=e.getBoundingClientRect(),button=e.querySelector("button").getBoundingClientRect();return {left:b.left,right:b.right,buttonRight:button.right,height:b.height}})()');
      assert.ok(banner.right<=width+1&&banner.buttonRight<=width+1,'Update notice fits');
    } else assert.equal(initial.actions.height,0,'Desktop layout retained');
    results.push({width,height,...initial});
    console.log('PASS mobile map layout and interactions '+width+'x'+height);
  }

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:base});
  await waitFor(cdp,'Boolean(document.querySelector(".pi-mobile-nav"))','navigation',60000);
  const destinations = ['Agencies','Field Work','Reports'];
  await ev('document.querySelector(".pi-mobile-more").open=true');
  const extra = await ev('[...document.querySelectorAll(".pi-mobile-more__link")].map(e=>e.textContent.trim())');
  for (const destination of [...destinations,...extra]) {
    await ev('document.querySelector(".pi-mobile-more").open=true');
    await ev('(()=>{const b=[...document.querySelectorAll(".pi-mobile-nav button")].find(b=>(b.getAttribute("aria-label")||b.textContent).trim()==='+JSON.stringify(destination)+');if(!b)throw Error("Missing destination");b.click()})()');
    await ev('new Promise(r=>setTimeout(r,1000))');
    await ev('window.scrollTo(0,0);document.querySelector(".pi-mobile-more").open=false');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(path.join(output,'workspace-'+destination.replace(/[^a-z0-9]+/gi,'-')+'.png'),Buffer.from(shot.result.data,'base64'));
    const runtimeError=await ev('[...document.querySelectorAll("details")].find(e=>e.textContent.includes("Technical details"))?.textContent || ""');
    assert.equal(runtimeError,'','Workspace runtime error '+destination);
    const pageWidth=await ev('document.documentElement.scrollWidth');
    assert.ok(pageWidth<=391,'Workspace overflow '+destination);
  }

  for (const [query,selector,name] of [
    ['?state=FL','.county-inspector-panel','state'],
    ['?state=FL&county=Alachua%20County','.county-city-directory-panel','county']
  ]) {
    await cdp.send('Page.navigate',{url:base+query});
    await waitFor(cdp,'Boolean(document.querySelector('+JSON.stringify(selector)+'))',name,60000);
    await ev('document.fonts.ready.then(()=>true)');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(path.join(output,'geography-'+name+'.png'),Buffer.from(shot.result.data,'base64'));
    assert.ok(await ev('document.documentElement.scrollWidth<=391'),'Geography width '+name);
    await ev('document.querySelector(".equipment-filter-disclosure").open=true');
    assert.ok(await ev('Math.round(document.querySelector(".equipment-filter-select").getBoundingClientRect().height)>=44'),'Expanded equipment filter target');
    await ev('document.querySelector(".equipment-filter-disclosure").open=false');
  }
  await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
} finally {
  if(cdp)cdp.close();
  if(chrome.exitCode===null&&chrome.signalCode===null)await new Promise(resolve=>{chrome.once('exit',resolve);chrome.kill('SIGTERM')});
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
