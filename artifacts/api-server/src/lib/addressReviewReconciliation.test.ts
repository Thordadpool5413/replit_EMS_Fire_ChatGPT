import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import catalog from './addressReviewCatalog.json';
import {GIS_REVIEW_FIELD,reconcileAddressReviews} from './addressReviewReconciliation';
const c=catalog.find(c=>c.identityKey==='FDID:VA:08520')!;
const now='2026-11-25T12:00:00Z';
const agency={id:'test-agency',name:c.name,stateCode:c.state,countyFips:c.county,registryIdentity:{sourceName:'USFA NFDR',identifier:'08520',stateCode:c.state,name:c.name,sourceUrl:'https://apps.usfa.fema.gov/registry/search'}};
const review={id:'test-review',agencyId:agency.id,fieldId:GIS_REVIEW_FIELD,action:'confirm',originalValue:c.originalValue,previousValue:c.originalValue,reviewer:'Self-entered name',method:'Document review',note:'Independent evidence check',sourceName:c.sourceName,sourceUrl:c.sourceUrl,sourceKind:'dataset',sourcePeriod:c.sourcePeriod,sourceRecordId:c.sourceRecordId,reviewedAt:now};
test('canonical actor, immutable GIS evidence and preservation on full updates',()=>{
 assert.equal(catalog.length,72);
 const incoming={...agency,_factReviews:[{...review,acknowledgedBy:'spoof',acknowledgedAt:'spoof'}]};
 const saved=reconcileAddressReviews(undefined,incoming,'editor',now);
 const rows=saved._factReviews as Record<string,unknown>[];
 assert.equal(rows[0].acknowledgedBy,'editor');assert.equal(rows[0].acknowledgedAt,now);
 assert.deepEqual(reconcileAddressReviews(saved,agency,'another-editor',now)._factReviews,rows);
 assert.deepEqual(reconcileAddressReviews(saved,{...agency,_factReviews:[review]},'another-editor',now)._factReviews,rows);
 assert.throws(()=>reconcileAddressReviews(saved,{...agency,_factReviews:[{...review,note:'tampered'}]},'editor',now),/immutable/);
 assert.throws(()=>reconcileAddressReviews(saved,{...agency,_factReviews:[{...review,fieldId:'identity.address'}]},'editor',now),/conflicts/);
 for(const patch of [{sourceRecordId:'fake'},{sourceUrl:'https://example.org'},{action:'correct'},{agencyId:'other'},{originalValue:'different'},{note:''},{reviewedAt:'bad'}])assert.throws(()=>reconcileAddressReviews(undefined,{...agency,_factReviews:[{...review,...patch}]},'editor',now),/does not match/);
 assert.throws(()=>reconcileAddressReviews(undefined,{...agency,stateCode:'WI',_factReviews:[review]},'editor',now));
 assert.equal('latitude' in saved,false);assert.equal('longitude' in saved,false);
});

test('server review catalog stays in exact parity with the frontend evidence release',()=>{
 const read=(name:string)=>JSON.parse(readFileSync(new URL('../../../ems-territory-intelligence/src/data/'+name,import.meta.url),'utf8'));
 const va=read('virginiaAddressReview.json'),multi=read('multiStateAddressReview.json');
 const fields:Record<string,string>={VA:'OBJECTID,FULLADDR,PO_NAME,STATE,ZIP_5,FIPS,POINTTYPE,CAPTUREMETH,STATUS,LASTUPDATE',MN:'objectid,anumber,st_name,postcomm,zip,co_code,place_loc,status,edit_date',WI:'OBJECTID,Add_Number,FullStNm,Post_Comm,Post_Code,County,Placement,DateUpdate',MI:'OBJECTID,STNUM,ADDRESS,CITY,State,ZIP,Status'};
 const expected=[...va.candidates.map((c:any)=>({c,state:'VA',snapshot:va.snapshotGeneratedAt,url:va.sourceUrl,label:'Virginia VGIN',date:va.checkedAt,placement:c.pointType,countyVerified:true,shared:false})),...multi.candidates.map((c:any)=>({c,state:c.state,snapshot:multi.snapshotGeneratedAt,url:multi.sources[c.state].url,label:multi.sources[c.state].label,date:multi.sources[c.state].checkedAt,placement:c.placementAsReported,countyVerified:!!c.countyFips,shared:multi.candidates.some((x:any)=>x.state===c.state&&x.objectId===c.objectId&&x.sourceKey!==c.sourceKey)}))].map(({c,state,snapshot,url,label,date,placement,countyVerified,shared})=>({state,identityKey:c.sourceKey,name:c.registryName,county:c.countyFips,registryCounty:c.registryCounty,originalValue:c.matchedAddress,sourceName:label,sourcePeriod:date,sourceUrl:url+'/query?'+new URLSearchParams({objectIds:String(c.objectId),outFields:fields[state],returnGeometry:'true',outSR:'4326',f:'pjson'}),sourceRecordId:JSON.stringify([c.sourceKey,snapshot,c.objectId,c.recordUpdatedAt,placement,countyVerified,shared])}));
 assert.deepEqual(catalog,expected);
});
