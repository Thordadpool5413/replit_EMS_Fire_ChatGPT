import test from 'node:test';
import assert from 'node:assert/strict';
import type { Agency } from '../types';
import { createIntelligenceFact,type IntelligenceKind } from './documentedIntelligence';
import { toSharedEvidence } from './sharedEvidence';
import { buildReviewedRadar,type ReviewedEvidenceRow } from './sharedOpportunityRadar';
import type { EvidenceDecision } from './sharedEvidenceGovernance';
const now=Date.parse('2026-11-24T12:00:00Z');
const agency={id:'registry-FDID-FL-12345',name:'Example Fire',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL'}} as Agency;
const scope={complete:true,withheld:0};
function row(id:string,kind:IntelligenceKind,value:string,record='report-1',date='2026-11-01',dueDate?:string,issuer='City'):ReviewedEvidenceRow{
 const f=createIntelligenceFact(agency,{kind,value,sourceName:issuer,sourceRecordId:record,sourceUrl:'https://example.gov/'+record+'.pdf',documentDate:date,dueDate},id,now-86400000);
 return {evidence:toSharedEvidence(agency,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00.000Z',invalid:0,decisions:[{factId:id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00.000Z'}]};
}
const radar=(...rows:ReviewedEvidenceRow[])=>buildReviewedRadar(agency,rows,scope,now);
const event=(r:ReviewedEvidenceRow,action:EvidenceDecision['action'],reason:string,replacementId=''):EvidenceDecision=>({factId:r.evidence.factId,action,reason,replacementId,reviewerUid:'reviewer',reviewedAt:'2026-11-23T15:00:00.000Z'});
test('independently approved documented opportunities preserve sources and dates without invented revenue',()=>{
 const rows=[row('c','installed-monitor','LIFEPAK 15'),row('r','contract-expiration','2027-01-01','contract'),row('b','procurement-open','Monitor bid','bid','2026-11-01','2026-12-01'),row('g','grant-awarded','Monitor grant','grant'),row('a','capital-approved','Equipment budget','budget'),row('p','procurement-awarded','Monitor award','award')];
 const r=radar(...rows);assert.equal(r.complete,true);assert.equal(r.signals.length,6);assert.equal(r.approved,6);
 assert.ok(r.signals.every(s=>s.evidence.sourceUrl.startsWith('https://')&&s.approval.reviewerUid==='reviewer'&&!('revenue' in s)));
 assert.equal(r.signals[0].kind,'open-procurement');
});
test('pending, withdrawn, challenged, expired and stale records do not produce positive signals',()=>{
 const pending=row('p','grant-awarded','Grant','g');pending.decisions=[];
 const challenged=row('c','installed-monitor','LIFEPAK 15');challenged.decisions.push(event(challenged,'challenged','source-conflict'));
 const withdrawn=row('w','capital-approved','Budget','b');withdrawn.decisions.push(event(withdrawn,'withdrawn','source-retracted'));
 const old=row('o','installed-cpr','LUCAS','o','2023-01-01');
 const expired=row('e','procurement-open','Expired bid','e','2026-11-01','2026-11-10');
 const far=row('f','contract-expiration','2030-01-01','f');
 assert.equal(radar(pending,challenged,withdrawn,old,expired,far).signals.length,0);
});
test('unapproved later closure or conflicting observation suppresses approved older information',()=>{
 const bid=row('a','procurement-open','Monitor bid','bid','2026-11-01','2026-12-01');
 const closed=row('b','procurement-closed','Cancelled','bid','2026-11-20');closed.decisions=[];
 assert.equal(radar(bid,closed).signals.length,0);
 const a=row('c','installed-monitor','LIFEPAK 15','inventory-a');
 const b=row('d','installed-monitor','ZOLL X Series','inventory-b');b.decisions=[];
 assert.equal(radar(a,b).signals.length,0);
});
test('duplicates require every active copy to be approved; local evidence is not a shared approval',()=>{
 const a=row('a','installed-monitor','LIFEPAK 15');const b=row('b','installed-monitor','LIFEPAK 15');b.decisions=[];
 assert.equal(radar(a,b).signals.length,0);
 b.decisions=[{...a.decisions[0],factId:'b'}];assert.equal(radar(a,b).signals.length,1);
 const local= {...agency,sourceFacts:[createIntelligenceFact(agency,{kind:'grant-awarded',value:'Local grant',sourceName:'City',sourceRecordId:'local',sourceUrl:'https://example.gov/local',documentDate:'2026-11-01'},'local',now)]};
 assert.equal(buildReviewedRadar(local,[],scope,now).signals.length,0);
});
test('approved matching correction replaces original for reconciliation; broken or blocked chains withhold all signals',()=>{
 const original=row('a','installed-monitor','ZOLL X Series');const corrected=row('b','installed-monitor','LIFEPAK 15');
 original.decisions.push(event(original,'superseded','corrected-evidence','b'));
 assert.equal(radar(original,corrected).signals[0]?.evidence.factId,'b');
 assert.equal(radar(original).complete,false);
 corrected.decisions.push(event(corrected,'challenged','source-conflict'));assert.equal(radar(original,corrected).complete,false);
});
test('reject incomplete scope, malformed decisions, self approval, duplicate IDs and wrong identity',()=>{
 const a=row('a','installed-monitor','LIFEPAK 15');
 assert.equal(buildReviewedRadar(agency,[a],{complete:false,withheld:0},now).complete,false);
 assert.equal(buildReviewedRadar(agency,[a],{complete:true,withheld:1},now).complete,false);
 assert.equal(radar(a,a).complete,false);
 assert.equal(radar({...a,invalid:1}).complete,false);
 assert.equal(radar({...a,decisions:[{...a.decisions[0],reviewerUid:'editor'}]}).complete,false);
 assert.equal(radar({...a,decisions:[{...a.decisions[0],reviewedAt:'2026-11-22T12:00:00Z'}]}).complete,false);
 assert.equal(radar({...a,evidence:{...a.evidence,stateCode:'GA'}}).complete,false);
});
test('same procurement number from different issuers is ambiguous, not two confident opportunities',()=>{
 const a=row('a','procurement-open','Bid A','bid','2026-11-01','2026-12-01','City A');
 const b=row('b','procurement-open','Bid B','bid','2026-11-01','2026-12-01','City B');
 assert.equal(radar(a,b).signals.length,0);
});

test('reviewed equipment output includes ZOLL and independently approved competitor observations without promoting ambiguity',()=>{
 const z=row('z','installed-monitor','ZOLL X Series');
 const c=row('c','installed-cpr','LUCAS');
 const unknown=row('u','installed-ventilator','Unidentified model');
 const result=radar(z,c,unknown);
 assert.deepEqual(result.equipment.map(e=>e.vendorId).sort(),['stryker','zoll']);
 assert.equal(result.signals.filter(s=>s.kind==='competitor-equipment').length,1);
 const conflict=row('v','installed-monitor','LIFEPAK 15','another-inventory');
 assert.deepEqual(radar(z,c,conflict).equipment.map(e=>e.vendorId),['stryker']);
 const blocked=row('b','installed-cpr','LUCAS');
 blocked.decisions.push(event(blocked,'withdrawn','incorrect-value'));
 assert.equal(radar(blocked).equipment.length,0);
});
