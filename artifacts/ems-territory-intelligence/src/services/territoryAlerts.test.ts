import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency,FieldNote} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {buildLocalTerritoryAlerts,buildPublicTerritoryAlerts,combineTerritoryAlerts} from './territoryAlerts';
import {FEED_SCOPE_IDS,feedSourceUrl,type DiscoveryFeed,type FeedCandidate,type FeedItem} from './recurringDiscoveryContract';
import {localDay} from '../utils/followUps';
const now=Date.parse('2026-11-24T12:00:00Z'),day=86_400_000;
const a={id:'registry-FDID-FL-12345',name:'Example Fire Department',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Example Fire Department',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const task=(id:string,dueDate:string,status:FieldNote['followUpStatus']='open'):FieldNote=>({id,dueDate,followUpStatus:status,nextAction:'Call purchasing',date:'2026-11-20',repName:'Example',meetingType:'Standalone task',notes:''});
const fact=(id:string,kind:IntelligenceKind,value:string,documentDate='2026-11-01',record='record-'+id,dueDate?:string)=>createIntelligenceFact(a,{kind,value,documentDate,sourceName:'Example City',sourceRecordId:record,sourceUrl:'https://example.gov/'+record,dueDate},id,now);
const bid=(id:string,dueDate:string,record='PIN-'+id)=>fact(id,'procurement-open','Monitor solicitation','2026-11-01',record,dueDate);
test('follow-up windows use local days; completed, undated, malformed and distant tasks do not alert',()=>{
 const due=(d:number)=>localDay(new Date(now+d*day));
 const r=buildLocalTerritoryAlerts([{...a,followUpTasks:[task('overdue',due(-1)),task('today',due(0)),task('week',due(7)),task('later',due(8)),task('done',due(0),'completed'),task('invalid','2026-02-31'),task('undated','')]}],now);
 assert.deepEqual(r.alerts.map(x=>x.task?.id),['overdue','today','week']);
 assert.equal(r.withheldTasks,2);assert.equal(r.alerts[0].urgency,'now');
});
test('duplicate task copies collapse; conflicting completion or dates and duplicate account IDs withheld',()=>{
 const t=task('same',localDay(new Date(now)));
 assert.equal(buildLocalTerritoryAlerts([{...a,fieldNotes:[t],followUpTasks:[t]}],now).alerts.length,1);
 assert.equal(buildLocalTerritoryAlerts([{...a,fieldNotes:[t],followUpTasks:[{...t,followUpStatus:'completed'}]}],now).alerts.length,0);
 assert.equal(buildLocalTerritoryAlerts([{...a,fieldNotes:[t]},a],now).alerts.length,0);
});
test('local deadline and recent funding alerts use reconciled documents and explicit thresholds',()=>{
 const agency={...a,sourceFacts:[bid('soon','2026-12-02'),bid('far','2027-01-15'),fact('contract','contract-expiration','2027-02-01'),fact('later-contract','contract-expiration','2027-04-01'),fact('grant','grant-awarded','$1000'),fact('old-grant','grant-awarded','$2000','2026-10-01'),fact('fleet','installed-monitor','LIFEPAK 15')]};
 const r=buildLocalTerritoryAlerts([agency],now);
 assert.deepEqual(r.alerts.map(x=>x.type),['procurement','contract','funding']);
 assert.equal(r.alerts[0].signal?.evidence.factId,'soon');assert.equal(r.alerts[1].signal?.evidence.factId,'contract');
 assert.equal(buildLocalTerritoryAlerts([agency],now+9*day).alerts.some(x=>x.signal?.evidence.factId==='soon'),false);
});
test('closure, identity conflicts, ambiguous casing and invalid evidence cannot produce deadline alerts',()=>{
 const open=bid('bid','2026-12-02','PIN-1'),closed=fact('closed','procurement-closed','Cancelled','2026-11-02','PIN-1');
 for(const sourceFacts of [[open,closed],[open,{...closed,sourceRecordId:'pin-1'}],[open,{...fact('invalid','installed-monitor','LIFEPAK 15'),geographicId:'wrong'}]]){
  assert.equal(buildLocalTerritoryAlerts([{...a,sourceFacts}],now).alerts.length,0);
 }
 assert.equal(buildLocalTerritoryAlerts([{...a,sourceFacts:[open]},{...a,id:'duplicate'}],now).alerts.length,0);
});
const runAt=new Date(now).toISOString(),previous=new Date(now-day).toISOString();
const c:FeedCandidate={source:'openfema-afg',nativeId:'f1',recordNumber:'A1',organization:'Example Fire Department',state:'FL',kind:'grant',title:'Assistance to Firefighters Grant',amount:100,fiscalYear:2025,publishedDay:null,periodStart:null,periodEnd:null,deadlineLocal:null,vendor:null,sourceUrl:feedSourceUrl('openfema-afg','f1')};
const item=(id:string,event:FeedItem['event'],latest=true):FeedItem=>({candidate:{...c,nativeId:id,sourceUrl:feedSourceUrl('openfema-afg',id)},scopes:['fema-fl'],firstSeen:event==='changed'?previous:latest?runAt:previous,lastSeen:latest?runAt:previous,lastChanged:latest?runAt:previous,event});
const snapshot=(items:FeedItem[]):DiscoveryFeed=>({schemaVersion:1,runAt,items,scopes:FEED_SCOPE_IDS.map(id=>({id,status:id==='fema-fl'?'ok':'unavailable',sourceRows:id==='fema-fl'?items.filter(i=>i.lastSeen===runAt).length:0,withheld:0,hasMore:false,lastSuccess:id==='fema-fl'?runAt:null})),evicted:0,conflictingIds:0});
test('public alerts only use fresh latest-sample changes; baseline and retained history suppressed',()=>{
 const feed=snapshot([item('new','new-to-sample'),item('changed','changed'),item('base','baseline'),item('old','changed',false)]);
 const r=buildPublicTerritoryAlerts(feed,now);
 assert.equal(r.status,'ready');assert.equal(r.alerts.length,2);
 assert.ok(r.alerts.every(x=>x.type==='public'&&!('agency' in x)));
 assert.equal(buildPublicTerritoryAlerts(feed,now+3*day).status,'stale');
 assert.equal(buildPublicTerritoryAlerts(feed,now+3*day).alerts.length,0);
 assert.equal(buildPublicTerritoryAlerts({...feed,runAt:new Date(now+day).toISOString()},now).status,'unavailable');
});
test('invalid or unavailable feed fails closed and local actions remain separate',()=>{
 const feed=snapshot([item('new','new-to-sample')]);
 const r=buildPublicTerritoryAlerts({...feed,items:[{...feed.items[0],candidate:{...feed.items[0].candidate,sourceUrl:'https://evil.invalid'}}]},now);
 assert.equal(r.status,'unavailable');assert.equal(r.alerts.length,0);
 const l=buildLocalTerritoryAlerts([{...a,followUpTasks:[task('today',localDay(new Date(now)))]}],now);
 assert.equal(combineTerritoryAlerts(l.alerts,r.alerts).length,1);
 assert.equal(combineTerritoryAlerts(l.alerts,buildPublicTerritoryAlerts(feed,now).alerts)[0].type,'followup');
});
