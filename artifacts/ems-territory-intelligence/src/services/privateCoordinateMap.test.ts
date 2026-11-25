import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrivateCoordinatePreview,privateCoordinateMapLink} from './privateCoordinateMap';
import type {ProfileAddressReview} from './multiStateAddressReview';
const c:ProfileAddressReview={sourceIdentityKey:'FDID:VA:fixture',snapshotGeneratedAt:'2026-11-25T00:00:00Z',objectId:1,matchedAddress:'Fixture',sourceLabel:'Fixture',sourceUrl:'https://example.org',checkedAt:'2026-11-25',placementAsReported:null,recordUpdatedAt:null,countyVerified:true,sharedSourcePoint:false,endUserValidationRequired:true};
const p={agencyId:'a',revision:3,decisionId:'d',sourceKey:c.sourceIdentityKey,matchedAddress:c.matchedAddress,latitude:37,longitude:-77,snapshotGeneratedAt:c.snapshotGeneratedAt,publicationEligible:false};
test('private preview binds current provider and retained source, no public coordinate link',()=>{
 const point=validatePrivateCoordinatePreview(p,'a',c);
 assert.equal(privateCoordinateMapLink(point),'/api/agencies/a/coordinate-map?open=1&decisionId=d&sourceKey=FDID%3AVA%3Afixture');
 for(const patch of [{agencyId:'wrong'},{sourceKey:'wrong'},{snapshotGeneratedAt:'stale'},{publicationEligible:true},{latitude:Infinity},{decisionId:''}])assert.throws(()=>validatePrivateCoordinatePreview({...p,...patch},'a',c));
 assert.throws(()=>validatePrivateCoordinatePreview(p,'a',{...c,sharedSourcePoint:true}));
});
