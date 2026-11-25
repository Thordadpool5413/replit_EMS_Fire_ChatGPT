import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {once} from 'node:events';
import {makeReadinessHandler} from './releaseReadiness';

test('readiness is bounded, coalesced, no-store and does not disclose database errors',async()=>{
 let release:()=>void=()=>{},calls=0;
 const app=express();
 app.get('/ready',makeReadinessHandler(()=>{calls++;return new Promise<void>(resolve=>{release=resolve;});},100));
 app.get('/failure',makeReadinessHandler(async()=>{throw Error('private database detail');}));
 app.get('/healthy',makeReadinessHandler(async()=>{}));
 const server=app.listen(0,'127.0.0.1');
 try{
  await once(server,'listening');const addr=server.address();assert(addr&&typeof addr!=='string');const base='http://127.0.0.1:'+addr.port;
  const slow=await fetch(base+'/ready');assert.equal(slow.status,503);assert.deepEqual(await slow.json(),{status:'unavailable'});
  const concurrent=await fetch(base+'/ready');assert.equal(concurrent.status,503);assert.equal(calls,1);
  release();
  const fail=await fetch(base+'/failure');assert.equal(fail.status,503);assert.equal(fail.headers.get('cache-control'),'no-store');assert.deepEqual(await fail.json(),{status:'unavailable'});
  const ok=await fetch(base+'/healthy');assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{status:'ready'});
 }finally{release();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
