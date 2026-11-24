import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agency } from '../types';
import { createIntelligenceFact, type IntelligenceKind } from './documentedIntelligence';
import { toSharedEvidence } from './sharedEvidence';
import { reconcileSharedEvidence } from './sharedEvidenceReconciliation';
const now=Date.parse('2026-11-24T12:00:00Z');
const agency={id:'registry-FDID-FL-12345',name:'Example Fire',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL'}} as Agency;
const scope={singleCompletePage:true,withheld:0};
function fact(id:string,kind:IntelligenceKind,value:string,date='2026-11-01',record='report-1',issuer='Example City',dueDate?:string){
  return createIntelligenceFact(agency,{kind,value,documentDate:date,sourceRecordId:record,sourceName:issuer,sourceUrl:'https://example.gov/'+record+'.pdf',dueDate},id,now);
}
const shared=(...args:Parameters<typeof fact>)=>toSharedEvidence(agency,fact(...args),now);
const review=(...rows:ReturnType<typeof shared>[])=>reconcileSharedEvidence(agency,rows,scope,now);
test('duplicate observations collapse for review, preserve the shared origin and leave raw records untouched',()=>{
 const f=fact('local','installed-monitor','ZOLL X Series'),r=toSharedEvidence(agency,f,now);
 const result=reconcileSharedEvidence({...agency,sourceFacts:[f]},[{...r,factId:'shared'}],scope,now);
 assert.equal(result.complete,true);assert.equal(result.duplicates,1);assert.equal(result.items.length,1);
 assert.equal(result.items[0].origin,'shared');assert.equal(result.items[0].status,'review-candidate');assert.equal(f.id,'local');
});
test('same immutable ID with different contents is a conflict, never a duplicate',()=>{
 const r=shared('same','installed-monitor','ZOLL X Series');
 const result=reconcileSharedEvidence({...agency,sourceFacts:[fact('same','installed-monitor','LIFEPAK 15')]},[r],scope,now);
 assert.equal(result.items.length,2);assert.equal(result.duplicates,0);assert.ok(result.items.every(x=>x.status==='conflict'));
});
test('newer installation does not prove replacement; equal-date disagreement blocks review candidates',()=>{
 const old=shared('old','installed-monitor','ZOLL X Series','2025-01-01','old-doc');
 const a=shared('a','installed-monitor','ZOLL X Series','2026-11-01','a-doc');
 const b=shared('b','installed-monitor','LIFEPAK 15','2026-11-01','b-doc');
 const result=review(old,a,b);
 assert.equal(result.items.find(x=>x.evidence.factId==='old')?.status,'historical');
 assert.equal(result.items.filter(x=>x.status==='conflict').length,2);
});
test('same document multiple models need manual inventory review; old observations are stale',()=>{
 const a=shared('a','installed-monitor','ZOLL X Series'),b=shared('b','installed-monitor','LIFEPAK 15');
 assert.ok(review(a,b).items.every(x=>x.status==='local-review-required'));
 assert.equal(review(shared('old','installed-ventilator','ZOLL Z Vent','2024-01-01')).items[0].status,'stale');
});
test('later closure supersedes open procurement for the same issuer and record, but unrelated issuer is separate',()=>{
 const a=shared('open','procurement-open','Monitor bid','2026-11-01','bid','City A','2026-12-01');
 const b=shared('closed','procurement-closed','Cancelled','2026-11-20','bid','City A');
 const c=shared('other','procurement-open','Different bid','2026-11-01','bid','City B','2026-12-01');
 const result=review(a,b,c);
 assert.equal(result.items.find(x=>x.evidence.factId==='open')?.status,'superseded');
 assert.equal(result.items.find(x=>x.evidence.factId==='closed')?.status,'closed');
 assert.equal(result.items.find(x=>x.evidence.factId==='other')?.status,'review-candidate');
});
test('same-date procurement conflict and reopening after closure are not treated as ready',()=>{
 const a=shared('open','procurement-open','Monitor bid','2026-11-01','bid','City A','2026-12-01');
 const b=shared('closed','procurement-closed','Cancelled','2026-11-01','bid','City A');
 assert.ok(review(a,b).items.every(x=>x.status==='conflict'));
 const reopen=shared('reopen','procurement-open','Monitor bid','2026-11-20','bid','City A','2026-12-01');
 assert.equal(review(a,b,reopen).items.find(x=>x.evidence.factId==='reopen')?.status,'local-review-required');
});
test('separate contracts are not overwritten; passed deadlines are marked',()=>{
 const a=shared('a','contract-expiration','2026-11-10','2026-11-01','contract-a');
 const b=shared('b','contract-expiration','2027-01-01','2026-11-01','contract-b');
 assert.equal(review(a,b).items.find(x=>x.evidence.factId==='a')?.status,'deadline-passed');
 assert.equal(review(a,b).items.find(x=>x.evidence.factId==='b')?.status,'review-candidate');
});
test('pagination or invalid records withhold account-wide conclusions',()=>{
 const r=shared('a','installed-monitor','ZOLL X Series');
 for(const s of [{singleCompletePage:false,withheld:0},{singleCompletePage:true,withheld:1}]){
  const result=reconcileSharedEvidence(agency,[r],s,now);
  assert.equal(result.complete,false);assert.equal(result.items[0].status,'incomplete');
 }
 const invalid=reconcileSharedEvidence(agency,[r,{...r,sourceUrl:'http://example.gov'}],scope,now);
 assert.equal(invalid.complete,false);assert.equal(invalid.invalid,1);
});
test('source identity and state must match, including national registry identities',()=>{
 const a={...agency,registryIdentity:{sourceName:'NERIS',identifier:'ABC',stateCode:'FL'}} as Agency;
 const f=createIntelligenceFact(a,{kind:'installed-monitor',value:'ZOLL X Series',sourceName:'City',sourceRecordId:'r',sourceUrl:'https://example.gov/r',documentDate:'2026-11-01'},'f',now);
 const r=toSharedEvidence(a,f,now);
 const result=reconcileSharedEvidence(a,[{...r,stateCode:'GA'}],scope,now);
 assert.equal(result.complete,false);assert.equal(result.invalid,1);
});
