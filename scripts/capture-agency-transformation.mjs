import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson, clickVisibleButton } = await import('./check-profile-overflow.mjs');
const phase = process.env.CAPTURE_PHASE || 'before';
const output = `generated-artifacts/agency-transformation/${phase}`;
await mkdir(output, { recursive: true });
const port = await reservePort();
const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'agency-transform-'));
const browser = spawn('chromium', ['--headless=new','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${userDataDir}`,'about:blank'], { stdio:'ignore' });
let cdp;
const records = [
  { kind:'ems', name:'Cleveland Division of Emergency Medical Service' },
  { kind:'fire', name:'Miami-Dade County Fire Rescue Department' },
];
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  cdp = createCdpClient(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await cdp.connect(); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const viewports=process.env.CAPTURE_VIEWPORTS ? JSON.parse(process.env.CAPTURE_VIEWPORTS) : [{width:1366,height:768},{width:390,height:844}];
  for (const viewport of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport, deviceScaleFactor:1,mobile:viewport.width<768});
    for (const record of records.filter(r=>!process.env.CAPTURE_KIND || r.kind===process.env.CAPTURE_KIND)) {
      await cdp.send('Page.navigate',{url:process.env.PROFILE_TEST_URL || 'http://127.0.0.1:80/'});
      await waitFor(cdp, `Boolean(document.querySelector('[data-testid="nav-agencies"]')) || [...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='Agencies')`, 'app navigation',60000);
      await clickVisibleButton(cdp,'Agencies');
      await waitFor(cdp, `document.body.innerText.includes('Open agency profile')`, 'agency directory',60000);
      await evaluate(cdp,`(() => {
        const input=document.querySelector('input[placeholder="Search agency, city, ZIP, NPI, or Chief..."]');
        if(!input) throw Error('No directory search');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(record.name)});
        input.dispatchEvent(new Event('input',{bubbles:true}));
      })()`);
      await waitFor(cdp,`[...document.querySelectorAll('h3')].some(h=>h.innerText.trim()===${JSON.stringify(record.name)})`, 'record result');
      await evaluate(cdp,`(() => {
        let node=[...document.querySelectorAll('h3')].find(h=>h.innerText.trim()===${JSON.stringify(record.name)});
        const find=n=>[...n.querySelectorAll('button,a')].find(b=>b.innerText.trim().startsWith('Open agency profile'));
        while(node && !find(node)) node=node.parentElement;
        find(node).click();
      })()`);
      await waitFor(cdp,`Boolean(document.querySelector('main.profile-workspace'))`, 'profile');
      await evaluate(cdp,`new Promise(r=>setTimeout(r,900))`);
      await evaluate(cdp,`(()=>{const s=document.createElement('style');s.textContent='*{scroll-behavior:auto!important;animation:none!important}';document.head.appendChild(s);document.querySelector('.provider-profile-overlay')?.scrollTo(0,0);window.scrollTo(0,0)})()`);
      if(phase==='after'){
        const badges=await evaluate(cdp,`[...document.querySelectorAll('.acp-header .profile-evidence-tag')].map(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))`);
        if(badges.some(b=>b.background!=='rgb(237, 244, 255)'||b.color!=='rgb(25, 74, 160)'))throw Error('Unreadable source badge cascade: '+JSON.stringify(badges));
      }
      const shot = await cdp.send('Page.captureScreenshot',{format:'png'});
      await writeFile(`${output}/${record.kind}-${viewport.width}-overview.png`,Buffer.from(shot.result.data,'base64'));
      console.log(phase,record.kind,viewport,await evaluate(cdp,`({width:document.documentElement.scrollWidth,profile:document.querySelector('main.profile-workspace').getBoundingClientRect().toJSON(),text:document.querySelector('main.profile-workspace').innerText.slice(0,350)})`));
      if(phase==='after') {
        for(const section of ['equipment','purchasing','decision_makers','operations','medicare','evidence']) {
          await evaluate(cdp,`(() => {
            const picker=document.querySelector('[data-testid="select-profile-section-mobile"]');
            if(picker && getComputedStyle(picker).display!=='none' && picker.getBoundingClientRect().height){
              Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(picker,${JSON.stringify(section)});picker.dispatchEvent(new Event('change',{bubbles:true}));
            } else {
              const button=document.querySelector('[data-testid="tab-profile-'+${JSON.stringify(section)}+'"]');if(!button)throw Error('Missing section '+${JSON.stringify(section)});button.click();
            }
          })()`);
          await evaluate(cdp,`new Promise(r=>setTimeout(r,300))`);
          await evaluate(cdp,`(()=>{document.querySelector('.provider-profile-overlay')?.scrollTo(0,0);window.scrollTo(0,0)})()`);
          const image=await cdp.send('Page.captureScreenshot',{format:'png'});
          await writeFile(`${output}/${record.kind}-${viewport.width}-${section}.png`,Buffer.from(image.result.data,'base64'));
          if(viewport.width===390 && ['equipment','evidence'].includes(section)){
            await evaluate(cdp,`document.querySelector('[data-testid="profile-section-intro"]')?.scrollIntoView({block:'start'})`);
            const detailImage=await cdp.send('Page.captureScreenshot',{format:'png'});
            await writeFile(`${output}/${record.kind}-${viewport.width}-${section}-content.png`,Buffer.from(detailImage.result.data,'base64'));
          }
          const check=await evaluate(cdp,`(()=>{const p=document.querySelector('main.profile-workspace');return {section:${JSON.stringify(section)},width:p.clientWidth,scrollWidth:p.scrollWidth,document:document.documentElement.scrollWidth}})()`);
          console.log(check);
          if(check.scrollWidth>check.width+2 || check.document>viewport.width+2)throw Error('Horizontal profile overflow '+JSON.stringify(check));
          if(process.env.CAPTURE_VERIFY_ACTIONS==='1' && record.kind==='ems' && viewport.width===390 && section==='evidence'){
            for(const [index,action] of ['review','confirm','flag','note','correct'].entries()){
              await evaluate(cdp,`(()=>{
                const set=(selector,value)=>{
                  const el=document.querySelector(selector);if(!el)throw Error('Missing review control '+selector);
                  const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
                  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
                  el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
                };
                set('[data-testid="fact-review-action"]',${JSON.stringify(action)});
              })()`);
              await evaluate(cdp,`(()=>{
                const set=(selector,value)=>{
                  const el=document.querySelector(selector);if(!el)throw Error('Missing review control '+selector);
                  const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
                  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));
                };
                set('[data-testid="fact-review-reviewer"]','Isolated browser QA');
                set('[data-testid="fact-review-method"]','Automated UI branch check');
                set('[data-testid="fact-review-note"]','QA-only review; no underlying agency change');
                ${action==='correct'?`set('[data-testid="fact-review-correction"]','QA-only corrected model');`:''}
              })()`);
              await evaluate(cdp,`document.querySelector('[data-testid="save-fact-review"]').click()`);
              await waitFor(cdp,`JSON.parse(localStorage.getItem('ems_agency_fact_reviews_v1')||'[]').length===${index+1}`,'saved '+action+' review');
              const stored=await evaluate(cdp,`JSON.parse(localStorage.getItem('ems_agency_fact_reviews_v1'))`);
              if(stored.at(-1).action!==action || stored.some(e=>e.fieldId!=='monitor.model'))throw Error('Review action or individual-field isolation failed');
              console.log('PASS saved individual review action:',action);
            }
            await evaluate(cdp,`localStorage.removeItem('ems_agency_fact_reviews_v1')`);
            console.log('PASS cleaned only the isolated review store');
          }
          if(process.env.CAPTURE_VERIFY_ACTIONS==='1' && record.kind==='ems' && viewport.width===390 && section==='equipment'){
            await evaluate(cdp,`document.querySelector('[data-testid="button-brief-open-sources"]').click()`);
            await waitFor(cdp,`Boolean(document.querySelector('#profile-source-evidence'))`,'Equipment Sources destination');
            console.log('PASS Equipment Sources opens actual Evidence/source workspace');
          }
        }
      }
    }
  }
} finally {
  cdp?.close(); browser.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,300)); await rm(userDataDir,{recursive:true,force:true});
}
