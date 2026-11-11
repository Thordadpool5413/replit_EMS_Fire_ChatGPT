import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.PROFILE_HELPERS_ONLY='1';
const {createCdpClient,evaluate,waitFor,reservePort,waitForJson}=await import('./check-profile-overflow.mjs');
const output='generated-artifacts/mobile-openings';
const url=process.env.MOBILE_AUDIT_URL||'http://127.0.0.1:80/';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(os.tmpdir(),'mobile-opening-'));
const port=await reservePort();
const chrome=spawn('chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let cdp;
const results=[];
try{
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  cdp=createCdpClient(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const ev=expression=>evaluate(cdp,expression);
  const visible=selector=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||getComputedStyle(e).visibility==='hidden')return false;if(getComputedStyle(e).display==='contents')return [...e.querySelectorAll('input,select,button')].some(c=>c.getBoundingClientRect().height>0);return e.getBoundingClientRect().height>0})()`);
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const navigate=async(query,ready)=>{
    await cdp.send('Page.navigate',{url:new URL(query,url).href});
    await waitFor(cdp,ready,query,60000);
    await ev(`(()=>{const s=document.createElement('style');s.textContent='*{scroll-behavior:auto!important;animation:none!important;transition:none!important}';document.head.appendChild(s)})()`);
  };
  const capture=async(name,width,height,selector)=>{
    if(selector)await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);
    const geometry=await ev(`({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})`);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${output}/${width}-${height}-${name}.png`,Buffer.from(shot.result.data,'base64'));
    if(geometry.scroll>geometry.width+1){
      const overflowing=await ev(`(()=>{const w=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,text:e.textContent?.slice(0,70)})).filter(r=>r.right>w+1&&r.width>0).slice(0,15)})()`);
      console.error({name,geometry,overflowing});
    }
    assert.ok(geometry.scroll<=geometry.width+1,`${name} document overflow`);
    results.push({name,width,height,...geometry});
  };
  for(const {width,height} of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<1024,maxTouchPoints:1});
    await navigate('/',`Boolean(document.querySelector('[aria-label="Interactive U.S. Territory Map"]'))`);
    await ev(`(()=>{const buttons=[...document.querySelectorAll('button')];const b=buttons.find(b=>(b.getAttribute('aria-label')||b.innerText).trim()==='Agencies'&&b.getBoundingClientRect().height>0);if(!b)throw Error('Missing agency navigation');b.scrollIntoView({block:'nearest',behavior:'instant'});b.click()})()`);
    await waitFor(cdp,`Boolean(document.querySelector('[data-testid="agency-mobile-summary"]'))`,'agency summary');
    const mobile=width<640||(width<=1023&&height<=500);
    assert.equal(await visible('[data-testid="agency-secondary-filters-toggle"]'),mobile);
    if(mobile){
      assert.equal(await visible('[data-testid="agency-secondary-filters"]'),false);
      assert.equal(await visible('[data-testid="agency-secondary-controls"]'),false);
      const order=await ev(`(()=>{const a=document.querySelector('[data-testid="agency-mobile-summary"]').getBoundingClientRect();const b=document.querySelector('.lead-queue-workspace input[placeholder^="Search"]').getBoundingClientRect();return a.bottom<=b.top+1})()`);
      assert.ok(order,'Agency summary must precede search/filters');
      await capture('agencies-summary-first',width,height);
      await click('[data-testid="agency-secondary-filters-toggle"]');
      assert.equal(await visible('[data-testid="agency-secondary-controls"]'),true);
      await ev(`(()=>{const panel=document.querySelector('[data-testid="agency-secondary-filters"]');const b=[...panel.querySelectorAll('button')].find(b=>/^EMS\\b/.test(b.innerText.trim()));if(!b)throw Error('EMS filter missing');b.click();const s=[...panel.querySelectorAll('select')].find(s=>s.querySelector('option[value="FL"]'));if(!s)throw Error('State filter missing');s.value='FL';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(cdp,`/EMS/.test(document.querySelector('[data-testid="agency-secondary-filters-context"]').innerText)&&/(Florida|FL)/.test(document.querySelector('[data-testid="agency-secondary-filters-context"]').innerText)`,'visible applied-filter context');
      assert.ok(await ev(`(()=>{const number=s=>Number(s.replaceAll(',',''));const shown=number(document.querySelector('[data-testid="text-agency-summary-count"]').textContent);const parts=document.querySelector('[data-testid="agency-summary-breakdown"]').textContent.match(/[\\d,]+/g).map(number);return parts.reduce((a,b)=>a+b,0)===shown})()`),'summary breakdown must match the filtered records');
      await click('[data-testid="agency-secondary-filters-toggle"]');
      assert.equal(await visible('[data-testid="agency-secondary-filters"]'),false);
      await click('[data-testid="agency-secondary-filters-toggle"]');
      assert.ok(await ev(`[...document.querySelectorAll('[data-testid="agency-secondary-filters"] select')].some(s=>s.value==='FL')`),'collapsed controls must preserve state');
      await ev(`(()=>{const input=document.querySelector('.lead-queue-workspace input[placeholder^="Search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'zz_no_matching_agency_mobile');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await waitFor(cdp,`document.querySelector('[data-testid="text-agency-summary-count"]').textContent.trim()==='0'`,'zero matching agencies');
      assert.ok(await ev(`document.querySelector('.lead-queue-workspace').innerText.includes('No agencies match current filters')`));
      await capture('agency-empty-explanation',width,height);
    }else{
      assert.equal(await visible('[data-testid="agency-secondary-filters"]'),true);
      assert.equal(await visible('[data-testid="agency-secondary-controls"]'),true);
      await capture('agencies-desktop-controls',width,height);
    }
    await navigate('/?state=FL',`Boolean(document.querySelector('[data-testid="row-county-signals-12001"]'))`);
    const county=await ev(`(()=>{const c=document.querySelector('[data-testid="row-county-signals-12001"]');const text=c.innerText.replace(/\\s+/g,' ').toLowerCase();const order=['Population and response','Care access','Community context','FEMA NRI','Geography and places','Sources'].map(t=>text.indexOf(t.toLowerCase()));return{order,text,width:c.clientWidth,scroll:c.scrollWidth,values:[...c.querySelectorAll('.cb-fig dd')].map(e=>({font:parseFloat(getComputedStyle(e).fontSize),text:e.textContent.trim()})),geo:!!c.querySelector('.cb-geo')&&getComputedStyle(c.querySelector('.cb-geo')).display!=='none'}})()`);
    assert.ok(county.order.every(n=>n>=0),`Missing county reading-order section: ${JSON.stringify(county)}`);
    assert.deepEqual([...county.order].sort((a,b)=>a-b),county.order);
    assert.ok(county.scroll<=county.width+1,'County content must not overflow its card');
    assert.ok(county.geo,'Geography must remain visible');
    assert.ok(county.values.every(v=>v.font>=14),'Do not shrink county values to microtype');
    results.push({name:'county-metrics',width,height,...county});
    await capture('county-card',width,height,'[data-testid="row-county-signals-12001"]');
    await navigate('/?state=FL&county=Alachua%20County',`Boolean(document.querySelector('[data-testid="provider-mobile-summary"]'))`);
    assert.equal(await visible('[data-testid="provider-secondary-filters-toggle"]'),mobile);
    if(mobile){
      assert.equal(await visible('[data-testid="provider-secondary-filters"]'),false);
      await capture('county-provider-summary',width,height);
      await click('[data-testid="provider-secondary-filters-toggle"]');
      await waitFor(cdp,`document.querySelector('[data-testid="provider-secondary-filters"]').dataset.open==='true'`,'provider filters open');
      await click('[data-testid="button-provider-view-table"]');
      await click('[data-testid="provider-secondary-filters-toggle"]');
      assert.ok(await ev(`/List|Table/.test(document.querySelector('[data-testid="provider-secondary-filters-context"]').textContent)`),'Current list/table view must be named while hidden');
      await capture('provider-list-view',width,height);
    }else await capture('county-provider-desktop',width,height);
    console.log('PASS opening screens',width,height);
  }
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  console.log('PASS summary-first, filter state, zero results, county hierarchy and desktop controls');
}finally{
  cdp?.close();chrome.kill('SIGTERM');
  await new Promise(resolve=>setTimeout(resolve,150));
  await rm(profile,{recursive:true,force:true});
}
