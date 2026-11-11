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
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${output}/${production?'production':'preview'}-${width}-${height}-${name}.png`,Buffer.from(shot.result.data,'base64'));
    findings.push({name,width,height,...size});
    console.log('PASS',name,width,height,`content ${size.scroll}/${size.width}px`);
  };
  const navigate=async(label)=>{
    const clicked=await evaluate(cdp,`(()=>{const b=document.querySelector('nav[aria-label="Mobile primary workspaces"] button[aria-label=${JSON.stringify(label)}]');if(b&&b.getBoundingClientRect().height){b.click();return true;}return false;})()`);
    if(!clicked){
      const fallback=await evaluate(cdp,`(()=>{const label=${JSON.stringify(label.toLowerCase())};const b=[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().height&&((b.getAttribute('aria-label')||'').toLowerCase()===label||(label==='field work'&&b.innerText.trim().toLowerCase().startsWith(label))));if(b){b.click();return true;}return false;})()`);
      if(!fallback)await clickVisibleButton(cdp,label);
    }
    await evaluate(cdp,`new Promise(r=>setTimeout(r,500))`);
  };
  const viewports=production?[{width:390,height:844}]:JSON.parse(process.env.MOBILE_VIEWPORTS||'[{"width":375,"height":812},{"width":390,"height":844},{"width":430,"height":932},{"width":844,"height":390},{"width":1366,"height":768}]');
  for(const {width,height} of viewports){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<1024,maxTouchPoints:1});
    await cdp.send('Page.navigate',{url});
    await waitFor(cdp,`Boolean(document.querySelector('[aria-label="Interactive U.S. Territory Map"]'))`,'Home map',60000);
    await evaluate(cdp,`(()=>{const style=document.createElement('style');style.textContent='*{scroll-behavior:auto!important;animation:none!important;transition:none!important}';document.head.appendChild(style)})()`);
    await capture('home',width,height);
    if(production){
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
      await waitFor(cdp,`document.querySelector('[data-testid="pwa-controls"]')?.innerText.includes('Offline')`,'offline status in More');
      await capture('offline-more',width,height);
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      serveUpdate=true;
      await evaluate(cdp,`(async()=>{await(await navigator.serviceWorker.getRegistration()).update();})()`);
      await waitFor(cdp,`Boolean(document.querySelector('[data-testid="button-update-pwa"]'))`,'waiting update action',30000);
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
      findings.push({productionWorker:'activated',offlineLaunch:'passed',localDataPreserved:true,unsavedReviewGuard:'passed',updateCancel:'passed',updateReload:'passed',cachedAssets:cached.urls.length});
      continue;
    }
    for(const label of ['Agencies','Opportunities','Territory','Field work']){
      await navigate(label);
      await capture(label.toLowerCase().replaceAll(' ','-'),width,height);
      if(label==='Territory'&&[390,844].includes(width)){
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
          if(id==='workspace-fleet-map'){
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
    if(width<768){
      await navigate('More');
      await waitFor(cdp,`Boolean(document.querySelector('[data-testid="pwa-controls"]'))`,'PWA controls in More');
      await evaluate(cdp,`document.querySelector('[data-testid="button-pwa-install-help"]')?.click()`);
      await capture('more-install-help',width,height);
      const close=await evaluate(cdp,`(()=>{const b=document.querySelector('button[aria-label="Close more tools"]');if(b){b.click();return true;}return false;})()`);
      assert.ok(close,'More close control is reachable');
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
