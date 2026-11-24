import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import type {FederalCandidate} from './federalDiscoveryContract';
import {federalAccountCandidates} from './federalSpendingDiscovery';
const agency={id:'registry-FDID-FL-12345',name:'Example Fire Department',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL'}} as Agency;
const grant:FederalCandidate={id:'ASST_NON_a',awardNumber:'a',recipient:agency.name,state:'FL',city:null,kind:'grant',awardingAgency:null,description:null,startDate:null,endDate:null,awardAmount:null,sourceUrl:'https://www.usaspending.gov/award/ASST_NON_a'};
test('only grant recipients receive possible name matches; supplier never becomes the buyer',()=>{
 const contract={...grant,id:'CONT_AWD_b',kind:'contract' as const};
 const r=federalAccountCandidates([agency],[grant,contract]);
 assert.equal(r[0].account?.id,agency.id);assert.equal(r[0].status,'name-match');assert.equal(r[1].account,undefined);assert.equal(r[1].status,'supplier-not-buyer');
 assert.equal(federalAccountCandidates([agency,{...agency,id:'duplicate'}],[grant])[0].status,'ambiguous');
 assert.equal(agency.sourceFacts,undefined);
});
