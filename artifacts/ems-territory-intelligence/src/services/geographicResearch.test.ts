import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact} from './documentedIntelligence';
import {toSharedEvidence,sharedAgencyKey} from './sharedEvidence';
import {buildGeographicResearch,groupNearby,distanceMiles,type LocatedAccount,type ResolveLocation} from './geographicResearch';
import type {ReviewedSample} from './reviewedAccountPriorities';
const now=Date.parse('2026-11-24T12:00:00Z');
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456'),c=agency('34567');
function sample(a:Agency):ReviewedSample{
 const f=createIntelligenceFact(a,{kind:'grant-awarded',value:'Fixture grant',sourceName:'Fixture City',sourceRecordId:'grant-'+a.id,sourceUrl:'https://example.gov/grant',documentDate:'2026-11-01'},'grant-'+a.id,now-86400000);
 return {agencyId:a.id,identityKey:sharedAgencyKey(a)!,checkedAt:new Date(now).toISOString(),rows:[{evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00Z',invalid:0,decisions:[{factId:f.id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00Z'}]}]};
}
const resolve:ResolveLocation=(a)=>({location:{identityKey:sharedAgencyKey(a)!,address:{street:'100 Fixture Street',city:'Fixture',state:'FL',zip:'12345'},kind:'registry headquarters',sourceName:'Fixture',sourceUrl:'https://apps.usfa.fema.gov/registry/search'},match:a.id===c.id?undefined:{method:'census-address-range',latitude:28,longitude:a.id==='12345'?-80:-80.1,matchedAddress:'100 Fixture Street, Fixture, FL, 12345'}});
test('eligible exact mapped identity grouped; missing coordinates remain separate',()=>{
 const all=[a,b,c],r=buildGeographicResearch(all,all.map(x=>x.id),all.map(sample),resolve,25,now);
 assert.equal(r.located.length,2);assert.equal(r.clusters.length,1);assert.equal(r.unmapped.length,1);assert.equal(r.located[0].approximate,true);
 assert.equal(buildGeographicResearch(all,[a.id],[sample(a)],()=>({location:undefined,match:undefined}),25,now).unmapped.length,1);
 assert.equal(buildGeographicResearch(all,[a.id],[sample(a)],resolve,25,now+300000).located.length,0);
 assert.equal(buildGeographicResearch([...all,{...a,id:'duplicate'}],[a.id],[sample(a)],resolve,25,now).located.length,0);
});
test('complete-link groups prevent chain expansion and separate states',()=>{
 const point=(a:Agency,lng:number):LocatedAccount=>({agency:a,identityKey:a.id,point:{lat:0,lng},address:'fixture',sourceUrl:'https://example.gov',matchLabel:'fixture',approximate:true,signals:[]});
 const points=[point(a,1),point(b,1.1),point(c,1.2)];
 assert.ok(distanceMiles(points[0].point,points[1].point)<10);
 const g=groupNearby(points,10);assert.equal(g.length,2);assert.ok(g.every(x=>x.diameterMiles<=10));
 assert.deepEqual(groupNearby([...points].reverse(),10),g);
 assert.equal(groupNearby([point(a,1),point({...b,stateCode:'GA'},1)],10).length,2);
});
