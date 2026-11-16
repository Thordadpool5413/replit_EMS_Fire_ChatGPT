import test from 'node:test';import assert from 'node:assert/strict';import {isModuleLoadError,reloadApplication}from'./moduleRecovery';
test('recognizes browser chunk transport errors without masking application bugs',()=>{
 for(const message of ['Failed to fetch dynamically imported module: https://example.org/a.js','Importing a module script failed.','Loading chunk 123 failed','Unable to preload CSS for /assets/a.css'])assert.equal(isModuleLoadError(Error(message)),true,message);
 assert.equal(isModuleLoadError(Error('Cannot read properties of undefined')),false);
});
test('explicit reload checks worker and never tries to reload offline',async()=>{
 let checks=0,reloads=0;const env={online:false,updateWorker:async()=>{checks++;},reload:()=>{reloads++;}};
 assert.equal(await reloadApplication(env),false);assert.equal(checks,0);assert.equal(reloads,0);
 assert.equal(await reloadApplication({...env,online:true}),true);assert.equal(checks,1);assert.equal(reloads,1);
 assert.equal(await reloadApplication({...env,online:true,updateWorker:async()=>{throw Error('unavailable');}}),true);assert.equal(reloads,2);
});
