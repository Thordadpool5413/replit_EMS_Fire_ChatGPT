import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEED_SCOPE_IDS,FEED_LIMIT,feedSourceUrl,feedKey,possibleGrantOverlap,validateDiscoveryFeed,feedIsStale,type FeedCandidate,type FeedScope} from './recurringDiscoveryContract';
import {reconcileDiscoveryFeed,type ScopeResult} from './recurringDiscovery';
const now=Date.parse('2026-11-24T12:00:00Z'),day=86_400_000;
const fema=(id='f1',changes:Partial<FeedCandidate>={}):FeedCandidate=>({source:'openfema-afg',nativeId:id,recordNumber:'AWARD-1',organization:'Example Fire Department',state:'FL',kind:'grant',title:'Assistance to Firefighters Grant',amount:0,fiscalYear:2025,publishedDay:null,periodStart:null,periodEnd:null,deadlineLocal:null,vendor:null,sourceUrl:feedSourceUrl('openfema-afg',id),...changes});
const nyc=(id='123',changes:Partial<FeedCandidate>={}):FeedCandidate=>({source:'nyc-city-record',nativeId:id,recordNumber:'PIN-1',organization:'Example City',state:'NY',kind:'municipal-solicitation',title:'Defibrillator and mechanical CPR purchase',amount:null,fiscalYear:null,publishedDay:'2026-11-20',periodStart:null,periodEnd:null,deadlineLocal:'2026-12-01T14:00:00',vendor:null,sourceUrl:feedSourceUrl('nyc-city-record',id),...changes});
const outcome=(id:FeedScope,candidates:FeedCandidate[]=[],status:ScopeResult['status']='ok'):ScopeResult=>({id,status,sourceRows:candidates.length,withheld:0,hasMore:status==='partial',candidates});
const all=(...r:ScopeResult[])=>FEED_SCOPE_IDS.map(id=>r.find(x=>x.id===id)??outcome(id));
test('initial baseline and new-to-sample/changed semantics preserve first observation and do not re-flag unchanged records',()=>{
 const a=reconcileDiscoveryFeed(undefined,all(outcome('fema-fl',[fema()])),now);
 assert.equal(a.items[0].event,'baseline');
 const b=reconcileDiscoveryFeed(a,all(outcome('fema-fl',[fema('f1',{amount:5}),fema('f2')])),now+day);
 assert.equal(b.items.find(i=>i.candidate.nativeId==='f1')?.event,'changed');
 assert.equal(b.items.find(i=>i.candidate.nativeId==='f1')?.firstSeen,a.runAt);
 assert.equal(b.items.find(i=>i.candidate.nativeId==='f2')?.event,'new-to-sample');
 const c=reconcileDiscoveryFeed(b,all(outcome('fema-fl',[fema('f1',{amount:5}),fema('f2')])),now+2*day);
 assert.equal(c.items[0].lastChanged,b.runAt);assert.ok(c.items.every(i=>i.lastSeen===c.runAt&&i.lastChanged!==c.runAt));
});
test('failed or missing observations retain last seen time without inferring closure; first usable scope is baseline',()=>{
 const a=reconcileDiscoveryFeed(undefined,all(outcome('fema-fl',[fema()]),outcome('nyc-cardiac',[],'unavailable')),now);
 const b=reconcileDiscoveryFeed(a,all(outcome('fema-fl',[],'unavailable'),outcome('nyc-cardiac',[nyc()])),now+day);
 assert.equal(b.items.find(i=>i.candidate.nativeId==='f1')?.lastSeen,a.runAt);
 assert.equal(b.scopes.find(s=>s.id==='fema-fl')?.lastSuccess,a.runAt);
 assert.equal(b.items.find(i=>i.candidate.nativeId==='123')?.event,'baseline');
 const c=reconcileDiscoveryFeed(b,all(),now+2*day);
 assert.ok(c.items.every(i=>i.lastSeen<c.runAt));assert.equal(c.items.length,2);
});
test('source-native identity deduplicates across scopes, while conflicting values withhold the new observation',()=>{
 const a=reconcileDiscoveryFeed(undefined,all(outcome('nyc-cardiac',[nyc()]),outcome('nyc-cpr',[nyc()])),now);
 assert.equal(a.items.length,1);assert.deepEqual(a.items[0].scopes,['nyc-cardiac','nyc-cpr']);
 const b=reconcileDiscoveryFeed(a,all(outcome('nyc-cardiac',[nyc()]),outcome('nyc-cpr',[nyc('123',{amount:100})])),now+day);
 assert.equal(b.conflictingIds,1);assert.equal(b.items[0].lastSeen,a.runAt);assert.equal(b.items[0].candidate.amount,null);
});
test('cross-source grant overlap is flagged but records and amounts are never merged',()=>{
 const federal:FeedCandidate={...fema(),source:'usaspending',nativeId:'ASST_NON_1',fiscalYear:null,title:'Federal assistance award',sourceUrl:feedSourceUrl('usaspending','ASST_NON_1'),amount:20};
 const a=reconcileDiscoveryFeed(undefined,all(outcome('fema-fl',[fema()]),outcome('federal-fl-grants',[federal])),now);
 assert.equal(a.items.length,2);assert.deepEqual([...possibleGrantOverlap(a.items)].sort(),[feedKey(fema()),feedKey(federal)].sort());
});
test('retention and freshness are explicit and bounded',()=>{
 const a=reconcileDiscoveryFeed(undefined,all(outcome('fema-fl',[fema()])),now);
 const b=reconcileDiscoveryFeed(a,all(),now+91*day);
 assert.equal(b.items.length,0);assert.equal(b.evicted,1);assert.equal(feedIsStale(a,now+3*day),true);
 let current=a;
 for(let batch=1;batch<=9;batch++)current=reconcileDiscoveryFeed(current,all(outcome('fema-fl',Array.from({length:50},(_,i)=>fema('batch'+batch+'-'+i)))),now+batch*day);
 assert.equal(current.items.length,FEED_LIMIT);assert.ok(current.evicted>0);
});
test('malformed history, foreign URLs, wrong scope, duplicates, unexpected fields and unsafe clock changes fail closed',()=>{
 const a=reconcileDiscoveryFeed(undefined,all(outcome('fema-fl',[fema()])),now);
 for(const v of [{...a,runAt:new Date(now+day).toISOString()},{...a,items:[a.items[0],a.items[0]]},{...a,items:[{...a.items[0],candidate:{...a.items[0].candidate,sourceUrl:'https://evil.invalid'}}]},{...a,items:[{...a.items[0],candidate:{...a.items[0].candidate,privateNote:'not allowed'}}]},{...a,items:[{...a.items[0],scopes:['nyc-cardiac']}]},{...a,scopes:a.scopes.slice(1)}])assert.throws(()=>validateDiscoveryFeed(v,now));
 assert.throws(()=>reconcileDiscoveryFeed(a,all(),now));
 assert.throws(()=>reconcileDiscoveryFeed(undefined,[outcome('fema-fl')],now));
 assert.throws(()=>reconcileDiscoveryFeed(undefined,all(outcome('fema-fl',[nyc()])),now));
 assert.throws(()=>reconcileDiscoveryFeed(undefined,all(outcome('nyc-ventilation',[nyc()])),now));
 assert.equal(readFileSync(new URL('./recurringDiscoveryContract.ts',import.meta.url),'utf8'),readFileSync(new URL('../../../ems-territory-intelligence/src/services/recurringDiscoveryContract.ts',import.meta.url),'utf8'));
});
