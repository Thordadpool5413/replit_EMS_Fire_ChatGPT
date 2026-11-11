import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.PROFILE_HELPERS_ONLY='1';
const {createCdpClient,evaluate,waitFor,reservePort,waitForJson}=await import('./check-profile-overflow.mjs');
const out='generated-artifacts/laptop-density';
await mkdir(out,{recursive:true});
const base=process.env.DENSITY_AUDIT_URL||'http://127.0.0.1:80/';
const dir=await mkdtemp(path.join(os.tmpdir(),'laptop-density-'));
const port=await reservePort();
const chrome=spawn('chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${dir}`,'about:blank'],{stdio:'ignore'});
let cdp;const results=[];
try{
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  cdp=createCdpClient(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const ev=s=>evaluate(cdp,s);
  const settle=async()=>{await ev(`document.fonts.ready.then(()=>true)`);await new Promise(r=>setTimeout(r,350));};
  const nav=async(route,ready)=>{
    await cdp.send('Page.navigate',{url:new URL(route,base).href});
    await waitFor(cdp,ready,route,60000);
    await ev(`(()=>{const s=document.createElement('style');s.textContent='*{scroll-behavior:auto!important;animation:none!important;transition:none!important}';document.head.appendChild(s)})()`);
    await settle();
  };
  const shot=async(name)=>{
    const capture=await cdp.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${out}/${name}.png`,Buffer.from(capture.result.data,'base64'));
  };
  const measure=selector=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing measurement target');const s=getComputedStyle(e),r=e.getBoundingClientRect();return{height:r.height,width:r.width,padding:s.padding,gap:s.gap,font:s.fontSize,fine:matchMedia('(pointer:fine)').matches,roots:document.querySelectorAll('[data-laptop-density]').length,scroll:e.scrollWidth,client:e.clientWidth,text:e.innerText}})()`);
  const compare=async(name,selector,desktop)=>{
    if(selector.includes('county-signals'))await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);
    await ev(`window.__densityRoots=[...document.querySelectorAll('[data-laptop-density]')].map(e=>[e,e.getAttribute('data-laptop-density')]);window.__densityRoots.forEach(([e])=>e.removeAttribute('data-laptop-density'))`);
    await settle();const before=await measure(selector);
    await shot(`${name}-before`);
    await ev(`window.__densityRoots.forEach(([e,v])=>e.setAttribute('data-laptop-density',v));delete window.__densityRoots`);
    await settle();const after=await measure(selector);
    await shot(`${name}-after`);
    const viewport=await ev(`({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})`);
    assert.ok(viewport.scroll<=viewport.client+1,`${name}: page overflow`);
    assert.equal(before.text,after.text,`${name}: density must not remove facts`);
    assert.ok(after.scroll<=after.client+1,`${name}: card overflow`);
    if(desktop)assert.ok(after.height<before.height-1,`${name}: must actually reduce rendered height: ${JSON.stringify({...before,text:undefined})} -> ${JSON.stringify({...after,text:undefined})}`);
    else{
      assert.equal(after.height,before.height,`${name}: Home/mobile height changed`);
      assert.equal(after.padding,before.padding,`${name}: Home/mobile padding changed`);
      assert.equal(after.font,before.font,`${name}: Home/mobile type changed`);
    }
    results.push({name,before:{...before,text:undefined},after:{...after,text:undefined},reductionPercent:Math.round((1-after.height/before.height)*100)});
    console.log(name,before.height,'->',after.height);
  };
  for(const {width,height,touch} of [
    {width:1366,height:768,touch:false},
    {width:1280,height:720,touch:false},
    {width:390,height:844,touch:true},
  ]){
    const tag=`${width}-${height}`;
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
    await nav('/',`document.querySelectorAll('main svg path').length>20`);
    assert.equal(await ev(`document.querySelector('main').getAttribute('data-laptop-density')`),null,'Home must not opt into compact sizing');
    await compare(`${tag}-home`,'main',false);
    await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.innerText).trim()==='Agencies'&&b.getBoundingClientRect().height>0);if(!b)throw Error('Missing Agencies');b.click()})()`);
    await waitFor(cdp,`Boolean(document.querySelector('.agency-lead-cards-grid > div'))`,'agency cards',60000);
    await settle();
    await compare(`${tag}-agency`,'.agency-lead-cards-grid > div',!touch);
    await ev(`document.querySelector('.agency-lead-cards-grid > div').click()`);
    await waitFor(cdp,`Boolean(document.querySelector('.acp-header'))`,'agency profile',60000);
    await settle();
    await compare(`${tag}-profile`,'.acp-header',!touch);
    await nav('/?state=FL',`Boolean(document.querySelector('[data-testid="row-county-signals-12001"]'))`);
    await compare(`${tag}-county`,'[data-testid="row-county-signals-12001"]',!touch);
    const values=await ev(`[...document.querySelector('[data-testid="row-county-signals-12001"]').querySelectorAll('.cb-fig dd')].map(e=>parseFloat(getComputedStyle(e).fontSize))`);
    assert.ok(values.every(v=>v>=14),'Keep county values legible');
    await nav('/?state=FL&county=Alachua%20County',`Boolean(document.querySelector('.cv-place-list'))`);
    await compare(`${tag}-places`,'.cv-panel:has(.cv-place-list)',!touch);
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log('PASS laptop density: reduced desktop heights; Home, phone sizing and facts unchanged');
}finally{
  cdp?.close();chrome.kill('SIGTERM');await new Promise(r=>setTimeout(r,150));await rm(dir,{recursive:true,force:true});
}
