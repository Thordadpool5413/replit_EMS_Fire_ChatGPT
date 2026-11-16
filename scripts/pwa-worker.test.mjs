import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('artifacts/ems-territory-intelligence/public/sw.js','utf8');
function harness(bootAssets=[]) {
  const handlers={};const buckets=new Map();let skipped=0;let networkFails=false;let contentType='text/javascript';let body='built asset';
  const cacheFor=name=>{
    if(!buckets.has(name)) buckets.set(name,new Map());
    const data=buckets.get(name);
    return {addAll:async urls=>urls.forEach(url=>data.set(url,new Response('shell',{headers:{'content-type':'text/html'}}))),
      match:async request=>data.get(typeof request==='string'?request:request.url)?.clone(),
      put:async(request,response)=>{data.set(typeof request==='string'?request:request.url,response);}};
  };
  const caches={open:async name=>cacheFor(name),keys:async()=>[...buckets.keys()],delete:async key=>buckets.delete(key),
    match:async request=>{for(const key of buckets.keys()){const found=await cacheFor(key).match(request);if(found)return found;}}};
  const self={location:new URL('https://example.test/app/sw.js'),addEventListener:(name,fn)=>{handlers[name]=fn;},
    skipWaiting:()=>{skipped++;},clients:{claim:async()=>{}}};
  vm.runInNewContext(source.replace('/* BUILD_BOOT_ASSETS */ []',JSON.stringify(bootAssets)),{self,caches,URL,Response,console,fetch:async()=>{
    if(networkFails) throw Error('offline');
    const response=new Response(body,{headers:{'content-type':contentType}});
    Object.defineProperty(response,'type',{value:'basic'});return response;
  }});
  const run=async(name,extra={})=>{
    const pending=[];let response;
    handlers[name]({...extra,waitUntil:p=>pending.push(p),respondWith:p=>{response=p;}});
    const result=response?await response:undefined;
    await Promise.all(pending);return result;
  };
  return {run,buckets,cacheFor,html:()=>{contentType='text/html';body='<html>shell fallback</html>';},offline:()=>{networkFails=true;},skipped:()=>skipped};
}
test('shell install is scoped, includes the Apple icon and does not force-update active clients',async()=>{
  const h=harness();await h.run('install');
  const urls=[...h.buckets.values()][0];
  assert.ok(urls.has('https://example.test/app/pwa-180.png'));
  assert.ok(urls.has('https://example.test/app/manifest.webmanifest'));
  assert.ok([...urls.keys()].every(url=>url.startsWith('https://example.test/app/')));
  assert.equal(h.skipped(),0);
  await h.run('message',{data:{type:'ACTIVATE_UPDATE'}});assert.equal(h.skipped(),1);
});
test('activation retains one old shell and never deletes unrelated caches',async()=>{
  const h=harness();
  for(const key of ['ems-territory-shell-v1','ems-territory-shell-v2','ems-territory-shell-v3','another-product'])h.cacheFor(key);
  await h.run('install');await h.run('activate');
  assert.deepEqual([...h.buckets.keys()],['ems-territory-shell-v3','another-product','ems-territory-shell-v4']);
});
test('live APIs, source files and cross-origin requests stay network controlled',async()=>{
  const h=harness();
  for(const url of ['https://example.test/api/fire-registry/matches','https://example.test/app/api/healthz','https://example.test/app/data/live-source.json','https://other.test/app/assets/a.js']) {
    assert.equal(await h.run('fetch',{request:{method:'GET',url,mode:'cors'}}),undefined);
  }
});
test('offline navigation can load the cached app shell',async()=>{
  const h=harness();await h.run('install');h.offline();
  const response=await h.run('fetch',{request:{method:'GET',url:'https://example.test/app/',mode:'navigate'}});
  assert.equal(await response.text(),'shell');
});
test('fingerprinted assets are cached and remain available offline',async()=>{
  const h=harness();await h.run('install');
  const request={method:'GET',url:'https://example.test/app/assets/map-hash.js',mode:'cors'};
  assert.equal(await(await h.run('fetch',{request})).text(),'built asset');
  h.offline();
  assert.equal(await(await h.run('fetch',{request})).text(),'built asset');
});

test('SPA HTML fallback is never cached as a JavaScript module',async()=>{
 const h=harness();await h.run('install');h.html();
 const request={method:'GET',url:'https://example.test/app/assets/missing-hash.js',mode:'cors'};
 const response=await h.run('fetch',{request});assert.equal(response.type,'error');
 assert.equal(await h.cacheFor('ems-territory-shell-v4').match(request),undefined);
});
test('a cached module survives a host returning HTML after deployment',async()=>{
 const h=harness();await h.run('install');const request={method:'GET',url:'https://example.test/app/assets/old-hash.js',mode:'cors'};
 await h.run('fetch',{request});h.html();assert.equal(await(await h.run('fetch',{request})).text(),'built asset');
 assert.equal(await(await h.cacheFor('ems-territory-shell-v4').match(request)).text(),'built asset');
});

test('worker installation rejects HTML returned for a boot module',async()=>{
 const h=harness(['assets/core.js']);h.html();await assert.rejects(h.run('install'),/Invalid boot asset/);assert.equal(h.skipped(),0);
});
