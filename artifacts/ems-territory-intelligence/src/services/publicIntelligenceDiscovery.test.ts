import test from 'node:test';
import assert from 'node:assert/strict';
import type { Agency } from '../types';
import {buildDiscoveryMatches,validateDiscoveryPage,type DiscoveryCandidate} from './publicIntelligenceDiscovery';
const now=Date.parse('2026-11-24T12:00:00Z'),q={state:'FL',fromYear:2023,offset:0};
const url=new URL('https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants');
url.searchParams.set('$filter',"vendorState eq 'FL' and fiscalYear ge 2023 and startswith(programName,'Assistance to Firefighters')");
url.searchParams.set('$orderby','fiscalYear desc,awardNumber asc,id asc');url.searchParams.set('$select','id,awardNumber,vendorName,vendorState,programName,fiscalYear,awardAmount');url.searchParams.set('$top','51');url.searchParams.set('$skip','0');
const candidate:DiscoveryCandidate={id:'id-1',awardNumber:'EMW-2025-FG-001',recipient:'EXAMPLE FIRE DEPARTMENT',state:'FL',program:'Assistance to Firefighters Grant',fiscalYear:2025,awardAmount:0,documentDate:null,sourceUrl:url.toString()};
const page={schemaVersion:1,source:'openfema-afg',query:q,sourceUrl:url.toString(),documentationUrl:'https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1',fetchedAt:new Date(now).toISOString(),sourceRows:1,withheld:0,duplicates:0,nextOffset:null,scopeCapped:false,candidates:[candidate]};
const a={id:'registry-FDID-FL-12345',name:'Example Fire Department',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL'}} as Agency;
test('validates exact source, scope, freshness and real null or zero values',()=>{
 assert.deepEqual(validateDiscoveryPage(page,q,now).candidates,[candidate]);
 for(const p of [{...page,fetchedAt:'2025-01-01'},{...page,sourceRows:2},{...page,sourceUrl:'https://example.gov'},{...page,nextOffset:50},{...page,candidates:[{...candidate,state:'GA'}]},{...page,candidates:[{...candidate,documentDate:'2025-01-01'}]},{...page,candidates:[{...candidate,sourceUrl:'https://evil.example'}]}])assert.throws(()=>validateDiscoveryPage(p,q,now));
});
test('recipient matches only a unique source-native identity in the same state and never assigns a fact',()=>{
 const result=buildDiscoveryMatches([a],[candidate])[0];assert.equal(result.status,'name-match');assert.equal(result.account?.id,a.id);
 assert.equal(buildDiscoveryMatches([{...a,stateCode:'GA'}],[candidate])[0].status,'unmatched');
 assert.equal(buildDiscoveryMatches([{...a,registryIdentity:undefined}],[candidate])[0].status,'ambiguous');
 assert.equal(buildDiscoveryMatches([a,{...a,id:'duplicate'}],[candidate])[0].status,'ambiguous');
 assert.equal(buildDiscoveryMatches([a,{...a,name:'Other department'}],[candidate])[0].status,'ambiguous');
 assert.equal(buildDiscoveryMatches([a],[{...candidate,recipient:'Example Fire'}])[0].status,'unmatched');
 assert.equal(a.sourceFacts,undefined);
});
