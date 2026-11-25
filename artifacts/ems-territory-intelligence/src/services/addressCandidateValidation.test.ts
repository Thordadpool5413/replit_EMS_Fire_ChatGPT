import test from 'node:test';
import assert from 'node:assert/strict';
import {ADDRESS_CANDIDATE_FIELD,candidateReviewSource,candidateValidationState,candidateReviewLabel} from './addressCandidateValidation';
import {appendFactReview,loadFactReviews,type FactReviewEntry} from './factReviewStore';
import type {ProfileAddressReview} from './multiStateAddressReview';
const c:ProfileAddressReview={sourceIdentityKey:'FDID:VA:fixture',snapshotGeneratedAt:'2026-11-25T00:00:00Z',objectId:1,matchedAddress:'123 Main Street, Example, VA, 22030',sourceLabel:'Fixture',sourceUrl:'https://example.org/query?objectIds=1',checkedAt:'2026-11-25',placementAsReported:null,recordUpdatedAt:null,countyVerified:true,sharedSourcePoint:false,endUserValidationRequired:true};
const source=candidateReviewSource(c);
const entry:FactReviewEntry={id:'one',agencyId:'agency',fieldId:ADDRESS_CANDIDATE_FIELD,action:'confirm',originalValue:c.matchedAddress,previousValue:c.matchedAddress,reviewer:'Test',method:'Independent check',note:'Confirmed address evidence only',sourceName:source.sourceName,sourceUrl:source.sourceUrl,sourceKind:source.sourceKind,sourcePeriod:source.reportingPeriod,sourceRecordId:source.sourceRecordId,reviewedAt:'2026-11-25T12:00:00Z'};
test('exact candidate review persists, remains separate from registry address and expires on evidence changes',()=>{
 const m=new Map<string,string>();const store={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};
 appendFactReview(entry,store);const history=loadFactReviews('agency',store);
 assert.equal(candidateValidationState(c,history),'User confirmed this value');assert.match(candidateReviewLabel(c,history),/not a verified pin/);
 assert.equal(candidateValidationState(c,[{...entry,fieldId:'identity.address'}]),'End-user validation required');
 for(const patch of [{objectId:2},{sourceIdentityKey:'different'},{snapshotGeneratedAt:'2026-11-26T00:00:00Z'},{placementAsReported:'Structure'},{matchedAddress:'Different address'},{sharedSourcePoint:true}])assert.equal(candidateValidationState({...c,...patch},history),'Source or value changed; review required');
 appendFactReview({...entry,id:'two',action:'flag',reviewedAt:'2026-11-25T13:00:00Z'},store);assert.equal(candidateValidationState(c,loadFactReviews('agency',store)),'Discrepancy flagged');
 assert.throws(()=>appendFactReview({...entry,id:'three',action:'correct',correctedValue:'Different'},store));
 assert.throws(()=>appendFactReview({...entry,id:'four',note:''},store));
 assert.throws(()=>appendFactReview({...entry,id:'five',sourceRecordId:undefined},store));
});
