import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {buildPreCallPlan,formatPreCallPlan,CALL_FOCUS_LABELS,type CallFocus} from './preCallPlanning';
const now=Date.parse('2026-11-24T12:00:00Z'),day=86400000;
const a={id:'registry-FDID-FL-12345',name:'Example Fire Department',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Example Fire Department',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const fact=(id:string,kind:IntelligenceKind,value:string,documentDate='2026-11-01',record='record-'+id,dueDate?:string)=>createIntelligenceFact(a,{kind,value,documentDate,sourceName:'Example City',sourceRecordId:record,sourceUrl:'https://example.gov/'+record,dueDate},id,now);
const withDocs=(...sourceFacts:ReturnType<typeof fact>[]):Agency=>({...a,sourceFacts});
const plan=(agency:Agency,focus:CallFocus='recommended',at=now)=>buildPreCallPlan(agency,[agency],focus,at);
test('recommended plan follows the actual priority signal, never merges unrelated fleet and grant documents',()=>{
 const agency=withDocs(fact('fleet','installed-monitor','LIFEPAK 15'),fact('grant','grant-awarded','$99999999'),fact('bid','procurement-open','Monitor solicitation','2026-11-01','PIN-1','2026-12-02'));
 const p=plan(agency);
 assert.equal(p.status,'document-led');assert.equal(p.topic,'Solicitation verification');assert.equal(p.priority,'Verify now');assert.equal(p.source?.factId,'bid');
 assert.equal(p.points.questions.length,3);assert.match(p.points.role,/officially designated/);assert.match(p.points.response,/authorized channel/);
 const text=formatPreCallPlan(p);assert.match(text,/https:\/\/example.gov\/PIN-1/);assert.doesNotMatch(text,/99999999|LIFEPAK/);
});
test('identity duplicates, invalid records and missing native identity block document-led plans',()=>{
 const agency=withDocs(fact('fleet','installed-monitor','LIFEPAK 15'));
 for(const p of [buildPreCallPlan(agency,[agency,{...agency,id:'duplicate'}],'recommended',now),buildPreCallPlan(agency,[],'installed-monitor',now),plan({...agency,registryIdentity:undefined})]){
  assert.equal(p.status,'identity-review');assert.equal(p.source,null);
 }
 const invalid={...fact('invalid','installed-monitor','ZOLL X Series'),geographicId:'other'};
 assert.equal(plan(withDocs(fact('fleet','installed-monitor','LIFEPAK 15'),invalid)).status,'evidence-review');
});
test('closure, elapsed date, reopening and conflicting issuer records cannot produce solicitation call preparation',()=>{
 const bid=fact('bid','procurement-open','Monitor solicitation','2026-11-01','PIN-1','2026-12-02'),closed=fact('close','procurement-closed','Cancelled','2026-11-02','PIN-1');
 assert.notEqual(plan(withDocs(bid,closed)).topic,'Solicitation verification');
 assert.notEqual(plan(withDocs(bid),'recommended',now+9*day).topic,'Solicitation verification');
 const re=fact('reopen','procurement-open','New solicitation','2026-11-03','PIN-1','2026-12-15');
 assert.equal(plan(withDocs(bid,closed,re)).status,'evidence-review');
 const alternate={...closed,sourceRecordId:'pin-1'};
 assert.equal(plan(withDocs(bid,alternate)).status,'evidence-review');
});
test('explicit product focus uses only that category; current ZOLL document is a workflow check, not conversion',()=>{
 const agency=withDocs(fact('fleet','installed-monitor','ZOLL X Series'),fact('vent','installed-ventilator','Hamilton T1'));
 const p=plan(agency,'installed-monitor');
 assert.equal(p.status,'document-led');assert.equal(p.source?.factId,'fleet');assert.equal(p.priority,null);
 assert.doesNotMatch(formatPreCallPlan(p),/Hamilton T1|conversion opportunity/);
 const other=plan(agency,'installed-cad');assert.equal(other.status,'discovery');assert.equal(other.source,null);assert.match(other.points.questions[0],/dispatch/);
});
test('empty, stale and flagged equipment do not become current inventory claims',()=>{
 const old=plan(withDocs(fact('old','installed-monitor','LIFEPAK 15','2023-01-01')),'installed-monitor');
 assert.equal(old.status,'discovery');assert.equal(old.source,null);
 const flagged={...withDocs(fact('fleet','installed-monitor','LIFEPAK 15')),_factReviews:[{agencyId:a.id,fieldId:'monitor.model',action:'flag',reviewedAt:'2026-11-20T00:00:00Z'}]} as Agency;
 assert.equal(plan(flagged,'installed-monitor').status,'evidence-review');
 const p=plan(a);assert.equal(p.status,'discovery');assert.equal(p.source,null);assert.equal(p.points.questions.length,3);
});
test('all focus options give three distinct questions, an objective, hypothetical objection and proposed commitment',()=>{
 for(const focus of Object.keys(CALL_FOCUS_LABELS) as CallFocus[]){
  const p=plan(a,focus);
  assert.equal(p.points.questions.length,3);assert.equal(new Set(p.points.questions).size,3);
  for(const s of [p.points.objective,p.points.opening,p.points.objection,p.points.response,p.points.role,p.points.commitment])assert.ok(s.length>10);
  assert.match(formatPreCallPlan(p),/hypothetical/);
  assert.equal(p.source,null);
 }
});
test('contract, grant, capital and award plans remain verification questions not confirmed purchasing commitments',()=>{
 const cases=[['contract-expiration','2027-01-01','Contract review'],['grant-awarded','$10000','Grant scope'],['capital-approved','Monitor capital approval','Capital planning'],['procurement-awarded','Awarded purchase','Award follow-up']] as const;
 for(const [kind,value,topic] of cases){const p=plan(withDocs(fact('doc',kind,value)));assert.equal(p.topic,topic);assert.equal(p.status,'document-led');assert.ok(p.source);assert.equal(p.points.questions.length,3);}
});
