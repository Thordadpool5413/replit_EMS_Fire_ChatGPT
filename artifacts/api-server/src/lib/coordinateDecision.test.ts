import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './coordinateDecisionCatalog.json';
import {coordinateDecision,preserveCoordinateDecisions,COORDINATE_DECISION_FIELD,currentCoordinatePreview} from './coordinateDecision';
import {publicAgencyProfilePayload} from './publicAgencyProfile';
const c=catalog.candidates.find(c=>c.state==='VA'&&c.countyVerified&&!c.sharedSourcePoint)!;
const now='2026-11-25T12:10:00Z',id='test-account';
const review={id:'review',agencyId:id,fieldId:'identity.address.gis-candidate',action:'confirm',sourceRecordId:c.reviewSourceRecordId,sourceUrl:c.reviewSourceUrl,sourceName:c.reviewSourceName,sourcePeriod:c.reviewSourcePeriod,sourceKind:'dataset',originalValue:c.matchedAddress,previousValue:c.matchedAddress,reviewedAt:'2026-11-25T12:00:00Z',acknowledgedAt:'2026-11-25T12:01:00Z',acknowledgedBy:'editor',note:'Independent check'};
const agency={id,name:c.registryName,stateCode:c.state,countyFips:c.countyFips,registryIdentity:{sourceName:'USFA NFDR',identifier:c.sourceKey.split(':').at(-1),stateCode:c.state,sourceUrl:'https://apps.usfa.fema.gov/registry/search',name:c.registryName,sourceDate:c.registrySourceDate,address:c.registryAddress.street,city:c.registryAddress.city,postalCode:c.registryAddress.zip},_factReviews:[review]};
const request={id:'decision',action:'accept',sourceKey:c.sourceKey,reviewId:review.id,reason:'Independent address-point check',supportingUrl:'https://example.org/fixture',placementAttestation:'independently-checked-address-point'};
test('explicit private acceptance and rollback preserve original evidence; never publish',()=>{
 const a=coordinateDecision(agency,request,'editor',now);assert.equal(a.entry.latitude,c.latitude);assert.equal(a.entry.actor,'editor');assert.equal(a.entry.publicationEligible,false);assert.equal('latitude' in a.payload,false);
 assert.equal(coordinateDecision(a.payload,request,'editor',now).replay,true);
 assert.throws(()=>coordinateDecision(a.payload,{...request,reason:'changed'},'editor',now));
 assert.throws(()=>coordinateDecision(a.payload,{...request,id:'other'},'editor',now));
 assert.deepEqual(preserveCoordinateDecisions(a.payload,{...agency,[COORDINATE_DECISION_FIELD]:[]})[COORDINATE_DECISION_FIELD],a.payload[COORDINATE_DECISION_FIELD]);
 assert.equal(COORDINATE_DECISION_FIELD in preserveCoordinateDecisions(undefined,a.payload),false);
 assert.equal(COORDINATE_DECISION_FIELD in publicAgencyProfilePayload(a.payload),false);
 const rolled=coordinateDecision(a.payload,{id:'rollback',action:'rollback',targetDecisionId:'decision',reason:'Withdraw evidence'},'editor',now);
 assert.equal(rolled.entry.action,'rollback');assert.equal((rolled.payload[COORDINATE_DECISION_FIELD] as unknown[]).length,2);
 assert.throws(()=>coordinateDecision(rolled.payload,{id:'rollback2',action:'rollback',targetDecisionId:'decision',reason:'again'},'editor',now));
 for(const patch of [{_factReviews:[]},{_factReviews:[{...review,action:'flag'}]},{registryIdentity:{...agency.registryIdentity,address:'Changed'}},{countyFips:'99999'}])assert.throws(()=>coordinateDecision({...agency,...patch},request,'editor',now));
 assert.throws(()=>coordinateDecision(agency,{...request,latitude:1},'editor',now));
});

test('private map preview revalidates acceptance every time and disappears after rollback or changed evidence',()=>{
 const a=coordinateDecision(agency,request,'editor',now);
 const point=currentCoordinatePreview(a.payload,now);
 assert.equal(point?.latitude,c.latitude);assert.equal(point?.longitude,c.longitude);assert.equal(point?.publicationEligible,false);
 assert.equal(currentCoordinatePreview(agency,now),undefined);
 const rolled=coordinateDecision(a.payload,{id:'rb',action:'rollback',targetDecisionId:'decision',reason:'Withdraw'},'editor',now);
 assert.equal(currentCoordinatePreview(rolled.payload,now),undefined);
 assert.equal(currentCoordinatePreview({...a.payload,_factReviews:[{...review,action:'flag'}]},now),undefined);
 assert.equal(currentCoordinatePreview({...a.payload,registryIdentity:{...agency.registryIdentity,address:'Changed'}},now),undefined);
 assert.equal(currentCoordinatePreview({...a.payload,[COORDINATE_DECISION_FIELD]:[{...a.entry,latitude:1}]},now),undefined);
 assert.equal(currentCoordinatePreview({...a.payload,[COORDINATE_DECISION_FIELD]:[{...a.entry,publicationEligible:true}]},now),undefined);
});
