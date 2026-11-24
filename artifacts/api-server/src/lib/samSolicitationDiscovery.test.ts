import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAM_ENDPOINT,SAM_STATES,samDeadlineStatus,samPostedDay,samDeadlineValue,samWindow,parseSamQuery,validateSamPage,type SamQuery} from './samDiscoveryContract';
import {authorizedSamGateway,readSamConfig,samRequest,normalizeSamDiscovery,fetchSamDiscovery,createSamDiscoveryService} from './samSolicitationDiscovery';
const now=Date.parse('2026-11-24T12:00:00Z'),q:SamQuery={state:'FL',topic:'defibrillator',noticeType:'o',days:90,offset:0};
const key='fixture_key_not_a_secret_1234',gateway='fixture_gateway_not_a_secret_1234567890';
const id=(n:number)=>n.toString(16).padStart(32,'0');
const row=(n=1,changes:Record<string,unknown>={})=>({noticeId:id(n),title:'Defibrillator purchase',solicitationNumber:'EXAMPLE-001',type:'Solicitation',postedDate:'2026-11-20',responseDeadLine:'2026-12-01T14:00:00-05:00',active:'Yes',fullParentPathName:'EXAMPLE AGENCY',placeOfPerformance:{state:{code:'FL'},country:{code:'USA'}},officeAddress:{state:'GA'},typeOfSetAsideDescription:null,naicsCode:'334510',classificationCode:'6515',pointOfContact:[{email:'not-retained@example.invalid'}],resourceLinks:['https://example.invalid/file'],...changes});
const payload=(rows:unknown[],offset=0,total=rows.length)=>({totalRecords:total,limit:20,offset,opportunitiesData:rows});
const response=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('requires explicit feature flag, distinct secrets and gateway authorization; rejects cross-site calls',()=>{
 const env={ATLAS_SAM_DISCOVERY_ENABLED:'true',ATLAS_SAM_API_KEY:key,ATLAS_SAM_GATEWAY_TOKEN:gateway};
 const c=readSamConfig(env);assert.ok(c);assert.equal(c.dailyLimit,8);
 assert.equal(readSamConfig({...env,ATLAS_SAM_DISCOVERY_ENABLED:'false'}),undefined);
 assert.equal(readSamConfig({...env,ATLAS_SAM_GATEWAY_TOKEN:key}),undefined);
 assert.equal(readSamConfig({...env,ATLAS_SAM_DAILY_LIMIT:'0'}),undefined);
 assert.equal(authorizedSamGateway(c,gateway,'same-origin'),true);
 assert.equal(authorizedSamGateway(c,gateway,'cross-site'),false);
 assert.equal(authorizedSamGateway(c,'x'.repeat(gateway.length)),false);
 assert.equal(authorizedSamGateway(undefined,gateway),false);
});
test('fixed endpoint, bounded query and native page-index pagination',()=>{
 assert.equal(new Set(SAM_STATES).size,51);
 const u=samRequest({...q,offset:2},key,now);
 assert.equal(u.origin+u.pathname,SAM_ENDPOINT);assert.equal(u.searchParams.get('ptype'),'o');assert.equal(u.searchParams.get('state'),'FL');assert.equal(u.searchParams.get('offset'),'2');assert.equal(u.searchParams.get('limit'),'20');assert.equal(u.searchParams.get('postedTo'),'11/24/2026');
 assert.equal(samRequest({...q,state:'all'},key,now).searchParams.has('state'),false);
 for(const x of [{...q,state:'XX'},{...q,topic:'toString'},{...q,noticeType:'a'},{...q,days:366},{...q,offset:10},{...q,api_key:'caller-key'},{...q,url:'https://example.invalid'}])assert.equal(parseSamQuery(x),undefined);
 assert.equal(samWindow(365,now).windowStart,'2025-11-25');
});
test('native notice and place-of-performance retained, private/untrusted fields not copied',()=>{
 const r=normalizeSamDiscovery(payload([row()]),q,now),n=r.notices[0];
 assert.equal(n.performanceState,'FL');assert.equal(n.id,id(1));assert.equal(n.sourceUrl,'https://sam.gov/opp/'+id(1)+'/view');
 assert.equal(n.organization,'EXAMPLE AGENCY');assert.equal(n.deadline,'2026-12-01T14:00:00-05:00');
 assert.equal(JSON.stringify(r).includes('not-retained@'),false);assert.equal(JSON.stringify(r).includes('example.invalid/file'),false);
});
test('notice types and explicit timezone are separate from bid verification',()=>{
 for(const [noticeType,type] of [['k','Combined Synopsis/Solicitation'],['p','Presolicitation'],['r','Sources Sought']] as const)assert.equal(normalizeSamDiscovery(payload([row(1,{type})]),{...q,noticeType},now).notices[0].noticeType,noticeType);
 const notices=normalizeSamDiscovery(payload([row(1),row(2,{responseDeadLine:'2026-11-24T11:00:00Z'}),row(3,{responseDeadLine:'2026-12-01T14:00:00'}),row(4,{active:'No'}),row(5,{responseDeadLine:'2026-02-31'}),row(6,{active:null})]),q,now).notices;
 assert.deepEqual(notices.map(n=>samDeadlineStatus(n,now)),['Active reported · future response deadline','Published response deadline elapsed','Deadline timezone or time not confirmed','Archived / inactive reported','Response deadline not stated','Future response deadline · activity unconfirmed']);
});
test('wrong title, source type, state, country, dates and conflicting duplicate IDs withheld',()=>{
 const r=normalizeSamDiscovery(payload([row(1),row(1,{solicitationNumber:'changed'}),row(2),row(2),row(3,{type:'Award Notice'}),row(4,{placeOfPerformance:null}),row(5,{title:'Office supplies'}),row(6,{postedDate:'2025-01-01'}),row(7,{placeOfPerformance:{state:{code:'FL'},country:{code:'CAN'}}})]),q,now);
 assert.deepEqual(r.notices.map(n=>n.id),[id(2)]);assert.equal(r.duplicates,1);assert.equal(r.withheld,7);
});
test('bounded source pages, schema and client contract fail closed',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i+1)),r=normalizeSamDiscovery(payload(rows,0,201),q,now);
 assert.equal(r.nextOffset,1);assert.equal(normalizeSamDiscovery(payload(rows,9,201),{...q,offset:9},now).scopeCapped,true);
 assert.throws(()=>normalizeSamDiscovery(payload([row()],0,100),q,now));
 assert.throws(()=>normalizeSamDiscovery({},q,now));
 for(const p of [{...r,fetchedAt:'2025-01-01'},{...r,sourceRows:1},{...r,notices:[{...r.notices[0],sourceUrl:'https://example.invalid'}]},{...r,query:{...q,state:'GA'}}])assert.throws(()=>validateSamPage(p,q,now));
 assert.equal(readFileSync(new URL('./samDiscoveryContract.ts',import.meta.url),'utf8'),readFileSync(new URL('../../../ems-territory-intelligence/src/services/samDiscoveryContract.ts',import.meta.url),'utf8'));
});
test('upstream key, links and error messages cannot escape; quota is explicit',async()=>{
 const page=await fetchSamDiscovery(q,key,async(url,init)=>{assert.equal(new URL(String(url)).searchParams.get('api_key'),key);assert.equal(init?.redirect,'error');return response(payload([row()]));},now);
 assert.equal(JSON.stringify(page).includes(key),false);
 for(const f of [async()=>{throw Error('request failed '+key);},async()=>response(payload([row(1,{title:'Defibrillator '+key})])),async()=>new Response('not found '+key,{status:404}),async()=>new Response('{}',{headers:{'content-type':'application/json'}})]){
  await assert.rejects(fetchSamDiscovery(q,key,f,now),e=>e instanceof Error&&e.message==='SAM.gov discovery unavailable.'&&!e.message.includes(key));
 }
 await assert.rejects(fetchSamDiscovery(q,key,async()=>new Response('rate limit',{status:429}),now),/budget reached/);
});
test('cache coalesces, daily quota caps upstream calls, no stale fallback and resets on UTC day',async()=>{
 let t=now,calls=0;
 const s=createSamDiscoveryService({apiKey:key,gatewayToken:gateway,dailyLimit:1},async()=>{calls++;return response(payload([row()]));},()=>t);
 const [a,b]=await Promise.all([s(q),s(q)]);assert.equal(calls,1);assert.equal(a.fetchedAt,b.fetchedAt);
 await assert.rejects(s({...q,topic:'monitor'}),/budget reached/);
 t+=16*60_000;await assert.rejects(s(q),/budget reached/);assert.equal(calls,1);
 t+=86_400_000;await s(q);assert.equal(calls,2);
});
test('upstream 429 stops uncached requests for the UTC day',async()=>{
 let calls=0;
 const s=createSamDiscoveryService({apiKey:key,gatewayToken:gateway,dailyLimit:8},async()=>{calls++;return new Response('limit',{status:429});},()=>now);
 await assert.rejects(s(q),/budget reached/);await assert.rejects(s({...q,topic:'monitor'}),/budget reached/);assert.equal(calls,1);
});

test('calendar guards accept valid day and timestamp inputs without unsafe type assertions',()=>{
 assert.equal(samPostedDay('2026-11-24'),'2026-11-24');
 assert.equal(samPostedDay('2026-11-24 13:15:00'),'2026-11-24');
 assert.equal(samPostedDay('2026-02-29 13:15:00'),null);
 assert.equal(samPostedDay(20261124),null);
 assert.equal(samDeadlineValue('2026-11-24'),'2026-11-24');
 assert.equal(samDeadlineValue('2026-11-24T13:15:00-05:00'),'2026-11-24T13:15:00-05:00');
 assert.equal(samDeadlineValue('2026-11-24T25:15:00'),null);
 assert.equal(samDeadlineValue('2026-02-31T13:15:00Z'),null);
 assert.equal(samDeadlineValue(null),null);
});
