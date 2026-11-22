import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.PROFILE_HELPERS_ONLY='1';
const {createCdpClient,evaluate,waitFor,reservePort,waitForJson,clickVisibleButton}=await import('./check-profile-overflow.mjs');
const production=process.env.MOBILE_AUDIT_TARGET==='production';
const output=process.env.MOBILE_AUDIT_OUTPUT||'generated-artifacts/mobile-polish';
const usesMobileShell=(width,height)=>width<768||(width<=1023&&height<=500);
await mkdir(output,{recursive:true});
let server;
let serveUpdate=false;
let url=process.env.MOBILE_AUDIT_URL||'http://127.0.0.1:80/';
if(production){
  const root=path.resolve('artifacts/ems-territory-intelligence/dist/public');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname.startsWith('/api/')){
        const upstream=await fetch(`http://127.0.0.1:80${req.url}`);
        res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')||'application/json'});
        res.end(Buffer.from(await upstream.arrayBuffer()));return;
      }
      let file=path.resolve(root,`.${decodeURIComponent(pathname)}`);
      if(!file.startsWith(`${root}/`)&&file!==root){res.writeHead(403).end();return;}
      if(pathname==='/'||!path.extname(file))file=path.join(root,'index.html');
      if(pathname==='/sw.js'&&serveUpdate){
        const source=await readFile(file,'utf8');
        res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
        res.end(source.replace('ems-territory-shell-v4','ems-territory-shell-v4-qa'));return;
      }
      const data=await readFile(file);
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(data);
    }catch{res.writeHead(404).end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/`;
}
const port=await reservePort();
const profile=await mkdtemp(path.join(os.tmpdir(),'mobile-pwa-check-'));
const browser=spawn('chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let cdp;
const findings=[];
try{
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  cdp=createCdpClient(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');
  const capture=async(name,width,height)=>{
    await evaluate(cdp,`new Promise(r=>setTimeout(r,250))`);
    const size=await evaluate(cdp,`({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,height:innerHeight})`);
    assert.ok(size.scroll<=size.width+1,`${name}: page overflow ${JSON.stringify(size)}`);
    if(usesMobileShell(width,height)&&!(await evaluate(cdp,`Boolean(document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))`))){
      if(name==='home'){
        const layout=await evaluate(cdp,`(()=>{const rect=s=>document.querySelector(s)?.getBoundingClientRect();const viewport=rect('.home-map-viewport');const region=rect('.home-map-region-filter');const status=rect('[data-testid^="home-directory-status-"]');const regionButtons=[...document.querySelectorAll('.home-map-region-filter button')].map(button=>{const b=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button);const text=[...range.getClientRects()];return{label:button.innerText.trim(),left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height,textFits:text.every(r=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1)}});const chooseState=rect('.home-map-phone-actions button:first-child');const options=rect('.home-map-phone-actions button[aria-controls="home-map-options"]');const browse=rect('.home-map-browse-toggle');return{viewport:viewport&&{top:viewport.top,bottom:viewport.bottom,width:viewport.width,height:viewport.height},statusTop:status?.top,region:region&&{top:region.top,bottom:region.bottom},regionButtons,chooseState:chooseState&&{top:chooseState.top,bottom:chooseState.bottom,height:chooseState.height},options:options&&{top:options.top,bottom:options.bottom,height:options.height},browse:browse&&{height:browse.height},pageHeight:document.documentElement.scrollHeight};})()`);
        assert.ok(layout.viewport&&layout.viewport.width>0&&layout.viewport.height>=Math.max(140,width*.45),`${name}: the map is not prominent at ${width}px: ${JSON.stringify(layout)}`);
        assert.ok(layout.statusTop===undefined||layout.viewport.top<layout.statusTop,`${name}: directory loading state displaced the map at ${width}px: ${JSON.stringify(layout)}`);
        assert.ok(layout.regionButtons[0]?.height>=44,`${name}: region controls are too small at ${width}px`);
        assert.ok(layout.regionButtons.length===5&&layout.regionButtons.every(button=>button.height>=44&&button.textFits),`${name}: region labels are clipped at ${width}px: ${JSON.stringify(layout.regionButtons)}`);
        assert.ok(layout.regionButtons.every((button,index)=>layout.regionButtons.slice(index+1).every(other=>button.right<=other.left+1||other.right<=button.left+1||button.bottom<=other.top+1||other.bottom<=button.top+1)),`${name}: region labels overlap at ${width}px: ${JSON.stringify(layout.regionButtons)}`);
        assert.ok(layout.region.bottom<=layout.viewport.top+1,`${name}: region control overlaps the map at ${width}px`);
        assert.ok(layout.chooseState?.height>=44&&layout.options?.height>=44,`${name}: state or map-options action is too small at ${width}px`);
        assert.ok(layout.region.bottom<=layout.chooseState.top+1,`${name}: region control overlaps map actions at ${width}px`);
        assert.ok(layout.options.bottom<=layout.viewport.top+1,`${name}: map-options control overlaps the map at ${width}px`);
        assert.ok(layout.browse?.height>=44,`${name}: browse actions are not reachable at ${width}px`);
      }
      const previousScroll=await evaluate(cdp,`window.scrollY`);
      await evaluate(cdp,`(()=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});})()`);
      await waitFor(cdp,`(()=>{const nav=document.querySelector('nav[aria-label="Mobile primary workspaces"]');const main=document.querySelector('main.workspace-grid-shell');if(!nav||!main)return false;const navTop=nav.getBoundingClientRect().top;const flow=[...main.children].filter(el=>getComputedStyle(el).position==='static'&&el.getBoundingClientRect().height>0);const contentBottom=Math.max(0,...flow.map(el=>el.getBoundingClientRect().bottom));return contentBottom<=navTop+1;})()`,`page end clears bottom navigation at ${width}px`,3000);
      const clearance=await evaluate(cdp,`(()=>{const nav=document.querySelector('nav[aria-label="Mobile primary workspaces"]');const main=document.querySelector('main.workspace-grid-shell');if(!nav||!main)return null;const navTop=nav.getBoundingClientRect().top;const flow=[...main.children].filter(el=>getComputedStyle(el).position==='static'&&el.getBoundingClientRect().height>0);const contentBottom=Math.max(0,...flow.map(el=>el.getBoundingClientRect().bottom));return{navTop,contentBottom,scrollTop:scrollY,scrollHeight:document.documentElement.scrollHeight};})()`);
      assert.ok(clearance,`${name}: mobile navigation or page content is missing`);
      assert.ok(clearance.contentBottom<=clearance.navTop+1,`${name}: page end is hidden behind bottom navigation ${JSON.stringify(clearance)}`);
      await evaluate(cdp,`window.scrollTo(0,${previousScroll})`);
    }
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${output}/${production?'production':'preview'}-${width}-${height}-${name}.png`,Buffer.from(shot.result.data,'base64'));
    findings.push({name,width,height,...size});
    console.log('PASS',name,width,height,`content ${size.scroll}/${size.width}px`);
  };
  const openMore=async()=>evaluate(cdp,`(()=>{const d=document.querySelector('nav[aria-label="Mobile primary workspaces"] .pi-mobile-more');if(!d)return false;if(!d.open)d.querySelector('summary')?.click();return d.open;})()`);
  const navigate=async(label)=>{
    if(label==='More'){
      assert.ok(await openMore(),'More destinations menu is unavailable');
    }else if(['Opportunities','Territory','Settings'].includes(label) && await evaluate(cdp,`Boolean(document.querySelector('nav[aria-label="Mobile primary workspaces"] .pi-mobile-more'))`)){
      assert.ok(await openMore(),'More destinations menu is unavailable');
      const destination=label==='Opportunities'?'Contracts':label==='Territory'?'Directory':'Settings';
      const selected=await evaluate(cdp,`(()=>{const b=[...document.querySelectorAll('.pi-mobile-more__link')].find(item=>item.innerText.trim()===${JSON.stringify(destination)});if(!b)return false;b.click();return true;})()`);
      assert.ok(selected,`Missing ${destination} in More destinations`);
    }else{
      const clicked=await evaluate(cdp,`(()=>{const b=document.querySelector('nav[aria-label="Mobile primary workspaces"] [aria-label=${JSON.stringify(label)}]');if(b&&b.getBoundingClientRect().height){b.click();return true;}return false;})()`);
      if(!clicked){
        const fallback=await evaluate(cdp,`(()=>{const label=${JSON.stringify(label.toLowerCase())};const b=[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().height&&((b.getAttribute('aria-label')||'').toLowerCase()===label||(label==='field work'&&b.innerText.trim().toLowerCase().startsWith(label))));if(b){b.click();return true;}return false;})()`);
        if(!fallback)await clickVisibleButton(cdp,label);
      }
    }
    await evaluate(cdp,`new Promise(r=>setTimeout(r,500))`);
  };
  const viewports=JSON.parse(process.env.MOBILE_VIEWPORTS||(production?'[{"width":390,"height":844}]':'[{"width":320,"height":740},{"width":390,"height":844},{"width":430,"height":932},{"width":667,"height":375},{"width":844,"height":390},{"width":1366,"height":768}]'));
  for(const {width,height} of viewports){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<1024,maxTouchPoints:1});
    await cdp.send('Page.navigate',{url});
    await waitFor(cdp,`Boolean(document.querySelector('[aria-label="Interactive U.S. Territory Map"]'))`,'Home map',60000);
    await evaluate(cdp,`(()=>{const style=document.createElement('style');style.textContent='*{scroll-behavior:auto!important;animation:none!important;transition:none!important}';document.head.appendChild(style)})()`);
    await capture('home',width,height);
    if(usesMobileShell(width,height)){
      if(width<768){
        const browser=await evaluate(cdp,`(()=>{const d=document.querySelector('.phone-state-browser');return d?{exists:true,open:d.open,summaryHeight:d.querySelector('summary')?.getBoundingClientRect().height}:null})()`);
        assert.ok(browser?.exists&&!browser.open&&browser.summaryHeight>=44,`State browser should start compact and remain accessible at ${width}px: ${JSON.stringify(browser)}`);
        await evaluate(cdp,`document.querySelector('.phone-state-browser summary').click()`);
        await waitFor(cdp,`Boolean(document.querySelector('#phone-state-search'))&&document.querySelector('#phone-state-search').getBoundingClientRect().height>=40`,'expanded state search');
        await evaluate(cdp,`(()=>{const input=document.querySelector('#phone-state-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'CA');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await waitFor(cdp,`document.querySelectorAll('.phone-state-browser-results [data-state-code]').length===1`,'exact state abbreviation search');
        const abbreviationMatches=await evaluate(cdp,`[...document.querySelectorAll('.phone-state-browser-results [data-state-code]')].map(button=>button.dataset.stateCode)`);
        assert.deepEqual(abbreviationMatches,['CA'],`State abbreviation should not match unrelated names at ${width}px`);
        await evaluate(cdp,`(()=>{const input=document.querySelector('#phone-state-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'ZZ');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await waitFor(cdp,`Boolean(document.querySelector('.phone-state-empty button'))`,'state search recovery action');
        await evaluate(cdp,`document.querySelector('.phone-state-empty button').click()`);
        await waitFor(cdp,`document.querySelector('#phone-state-search')?.value===''&&document.querySelectorAll('.phone-state-browser-results [data-state-code]').length===51`,'clear state search recovery');
        await evaluate(cdp,`(()=>{const input=document.querySelector('#phone-state-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'CA');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await waitFor(cdp,`document.querySelectorAll('.phone-state-browser-results [data-state-code]').length===1`,'restore California search');
        await evaluate(cdp,`document.querySelector('.phone-state-browser-results [data-state-code="CA"]').click()`);
        await waitFor(cdp,`document.querySelector('.home-state-details[open] #home-state-detail-title')?.textContent==='California'`,'selected-state details');
        const selectedState=await evaluate(cdp,`(()=>({code:document.querySelector('[data-testid="mobile-selected-state"]')?.getAttribute('aria-label'),mapSelected:Boolean(document.querySelector('.home-map-state-path[data-state-code="CA"].is-selected'))}))()`);
        assert.ok(selectedState.code==='Selected state: California'&&selectedState.mapSelected,`Selected-state feedback is missing at ${width}px: ${JSON.stringify(selectedState)}`);
        await evaluate(cdp,`document.querySelector('.home-state-details .home-state-picker-heading button').click()`);
        await waitFor(cdp,`!document.querySelector('.home-state-details[open]')`,'close state details');
        assert.ok(await evaluate(cdp,`Boolean(document.querySelector('[data-testid="mobile-selected-state"] button'))`),`Selected state action is missing after closing details at ${width}px`);
      }
      const mapOptionsClicked=await evaluate(cdp,`(()=>{const b=document.querySelector('.home-map-phone-actions button[aria-controls="home-map-options"]');if(!b)return false;b.click();return true;})()`);
      assert.ok(mapOptionsClicked,`Map options button is missing at ${width}px`);
      await waitFor(cdp,`document.querySelector('.home-map-phone-actions button[aria-controls="home-map-options"]')?.getAttribute('aria-expanded')==='true'`,'map options open');
      await evaluate(cdp,`new Promise(resolve=>setTimeout(resolve,50))`);
      const mapOptions=await evaluate(cdp,`(()=>{const panel=document.querySelector('#home-map-options');const metric=document.querySelector('#home-state-map-metric');const map=document.querySelector('.home-map-viewport');const p=panel.getBoundingClientRect(),m=metric.getBoundingClientRect(),v=map.getBoundingClientRect();return{open:panel.dataset.mobileOpen,metricHeight:m.height,metricTop:m.top,metricBottom:m.bottom,mapTop:v.top,mapBottom:v.bottom};})()`);
      assert.equal(mapOptions.open,'true',`Map options panel failed to open at ${width}px`);
      assert.ok(mapOptions.metricHeight>=44&&(mapOptions.metricBottom<=mapOptions.mapTop+1||mapOptions.metricTop>=mapOptions.mapBottom-1),`Map options are clipped or overlap the map at ${width}px: ${JSON.stringify(mapOptions)}`);
      await evaluate(cdp,`document.querySelector('.home-map-phone-actions button[aria-controls="home-map-options"]').click()`);
      const mapActions=await evaluate(cdp,`(async()=>{const regionButtons=[...document.querySelectorAll('.home-map-region-filter button')];const south=regionButtons.find(button=>button.innerText.trim()==='South');const all=regionButtons.find(button=>button.innerText.trim()==='All');if(!south||!all)return null;south.click();await new Promise(resolve=>setTimeout(resolve,50));const regionChanged=south.getAttribute('aria-pressed')==='true';all.click();await new Promise(resolve=>setTimeout(resolve,50));const browse=document.querySelector('.home-map-browse-toggle');browse?.click();const national=[...document.querySelectorAll('.home-map-heading-actions button')].find(button=>button.innerText.trim()==='National view');national?.click();await new Promise(resolve=>setTimeout(resolve,50));const regionReset=[...document.querySelectorAll('.home-map-region-filter button')].find(button=>button.innerText.trim()==='All')?.getAttribute('aria-pressed')==='true';const browseClosed=browse?.getAttribute('aria-expanded')==='false';return{regionChanged,regionReset,nationalAction:Boolean(national),browseClosed};})()`);
      assert.ok(mapActions?.regionChanged&&mapActions.regionReset&&mapActions.nationalAction&&mapActions.browseClosed,`Map region or National view action failed: ${JSON.stringify(mapActions)}`);
    }
    if(production){
      assert.equal(await evaluate(cdp,`Boolean(document.querySelector('.pwa-status-banner'))`),false,'update notice should be hidden before an update is available');
      await waitFor(cdp,`Boolean(navigator.serviceWorker.controller)`,'production service worker control',30000);
      const cached=await evaluate(cdp,`(async()=>{const names=await caches.keys();const key=names.find(k=>k.startsWith('ems-territory-shell-v4'));if(!key)throw Error('No current app shell cache');const c=await caches.open(key);return {names,urls:(await c.keys()).map(r=>r.url),manifest:await fetch('manifest.webmanifest').then(r=>r.json())};})()`);
      assert.ok(cached.names.some(key=>key.startsWith('ems-territory-shell-v4')));
      assert.ok(cached.urls.some(u=>u.includes('pwa-180.png')));
      assert.equal(cached.manifest.display,'standalone');
      assert.ok(cached.urls.every(u=>!new URL(u).pathname.startsWith('/api/')),'live APIs must not be cached');
      await evaluate(cdp,`localStorage.setItem('mobile-pwa-qa-marker','preserve-me')`);
      const onlineBoot=await evaluate(cdp,`performance.timeOrigin`);
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      await cdp.send('Page.reload',{ignoreCache:true});
      await waitFor(cdp,`performance.timeOrigin>${onlineBoot}`,'offline launch opened a new document',30000);
      await waitFor(cdp,`Boolean(document.querySelector('[aria-label="Interactive U.S. Territory Map"]'))`,'offline cached launch',30000);
      assert.equal(await evaluate(cdp,`localStorage.getItem('mobile-pwa-qa-marker')`),'preserve-me');
      await navigate('More');
      await navigate('Settings');
      await waitFor(cdp,`document.querySelector('[data-testid="pwa-controls"]')?.innerText.includes('Offline')`,'offline status in More');
      await capture('offline-more',width,height);
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      serveUpdate=true;
      await evaluate(cdp,`(async()=>{await(await navigator.serviceWorker.getRegistration()).update();})()`);
      await waitFor(cdp,`Boolean(document.querySelector('[data-testid="button-update-pwa"]'))`,'waiting update action',30000);
      await navigate('Map');
      await waitFor(cdp,`Boolean(document.querySelector('.pwa-status-banner'))`,'update notice on the map');
      await capture('update-notice',width,height);
      await navigate('More');
      await navigate('Settings');
      await evaluate(cdp,`(()=>{window.dispatchEvent(new CustomEvent('agency-profile-review-dirty',{detail:true}));document.querySelector('[data-testid="button-update-pwa"]').click();})()`);
      await waitFor(cdp,`document.querySelector('[data-testid="pwa-controls"]')?.innerText.includes('unfinished fact review')`,'unsaved review update guard');
      await capture('update-review-guard',width,height);
      await evaluate(cdp,`window.dispatchEvent(new CustomEvent('agency-profile-review-dirty',{detail:false}))`);
      for(const accept of [false,true]){
        const boot=await evaluate(cdp,`performance.timeOrigin`);
        await evaluate(cdp,`setTimeout(()=>document.querySelector('[data-testid="button-update-pwa"]').click(),100);true`);
        await new Promise(resolve=>setTimeout(resolve,250));
        await cdp.send('Page.handleJavaScriptDialog',{accept});
        if(!accept){
          assert.equal(await evaluate(cdp,`localStorage.getItem('mobile-pwa-qa-marker')`),'preserve-me');
          assert.ok(await evaluate(cdp,`(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting))()`),'canceled update remains waiting');
        }else{
          await waitFor(cdp,`performance.timeOrigin>${boot}`,'explicit update caused a new document',30000);
          await waitFor(cdp,`Boolean(document.querySelector('[aria-label="Interactive U.S. Territory Map"]'))`,'updated app reload',30000);
          assert.equal(await evaluate(cdp,`localStorage.getItem('mobile-pwa-qa-marker')`),'preserve-me');
          const keys=await evaluate(cdp,`caches.keys()`);
          assert.ok(keys.some(key=>key.startsWith('ems-territory-shell-v4-qa')));
        }
      }
      await evaluate(cdp,`localStorage.removeItem('mobile-pwa-qa-marker')`);
      assert.equal(await evaluate(cdp,`Boolean(document.querySelector('.pwa-status-banner'))`),false,'update notice should clear after the new worker activates');
      findings.push({productionWorker:'activated',offlineLaunch:'passed',localDataPreserved:true,unsavedReviewGuard:'passed',updateCancel:'passed',updateReload:'passed',cachedAssets:cached.urls.length});
      continue;
    }
    for(const label of ['Agencies','Opportunities','Territory','Field work']){
      await navigate(label);
      await capture(label.toLowerCase().replaceAll(' ','-'),width,height);
      if(label==='Territory'&&(width<768||width===844)){
        await waitFor(cdp,`Boolean(document.querySelector('[data-testid="input-county-search"],[aria-label="Inspect Florida counties"]'))||[...document.querySelectorAll('button')].some(b=>/Florida counties/i.test(b.innerText))`,'county navigation ready',60000);
        await evaluate(cdp,`(()=>{if(document.querySelector('[data-testid="input-county-search"]'))return;const back=[...document.querySelectorAll('button')].find(b=>/Florida counties/i.test(b.innerText));if(back)back.click();else document.querySelector('[aria-label="Inspect Florida counties"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()`);
        await waitFor(cdp,`Boolean(document.querySelector('[data-testid="input-county-search"]'))`,'state county directory',30000);
        await capture('state-counties',width,height);
        await evaluate(cdp,`document.querySelector('[data-testid^="row-county-signals-"] button')?.click()`);
        await waitFor(cdp,`Boolean(document.querySelector('[data-testid="button-provider-view-table"]'))`,'county providers',30000);
        await capture('county-providers',width,height);
        await evaluate(cdp,`document.querySelector('[data-testid="button-provider-view-table"]').click()`);
        await capture('county-provider-list',width,height);
        for(const [label,id,canvas] of [
          ['Agency locations','workspace-google-map','.gmap-frame'],
          ['Fleet & response map','workspace-fleet-map','.fleet-map-canvas'],
        ]){
          const reached=await evaluate(cdp,`(()=>{const b=[...document.querySelectorAll('nav[aria-label="Territory views"] button')].find(b=>b.innerText.trim()===${JSON.stringify(label)});if(!b)return false;b.scrollIntoView({block:'center',inline:'center'});b.click();return true;})()`);
          assert.ok(reached,`Missing ${label} workspace control`);
          await waitFor(cdp,`Boolean(document.querySelector('[data-testid="${id}"]'))`,label,30000);
          await waitFor(cdp,`Boolean(document.querySelector('${canvas}'))`,label+' canvas',30000);
          if(id==='workspace-google-map')await waitFor(cdp,`Boolean(document.querySelector('[data-testid="button-gmap-fit-area"]'))`,'live map controls',30000);
          await evaluate(cdp,`document.querySelector('${canvas}').scrollIntoView({block:'center'})`);
          await capture(id,width,height);
          const rect=await evaluate(cdp,`document.querySelector('${canvas}').getBoundingClientRect().toJSON()`);
          assert.ok(rect.height<=height,`${label} canvas exceeds screen height: ${rect.height}`);
          if(id==='workspace-fleet-map'&&width>=360){
            await evaluate(cdp,`document.querySelector('.fleet-map-controls button').click()`);
            await evaluate(cdp,`new Promise(r=>setTimeout(r,100))`);
            const before=await evaluate(cdp,`document.querySelector('[data-testid="gis-map-svg"] g[transform*="scale("]')?.getAttribute('transform')`);
            const point=await evaluate(cdp,`(()=>{const svg=document.querySelector('[data-testid="gis-map-svg"]');const r=svg.getBoundingClientRect();for(const [dx,dy]of [[.72,.78],[.75,.6],[.65,.8],[.8,.4]]){const p={x:r.x+r.width*dx,y:r.y+r.height*dy};if(svg.contains(document.elementFromPoint(p.x,p.y)))return p;}throw Error('No unobstructed map gesture target');})()`);
            assert.ok(point.y>0&&point.y+15<height&&point.x>0&&point.x+40<width,`Touch target is outside visible map: ${JSON.stringify(point)}`);
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+40,y:point.y+15}]});
            await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
            await waitFor(cdp,`document.querySelector('[data-testid="gis-map-svg"] g[transform*="scale("]')?.getAttribute('transform')!==${JSON.stringify(before)}`,'touch panning changed map position');
            findings.push({width,height,touchMapPan:'passed'});
          }
        }
      }
    }
    if(usesMobileShell(width,height)){
      await navigate('More');
      const menu=await evaluate(cdp,`(()=>{const d=document.querySelector('.pi-mobile-more');return{open:Boolean(d?.open),links:[...document.querySelectorAll('.pi-mobile-more__link')].length};})()`);
      assert.ok(menu.open&&menu.links>=10,`More destinations menu incomplete: ${JSON.stringify(menu)}`);
      await capture('more-menu',width,height);
      await evaluate(cdp,`document.querySelector('.pi-mobile-more')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      assert.equal(await evaluate(cdp,`Boolean(document.querySelector('.pi-mobile-more[open]'))`),false,'Escape closes the More destinations menu');
      await navigate('More');
      await navigate('Settings');
      await waitFor(cdp,`Boolean(document.querySelector('[data-testid="pwa-controls"]'))`,'PWA controls under More > Settings');
      const installState=await evaluate(cdp,`(()=>{const help=document.querySelector('[data-testid="button-pwa-install-help"]');if(help){help.click();return{mode:'help',expanded:help.getAttribute('aria-expanded')};}return{mode:document.querySelector('[data-testid="button-install-pwa"]')?'install-prompt-ready':'unavailable'};})()`);
      assert.notEqual(installState.mode,'unavailable','Settings should explain installation or expose the browser install prompt');
      await capture(installState.mode==='help'?'install-help':'install-prompt-ready',width,height);
      if(installState.mode==='help'){
        const close=await evaluate(cdp,`(async()=>{const b=document.querySelector('[data-testid="button-pwa-install-help"]');if(!b)return false;b.click();await new Promise(resolve=>setTimeout(resolve,50));return b.getAttribute('aria-expanded')==='false';})()`);
        assert.ok(close,'PWA install help can be collapsed again');
      }
    }
  }
  await writeFile(`${output}/${production?'production':'preview'}-results.json`,JSON.stringify(findings,null,2));
  console.log(JSON.stringify(findings,null,2));
}finally{
  cdp?.close();browser.kill('SIGTERM');
  if(server)await new Promise(resolve=>server.close(resolve));
  await new Promise(resolve=>setTimeout(resolve,150));
  await rm(profile,{recursive:true,force:true});
}
