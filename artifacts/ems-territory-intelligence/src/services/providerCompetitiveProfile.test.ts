import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {buildProviderCompetitiveProfile,providerIdentityReady,providerGrantCandidates} from './providerCompetitiveProfile';
import type {ResearchCandidate,ResearchScope} from './nationalCompetitiveResearch';
const now=Date.parse('2026-11-24T12:00:00Z');
const a={id:'registry-FDID-FL-12345',name:'Example Fire Department',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Example Fire Department',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const fact=(id:string,kind:IntelligenceKind,value:string,documentDate='2026-11-01',record='inventory',source='Example City',dueDate?:string)=>createIntelligenceFact(a,{kind,value,documentDate,sourceName:source,sourceRecordId:record,sourceUrl:'https://example.gov/'+record,dueDate},id,now);
const profile=(sourceFacts:Agency['sourceFacts']=[])=>{const agency={...a,sourceFacts};return buildProviderCompetitiveProfile(agency,[agency],now);};
test('six distinct equipment categories; no seeded inventory or guessed manufacturer or quantity',()=>{
 const empty=profile();assert.equal(empty.equipment.length,6);assert.equal(empty.documentedCategories,0);
 const model=profile([fact('f1','installed-monitor','ZOLL X Series')]);
 assert.equal(model.documentedCategories,1);assert.equal(model.equipment[0].status,'document-observation');
 assert.deepEqual(model.equipment[0].observations[0].mentions,['ZOLL (ZOLL X Series)']);
 assert.equal(model.equipment[3].status,'not-documented');
});
test('native account identity and unique loaded row required; invalid documents block positive classifications',()=>{
 assert.equal(providerIdentityReady(a,[a,{...a,id:'other'}]),false);
 assert.equal(providerIdentityReady(a,[]),false);
 const invalid={...fact('f2','installed-monitor','LIFEPAK 15'),geographicId:'wrong-account'};
 const r=profile([fact('f1','installed-monitor','ZOLL X Series'),invalid]);
 assert.equal(r.complete,false);assert.equal(r.documentedCategories,0);assert.equal(r.invalid,1);
 const b={...a,sourceFacts:[fact('f1','installed-monitor','ZOLL X Series')]};
 assert.equal(buildProviderCompetitiveProfile(b,[b,{...b,id:'duplicate'}],now).documentedCategories,0);
});
test('stale and conflicting inventory not classified as a current observation',()=>{
 const stale=profile([fact('f1','installed-monitor','ZOLL X Series','2023-01-01')]);
 assert.equal(stale.equipment[0].status,'history');
 const conflict=profile([fact('f1','installed-monitor','ZOLL X Series'),fact('f2','installed-monitor','LIFEPAK 15','2026-11-01','different')]);
 assert.equal(conflict.equipment[0].status,'review-required');assert.equal(conflict.documentedCategories,0);
});
test('local correction withholds observation, recorded legacy fleet not promoted',()=>{
 const b={...a,sourceFacts:[fact('f1','installed-monitor','ZOLL X Series')],_factReviews:[{agencyId:a.id,fieldId:'monitor.model',action:'flag',reviewedAt:'2026-11-20T00:00:00Z'}]} as Agency;
 assert.equal(buildProviderCompetitiveProfile(b,[b],now).equipment[0].status,'review-required');
 assert.equal(profile().documentedCategories,0);
});
test('procurement closure supersedes prior bid; reopening and issuer collisions require review',()=>{
 const open=fact('b1','procurement-open','Monitor bid','2026-11-01','BID-1','City','2026-12-01');
 const closed=fact('b2','procurement-closed','Cancelled','2026-11-02','BID-1','City');
 const r=profile([open,closed]);assert.ok(r.purchasing.every(d=>d.status==='history'));
 const reopening=fact('b3','procurement-open','Monitor bid again','2026-11-03','BID-1','City','2026-12-15');
 assert.equal(profile([open,closed,reopening]).purchasing.find(d=>d.item.evidence.factId==='b3')?.status,'review-required');
 const other=fact('b4','procurement-open','Another bid','2026-11-03','BID-1','County','2026-12-15');
 assert.ok(profile([open,other]).purchasing.every(d=>d.status==='review-required'));
});
const candidate:ResearchCandidate={key:'openfema-afg:1',source:'fema',nativeId:'1',number:'A1',organization:a.name,state:'FL',role:'grant-recipient',title:'Assistance grant',description:null,vendor:null,amount:0,fiscalYear:2025,publishedDay:null,periodStart:null,periodEnd:null,deadlineLocal:null,sourceUrl:'https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants?id=1',sourceType:'Grant'};
const scope:ResearchScope={source:'fema',status:'retrieved',fetchedAt:new Date(now).toISOString(),sourceRows:1,withheld:0,duplicates:0,hasMore:false,candidates:[candidate]};
test('public grant results remain candidates for this unique account only, never suppliers or other states',()=>{
 const checkedAt=new Date(now).toISOString();
 assert.equal(providerGrantCandidates(a,[a],[scope],checkedAt,now).length,1);
 assert.equal(providerGrantCandidates(a,[a,{...a,id:'duplicate'}],[scope],checkedAt,now).length,0);
 assert.equal(providerGrantCandidates(a,[a],[{...scope,candidates:[{...candidate,organization:'Different Fire Department'}]}],checkedAt,now).length,0);
 assert.equal(providerGrantCandidates(a,[a],[{...scope,candidates:[{...candidate,role:'supplier'}]}],checkedAt,now).length,0);
 assert.equal(a.sourceFacts,undefined);
});

test('all reviewed registry keys must be unique, not just the primary identity',()=>{
 const association={id:'neris:FDTEST123',sourceName:'NERIS',sourceRecordId:'FDTEST123',sourceFields:{stateCode:'FL',nerisId:'FDTEST123'},decision:'confirmed',matchBasis:'Fixture association',decidedAt:'2026-11-20',sourceUrl:'https://www.usfa.fema.gov/neris/public/'} as NonNullable<Agency['sourceRecordAssociations']>[number];
 const first={...a,sourceRecordAssociations:[association]};
 const second={...a,id:'registry-FDID-FL-54321',registryIdentity:{...a.registryIdentity!,identifier:'54321'},sourceRecordAssociations:[association]};
 assert.equal(providerIdentityReady(first,[first]),true);
 assert.equal(providerIdentityReady(first,[first,second]),false);
 assert.equal(providerIdentityReady(second,[first,second]),false);
 assert.equal(providerIdentityReady({...a,registryIdentity:{...a.registryIdentity!,stateCode:'GA'}},[{...a,registryIdentity:{...a.registryIdentity!,stateCode:'GA'}}]),false);
});
