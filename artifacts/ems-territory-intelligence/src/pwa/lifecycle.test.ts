import assert from 'node:assert/strict';
import test from 'node:test';
import {applyPwaUpdate, getPwaState, installPwa, startPwaLifecycle} from './lifecycle';

const browser = new EventTarget() as EventTarget & Record<string, unknown>;
const worker = new EventTarget() as EventTarget & Record<string, unknown>;
const display = new EventTarget() as EventTarget & Record<string, unknown>;
const doc = new EventTarget() as EventTarget & Record<string, unknown>;
const viewport = Object.assign(new EventTarget(),{height:620,scale:1});
const properties=new Map<string,string>();
const dataset:Record<string,string>={};
doc.documentElement={style:{setProperty:(name:string,value:string)=>properties.set(name,value)},dataset};
browser.visualViewport=viewport;
browser.innerHeight=844;
browser.innerWidth=390;
doc.activeElement={matches:()=>true};
display.matches=false;
let posted=0, prompted=0, confirmations=0;
const registration = Object.assign(new EventTarget(), {
  waiting: {postMessage: () => {posted++;}},
  installing: null,
  update: async () => undefined,
});
worker.controller={};
worker.register=async () => registration;
browser.matchMedia=() => display;
browser.setTimeout=() => 1;
browser.clearTimeout=() => undefined;
browser.confirm=() => {confirmations++; return false;};
browser.location={reload: () => assert.fail('Canceled updates must not reload')};
doc.visibilityState='visible';
Object.defineProperty(globalThis,'window',{value:browser,configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,serviceWorker:worker},configurable:true});
Object.defineProperty(globalThis,'document',{value:doc,configurable:true});

test('startup registers once, detects a waiting update and tracks network state',async()=>{
  startPwaLifecycle(true,'/');
  await Promise.resolve();
  assert.equal(getPwaState().updateAvailable,true);
  assert.equal(getPwaState().online,true);
  browser.dispatchEvent(new Event('offline'));
  assert.equal(getPwaState().online,false);
  browser.dispatchEvent(new Event('online'));
  assert.equal(getPwaState().online,true);
});
test('install acceptance does not falsely imply an installed app',async()=>{
  const event=new Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'accepted'})});
  browser.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);
  assert.equal(getPwaState().installAvailable,true);
  await installPwa();
  assert.equal(prompted,1);
  assert.equal(getPwaState().installed,false);
  browser.dispatchEvent(new Event('appinstalled'));
  assert.equal(getPwaState().installed,true);
});
test('visible viewport sizing follows the keyboard without overriding pinch zoom',()=>{
  assert.equal(properties.get('--app-visible-height'),'620px');
  assert.equal(dataset.mobileKeyboard,'open');
  viewport.height=844;viewport.dispatchEvent(new Event('resize'));
  assert.equal(properties.get('--app-visible-height'),'844px');
  assert.equal(dataset.mobileKeyboard,'closed');
  viewport.scale=2;viewport.height=400;viewport.dispatchEvent(new Event('resize'));
  assert.equal(properties.get('--app-visible-height'),'844px');
  viewport.scale=1;
});
test('unfinished reviews block updates; cancel leaves the worker and page untouched',()=>{
  const dirty=new Event('agency-profile-review-dirty');Object.assign(dirty,{detail:true});browser.dispatchEvent(dirty);
  applyPwaUpdate();
  assert.match(getPwaState().error,/unfinished fact review/);
  assert.equal(confirmations,0);
  assert.equal(posted,0);
  const clean=new Event('agency-profile-review-dirty');Object.assign(clean,{detail:false});browser.dispatchEvent(clean);
  applyPwaUpdate();
  assert.equal(confirmations,1);
  assert.equal(posted,0);
});

test('Android resized layout hides navigation while editing and restores it after blur',()=>{
  viewport.height=844; browser.innerHeight=844; viewport.dispatchEvent(new Event('resize'));
  browser.innerHeight=500; viewport.height=500; viewport.dispatchEvent(new Event('resize'));
  assert.equal(dataset.mobileKeyboard,'open');
  doc.activeElement={matches:()=>false}; doc.dispatchEvent(new Event('focusin'));
  assert.equal(dataset.mobileKeyboard,'closed');
  browser.innerHeight=844; viewport.height=844; viewport.dispatchEvent(new Event('resize'));
});
