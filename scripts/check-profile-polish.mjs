/** Focused, read-only profile presentation check. Never submits or changes agency facts. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PROFILE_HELPERS_ONLY = '1';
const { createCdpClient, evaluate, waitFor, reservePort, waitForJson } = await import('./check-profile-overflow.mjs');
const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:80/';
const equipmentTextOnly = process.env.PROFILE_POLISH_EQUIPMENT_TEXT_ONLY === '1';
const out = process.env.PROFILE_POLISH_OUTPUT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../generated-artifacts/profile-polish');
const equipmentStressCases = [
  { key: 'monitor', value: 'Stryker LIFEPAK 15 V4.2 critical care monitor with integrated capnography', quantity: '0 units', missingQuantity: false },
  { key: 'cpr', value: 'ZOLL AutoPulse NXT integrated load-distributing band mechanical CPR system', quantity: 'Units not reported', missingQuantity: true },
  { key: 'vent', value: 'Hamilton T1 transport ventilator with integrated oxygen monitoring and alarms', quantity: '0 units', missingQuantity: false },
  { key: 'epcrcad', value: 'ESO electronic patient care reporting and computer-aided dispatch platform' },
  { key: 'dispatch', value: 'Motorola Solutions PremierOne computer-aided dispatch and records suite' },
  { key: 'billing', value: 'ImageTrend Continuum EMS billing and revenue-cycle management software' },
];
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
    if (!equipmentTextOnly) {
      assert.equal(await ev(`document.querySelector('[data-testid="profile-record-context"]').open`),false,'Secondary record metadata starts collapsed');
      await ev(`document.querySelector('[data-testid="profile-record-context"] summary').click()`);
      assert.equal(await ev(`document.querySelector('[data-testid="text-profile-source-period"]').getBoundingClientRect().height>0`),true,'Record metadata remains available');
      await ev(`document.querySelector('[data-testid="profile-record-context"] summary').click()`);
      // The header action must follow the moved preparation content.
      await ev(`document.querySelector('[data-testid="button-profile-prepare-meeting"]').click()`);
      await waitFor(cdp, `Boolean(document.querySelector('[data-testid="profile-deal-story"]'))`, 'Visit plan preparation action', 10000);
      await ev(`document.querySelector('[data-testid="tab-profile-overview"]').click()`);
    }
    await settleProfileScroll();
    for (const topic of process.env.PROFILE_POLISH_TOPICS?.split(',') || (equipmentTextOnly || process.env.PROFILE_POLISH_HEADER_ONLY ? ['overview'] : ['overview', 'equipment', 'purchasing', 'decision_makers', 'activity', 'operations', 'medicare', 'meeting', 'deal_story', 'evidence'])) {
      if (topic !== 'overview') {
        await ev(`(()=>{const mobile=document.querySelector('.acp-nav-select');if(mobile&&getComputedStyle(mobile).display!=='none'){mobile.value=${JSON.stringify(topic)};mobile.dispatchEvent(new Event('change',{bubbles:true}));return}const tab=document.querySelector('[data-testid="tab-profile-${topic}"]');if(tab){tab.click();return}const more=document.querySelector('[aria-label="Additional account detail"]');if(!more)throw Error('Missing profile topic selector for '+${JSON.stringify(topic)});more.value=${JSON.stringify(topic)};more.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await settleProfileScroll();
      }
      if (equipmentTextOnly && topic === 'overview') {
        await ev(`(()=>{
          const root=document.querySelector('[data-testid="profile-command-overview"]');
          // Emulate browser text enlargement without page zoom or persisted changes.
          const textElements=[...root.querySelectorAll('*')].filter(e=>!e.closest('svg')&&e.getClientRects().length);
          const originalSizes=textElements.map(e=>parseFloat(getComputedStyle(e).fontSize)||16);
          textElements.forEach((e,i)=>e.style.setProperty('font-size',originalSizes[i]*1.35+'px','important'));
          const cases=${JSON.stringify(equipmentStressCases)};
          for(const item of cases){
            const row=root.querySelector('[data-testid="row-overview-equipment-'+item.key+'"]');
            if(!row)throw Error('Missing equipment category '+item.key);
            const value=item.key==='monitor'?root.querySelector('[data-testid="text-overview-monitor-model"]'):row.querySelector('.acp-ledger-value');
            if(!value)throw Error('Missing equipment value '+item.key);
            value.textContent=item.value;
            if(item.quantity){
              const quantity=item.key==='monitor'?root.querySelector('[data-testid="text-overview-monitor-quantity"]'):row.querySelector('.acp-ledger-qty');
              if(!quantity)throw Error('Missing equipment quantity '+item.key);
              quantity.textContent=item.quantity;
              quantity.classList.toggle('is-missing',item.missingQuantity);
            }
          }
        })()`);
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
           activeTopic:root.querySelector('.acp-nav-select')?.value||root.querySelector('.acp-tab.is-active')?.getAttribute('data-section')||root.querySelector('[aria-label="Additional account detail"]')?.value,
          panelRole:root.querySelector('#profile-topic-panel')?.getAttribute('role'),
          panelLabel:(()=>{const panel=root.querySelector('#profile-topic-panel');const labelledBy=panel?.getAttribute('aria-labelledby');return panel?.getAttribute('aria-label')||(labelledBy?document.getElementById(labelledBy)?.textContent?.trim():null)})(),
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
       assert.equal(geometry.activeTopic, topic, 'Topic navigation must work');
      assert.equal(geometry.panelRole, 'tabpanel', 'Topic content is an accessible panel');
       assert.ok(geometry.panelLabel, 'Topic panel has an accessible name');
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
      if (equipmentTextOnly && topic === 'overview') {
        const presentation = await ev(`(()=>{
          const root=document.querySelector('.agency-command-profile');
          const ledger=root.querySelector('[data-testid="summary-equipment"]');
          const cases=${JSON.stringify(equipmentStressCases)};
          const failures=[];
          const measurements=[];
          for(const item of cases){
            const row=root.querySelector('[data-testid="row-overview-equipment-'+item.key+'"]');
            const value=item.key==='monitor'?root.querySelector('[data-testid="text-overview-monitor-model"]'):row?.querySelector('.acp-ledger-value');
            const quantity=item.quantity?(item.key==='monitor'?root.querySelector('[data-testid="text-overview-monitor-quantity"]'):row?.querySelector('.acp-ledger-qty')):null;
            if(!row||!value||value.textContent.trim()!==item.value)failures.push(item.key+' value missing');
            if(value&&value.scrollWidth>value.clientWidth+1)failures.push(item.key+' value clips horizontally');
            if(value){
              const r=value.getBoundingClientRect(), bounds=ledger.getBoundingClientRect();
              if(r.left<bounds.left-1||r.right>bounds.right+1)failures.push(item.key+' value leaves inventory bounds');
            }
            if(item.quantity&&(!quantity||quantity.textContent.trim()!==item.quantity||quantity.classList.contains('is-missing')!==item.missingQuantity))failures.push(item.key+' quantity state changed');
            if(quantity&&quantity.scrollWidth>quantity.clientWidth+1)failures.push(item.key+' quantity clips horizontally');
            measurements.push({category:item.key,valueWidth:value?.clientWidth??0,valueScroll:value?.scrollWidth??0,valueHeight:value?.getBoundingClientRect().height??0,quantityWidth:quantity?.clientWidth??null,quantityScroll:quantity?.scrollWidth??null});
          }
          const action=root.querySelector('[data-testid="summary-equipment-open"]');
          const actionRect=action.getBoundingClientRect(), ledgerRect=ledger.getBoundingClientRect();
          const actionText=action.innerText.trim();
          if(actionText!=='Details')failures.push('equipment action label is not readable');
          if(action.scrollWidth>action.clientWidth+1||actionRect.left<ledgerRect.left-1||actionRect.right>ledgerRect.right+1)failures.push('equipment action overflows inventory');
          const overviewActions=[...root.querySelectorAll('button[data-testid^="summary-"],button[data-testid^="button-gap-"],button[data-testid="button-overview-review-evidence"]')].filter(e=>e.getClientRects().length);
          const actionMeasurements=overviewActions.map(e=>{
            const r=e.getBoundingClientRect(), name=(e.getAttribute('aria-label')||e.innerText||'').trim();
            if(!name)failures.push('overview action has no readable name');
            if(e.scrollWidth>e.clientWidth+1||r.left<root.getBoundingClientRect().left-1||r.right>root.getBoundingClientRect().right+1)failures.push('overview action overflows: '+name);
            if(innerWidth<768&&r.height<44)failures.push('phone overview action is below 44px: '+name);
            return {name,width:r.width,height:r.height};
          });
          if(!ledger.textContent.includes('Inventory as recorded. Age and quantity describe the record, not condition, intent or buy-back eligibility.'))failures.push('inventory source caveat missing');
          if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)failures.push('page overflows viewport');
          if(root.scrollWidth>root.clientWidth+1)failures.push('profile overflows viewport');
          if(ledger.scrollWidth>ledger.clientWidth+1)failures.push('inventory overflows its container');
          const font=parseFloat(getComputedStyle(root.querySelector('[data-testid="text-overview-monitor-model"]')).fontSize);
          return {failures,measurements,actionMeasurements,font,viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,profile:root.clientWidth,profileScroll:root.scrollWidth,ledger:ledger.clientWidth,ledgerScroll:ledger.scrollWidth,actionHeight:actionRect.height,actionName:action.getAttribute('aria-label'),categories:root.querySelectorAll('[data-testid^="row-overview-equipment-"]').length};
        })()`);
        assert.equal(presentation.categories, 6, `${width}px: all six equipment categories remain present`);
        assert.equal(presentation.actionName, 'View equipment', `${width}px: equipment action keeps its accessible name`);
        assert.deepEqual(presentation.failures, [], `${width}px: enlarged equipment overview remains readable: ${JSON.stringify(presentation)}`);
        assert.ok(presentation.font >= 20, `${width}px: browser text enlargement is active (${presentation.font}px)`);
        await writeFile(`${out}/${width}-overview-enlarged-equipment.png`, Buffer.from((await cdp.send('Page.captureScreenshot', {format:'png'})).result.data, 'base64'));
        await ev(`document.querySelector('[data-testid="summary-equipment-open"]').click()`);
        await waitFor(cdp, `document.querySelector('[data-testid="tab-profile-equipment"]')?.getAttribute('aria-selected')==='true'`,'equipment action navigation',10000);
        await ev(`document.querySelector('[data-testid="tab-profile-overview"]').click()`);
        await waitFor(cdp, `document.querySelector('[data-testid="tab-profile-overview"]')?.getAttribute('aria-selected')==='true'`,'return to Overview',10000);
        console.log(`PASS enlarged equipment overview at ${width}px: ${JSON.stringify(presentation)}`);
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
    if (width > 1199) {
      await ev(`document.querySelector('.acp-tab.is-active').focus({preventScroll:true})`);
      await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Home',code:'Home'});
      await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Home',code:'Home'});
      await settleProfileScroll();
      assert.equal(await ev(`document.activeElement?.id`),'profile-tab-overview','Home key selects and focuses Overview');
      await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
      await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
      await settleProfileScroll();
      assert.equal(await ev(`document.activeElement?.id`),'profile-tab-deal_story','Arrow navigation follows the redesigned Visit plan tab order');
       assert.ok(await ev(`(()=>{const p=document.querySelector('#profile-topic-panel');return Boolean(p?.getAttribute('aria-label')?.trim()||p?.getAttribute('aria-labelledby')&&document.getElementById(p.getAttribute('aria-labelledby'))?.textContent?.trim())})()`),'Selected topic panel retains an accessible name');
    }
  }
  await writeFile(`${out}/${process.env.PROFILE_POLISH_HEADER_ONLY ? 'header-results' : 'results'}.json`, JSON.stringify(results, null, 2));
  console.log(`PASS profile polish: laptop/phone layouts, ${process.env.PROFILE_POLISH_TOPICS || (equipmentTextOnly ? 'enlarged equipment Overview' : process.env.PROFILE_POLISH_HEADER_ONLY ? 'header and phone tap targets' : 'ten profile topics')}, icons, retained section removal.`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 150));
  await rm(dir, { recursive: true, force: true });
}
