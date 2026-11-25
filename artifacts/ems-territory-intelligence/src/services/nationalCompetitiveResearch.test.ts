import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact} from './documentedIntelligence';
import {NATIONAL_STATES,productMentions,researchMentions,loadedResearchCoverage,assessNationalCandidates,unavailableScope,federalResearch,chicagoResearch,commercialResearchStatus,type ResearchCandidate,type StateResearch,type ResearchScope} from './nationalCompetitiveResearch';
import type {FederalPage} from './federalDiscoveryContract';
const now=Date.parse('2026-11-24T12:00:00Z');
const agency={id:'registry-FDID-FL-12345',name:'Example Fire Department',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Example Fire Department',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const grant:ResearchCandidate={key:'openfema-afg:1',source:'fema',nativeId:'1',number:'AWARD-001',organization:agency.name,state:'FL',role:'grant-recipient',title:'Assistance to Firefighters Grant',description:null,vendor:null,amount:0,fiscalYear:2025,publishedDay:null,periodStart:null,periodEnd:null,deadlineLocal:null,sourceUrl:'https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants?id=1',sourceType:'Assistance grant'};
const supplier:ResearchCandidate={...grant,key:'usaspending:CONT_AWD_1',source:'federal-contracts',nativeId:'CONT_AWD_1',role:'supplier',title:'Federal contract award',description:'LIFEPAK 15 or ZOLL X Series proposed',fiscalYear:null,sourceType:'Contract recipient / supplier',sourceUrl:'https://www.usaspending.gov/award/CONT_AWD_1'};
const scope=(source:ResearchScope['source'],candidates:ResearchCandidate[]):ResearchScope=>({source,status:'retrieved',fetchedAt:new Date(now).toISOString(),sourceRows:candidates.length,withheld:0,duplicates:0,hasMore:false,candidates});
const research=(...scopes:ResearchScope[]):StateResearch=>({state:'FL',topic:'defibrillator',fromYear:2024,checkedAt:new Date(now).toISOString(),scopes});
test('explicit brand and product tokens are contextual hints, never inferred from search terms or ambiguous personal names',()=>{
 assert.deepEqual(productMentions('ZOLL X Series and LIFEPAK 15').map(x=>x.brand),['ZOLL','Stryker / Physio-Control']);
 assert.equal(productMentions('Lucas County, Hamilton County, Tyler, R series, ESO report').length,0);
 assert.deepEqual(productMentions('LUCAS 3 mechanical CPR, Z-VENT').map(x=>x.family).sort(),['cpr','ventilators']);
 assert.equal(researchMentions({...grant,title:'Requested ZOLL X Series, or equivalent'}).document.length,1);
 assert.equal(researchMentions({...grant,vendor:'ZOLL',title:'Defibrillator bid'}).document.length,0);
 assert.equal(researchMentions({...grant,vendor:'ZOLL'}).vendor.length,1);
});
test('all 50 states and DC are represented; coverage counts unique eligible native identities, not providers',()=>{
 const c=loadedResearchCoverage([agency,{...agency,id:'other'}],now);
 assert.equal(new Set(NATIONAL_STATES).size,51);
 assert.equal(c.states.get('FL')?.eligible,0);assert.equal(c.states.get('FL')?.excluded,2);
 assert.equal(c.states.get('AK')?.loaded,0);
 const good=loadedResearchCoverage([agency],now);assert.equal(good.states.get('FL')?.eligible,1);assert.equal(good.states.get('FL')?.documented.monitors,0);
 const f=createIntelligenceFact(agency,{kind:'installed-monitor',value:'ZOLL X Series',sourceName:'City',sourceRecordId:'inventory',sourceUrl:'https://example.gov/inventory',documentDate:'2026-11-01'},'f1',now);
 assert.equal(loadedResearchCoverage([{...agency,sourceFacts:[f]}],now).states.get('FL')?.documented.monitors,1);
 assert.equal(loadedResearchCoverage([{...agency,sourceFacts:[f]}],now+731*86400000).states.get('FL')?.documented.monitors,0);
});
test('only grant recipients can suggest an eligible exact name and state account; suppliers never match',()=>{
 const r=assessNationalCandidates([agency],research(scope('fema',[grant]),scope('federal-contracts',[supplier])),now);
 assert.equal(r.rows[0].account?.id,agency.id);assert.equal(r.rows[1].account,undefined);assert.equal(r.rows[1].document.length,2);
 assert.equal(assessNationalCandidates([{...agency,registryIdentity:{...agency.registryIdentity!,name:'Different organization'}}],research(scope('fema',[grant])),now).rows[0].account,undefined);
 assert.equal(assessNationalCandidates([agency,{...agency,id:'duplicate'}],research(scope('fema',[grant])),now).rows[0].account,undefined);
 assert.equal(assessNationalCandidates([{...agency,registryIdentity:{...agency.registryIdentity!,sourceUrl:'https://example.invalid'}}],research(scope('fema',[grant])),now).rows[0].account,undefined);
});
test('same-source conflicting IDs withheld; exact cross-source grant overlap flagged without amount aggregation',()=>{
 const other:ResearchCandidate={...grant,source:'federal-grants',key:'usaspending:ASST_NON_1',nativeId:'ASST_NON_1',fiscalYear:null,amount:123};
 const r=assessNationalCandidates([agency],research(scope('fema',[grant]),scope('federal-grants',[other])),now);
 assert.equal(r.rows.length,2);assert.ok(r.rows.every(r=>r.overlap));assert.deepEqual(r.rows.map(r=>r.candidate.amount),[0,123]);
 const conflicting=assessNationalCandidates([agency],research(scope('fema',[grant,{...grant,amount:20}])),now);
 assert.equal(conflicting.conflicts,1);assert.equal(conflicting.rows.length,0);
});
test('unavailable and out-of-scope data cannot generate research candidates',()=>{
 const r=assessNationalCandidates([agency],research({...unavailableScope('fema'),candidates:[grant]},scope('federal-contracts',[{...supplier,state:'GA'}])),now);
 assert.equal(r.rows.length,0);
 const page={query:{topic:'grants'},fetchedAt:new Date(now).toISOString(),sourceRows:1,withheld:0,duplicates:0,nextPage:null,scopeCapped:false,warnings:1,candidates:[{id:'ASST_NON_1',awardNumber:'A1',recipient:agency.name,state:'FL',description:null,awardAmount:10,startDate:null,endDate:null,sourceUrl:'https://www.usaspending.gov/award/ASST_NON_1'}]} as FederalPage;
 const s=federalResearch(page);assert.equal(s.status,'partial');assert.equal(s.candidates.length,0);
});

test('Chicago revisions remain independent source rows, never recipient matches or aggregated awards',()=>{
 const p={fetchedAt:new Date(now).toISOString(),sourceRows:2,withheld:0,duplicates:0,nextPage:null,scopeCapped:false,records:[
 {key:'["PO-1","0"]',contractNumber:'PO-1',revision:'0',description:'LIFEPAK 15',department:'Fixture Fire',vendor:'Fixture supplier',amount:100,approvalDay:'2026-11-01',startDay:null,endDay:'2027-01-01',sourceUrl:'https://data.cityofchicago.org/resource/rsxa-ify5.json?fixture=1'},
 {key:'["PO-1","1"]',contractNumber:'PO-1',revision:'1',description:'LIFEPAK 15',department:'Fixture Fire',vendor:'Fixture supplier',amount:-20,approvalDay:'2026-11-02',startDay:null,endDay:null,sourceUrl:'https://data.cityofchicago.org/resource/rsxa-ify5.json?fixture=2'}]} as unknown as import('./chicagoDiscoveryContract').ChicagoPage;
 const result=chicagoResearch(p);assert.equal(result.candidates.length,2);
 const r=assessNationalCandidates([agency],{...research(result),state:'IL'},now);
 assert.equal(r.rows.length,2);assert.ok(r.rows.every(x=>!x.account&&commercialResearchStatus(x.candidate,now)==='contract'));
 assert.deepEqual(r.rows.map(x=>x.candidate.amount),[100,-20]);assert.match(r.rows[1].candidate.amountNote!,/Negative modification/);
});
test('notice lifecycle labels never turn an award or intent into a solicitation',()=>{
 const notice={...grant,source:'municipal',role:'notice-issuer',state:'NY'} as ResearchCandidate;
 assert.equal(commercialResearchStatus({...notice,sourceType:'Award',deadlineLocal:'2027-01-01T12:00:00'},now),'award');
 assert.equal(commercialResearchStatus({...notice,sourceType:'Intent to Award'},now),'intent');
 assert.equal(commercialResearchStatus({...notice,sourceType:'Solicitation',deadlineLocal:'2026-11-23T12:00:00'},now),'deadline-elapsed');
 assert.equal(commercialResearchStatus({...notice,sourceType:'Solicitation',deadlineLocal:'2026-11-24T12:00:00'},now),'deadline-today');
 assert.equal(commercialResearchStatus({...notice,sourceType:'Solicitation',deadlineLocal:null},now),'solicitation');
 assert.equal(commercialResearchStatus(supplier,now),'supplier');assert.equal(commercialResearchStatus(grant,now),'funding');
});
