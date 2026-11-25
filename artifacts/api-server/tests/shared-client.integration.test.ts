import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import type {Agency} from '../../ems-territory-intelligence/src/types';
import {readSharedDeal,saveSharedDeal} from '../../ems-territory-intelligence/src/services/sharedPipeline';
import {buildLeadershipReview} from '../../ems-territory-intelligence/src/services/leadershipReview';
import {buildTerritoryAnalytics} from '../../ems-territory-intelligence/src/services/territoryAnalytics';
import {EMPTY_DEAL, type DealInput} from '../../ems-territory-intelligence/src/services/workingPipeline';
import {commandSelection,currentCommandSample} from '../../ems-territory-intelligence/src/services/commandSession';

test('production API mounting, cookie sessions and actual shared-pipeline client integrate with analytics',async()=>{
 assert.equal(process.env.ATLAS_EVIDENCE_CI,'1');
 assert.equal(process.env.DATABASE_URL,'postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci');
 process.env.NODE_ENV='production';
 process.env.LOG_LEVEL='silent';
 // The AI constructor needs configuration at import time; this suite never calls AI or external services.
 process.env.AI_INTEGRATIONS_GEMINI_BASE_URL='http://127.0.0.1:1';
 process.env.AI_INTEGRATIONS_GEMINI_API_KEY='ci-fixture-not-a-secret';
 process.env.ATLAS_AGENCY_EDITOR_IDS='e2e-editor';
 process.env.ATLAS_AGENCY_VIEWER_IDS='e2e-viewer';
 const {db,pool,sessionsTable,agencyRecordsTable}=await import('@workspace/db');
 const {eq}=await import('drizzle-orm');
 const {default:app}=await import('../src/app');
 const server=app.listen(0,'127.0.0.1');
 try{
  await once(server,'listening');const addr=server.address();assert(addr&&typeof addr!=='string');
  const base='http://127.0.0.1:'+addr.port;
  process.env.ATLAS_PUBLIC_ORIGIN=base;
  const ready=await fetch(base+'/api/readyz');assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'no-store');assert.deepEqual(await ready.json(),{status:'ready'});
  const live=await fetch(base+'/api/healthz');assert.deepEqual(await live.json(),{status:'ok'});
  const id='ci-e2e-pipeline',identityKey='FDID:FL:98372';
  const agency={id,name:'CI fixture only',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'98372',stateCode:'FL',name:'CI fixture only',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'},fieldNotes:[],followUpTasks:[],zollOpportunity:{salesStage:'Target Lead'}} as unknown as Agency;
  await db.insert(agencyRecordsTable).values({id,stateCode:'FL',revision:1,payload:agency as unknown as Record<string,unknown>});
  for(const uid of ['e2e-editor','e2e-viewer','e2e-outsider']){
   await db.insert(sessionsTable).values({sid:'ci-'+uid,sess:{user:{id:uid,email:null,firstName:null,lastName:null,profileImageUrl:null},access_token:'local-test-only'},expire:new Date(Date.now()+120000)});
  }
  // Two independently authenticated cookie sessions emulate the client transport on separate devices.
  // The wrapper only resolves relative URLs and supplies the cookie a browser would attach.
  const session=(uid?:string):typeof fetch=>async(resource,init)=>{
   assert.equal(typeof resource,'string');assert.ok((resource as string).startsWith('/api/'));
   const headers=new Headers(init?.headers);headers.set('Origin',base);headers.set('Sec-Fetch-Site','same-origin');
   if(uid)headers.set('Cookie','sid=ci-'+uid);
   const response=await fetch(base+resource,{...init,headers});
   assert.match(response.headers.get('cache-control')??'',/no-store/);
   return response;
  };
  const desktop=session('e2e-editor'),mobile=session('e2e-viewer'),outsider=session('e2e-outsider');
  const who=await desktop('/api/auth/user');assert.equal((await who.json()).user.id,'e2e-editor');
  const empty=await readSharedDeal(id,identityKey,desktop);
  assert.equal(empty.canWrite,true);assert.equal(empty.record,undefined);
  const noRecord=await readSharedDeal(id,identityKey,mobile);assert.equal(noRecord.canWrite,false);
  await assert.rejects(readSharedDeal(id,identityKey,outsider));
  await assert.rejects(readSharedDeal(id,identityKey,session()));
  const now=Date.now(),today=new Date(now).toISOString().slice(0,10);
  const input:DealInput={...EMPTY_DEAL,stage:'qualified',need:'CI need',authority:'Purchasing role',reference:'CI source',nextAction:'Verify',dueDate:today};
  await assert.rejects(saveSharedDeal(empty,input,0,false,desktop));
  await assert.rejects(saveSharedDeal(noRecord,input,0,true,mobile));
  const saved=await saveSharedDeal(empty,input,0,true,desktop);assert.equal(saved.revision,1);
  const readMobile=await readSharedDeal(id,identityKey,mobile);assert.deepEqual(readMobile.record,saved);
  await assert.rejects(saveSharedDeal(empty,input,0,true,desktop));
  const desktopLatest=await readSharedDeal(id,identityKey,desktop);
  const second=await saveSharedDeal(desktopLatest,{...input,stage:'evaluation',milestone:'CI evaluation'},1,true,desktop);
  assert.equal(second.revision,2);
  const shared=await readSharedDeal(id,identityKey,mobile),asOf=Date.now();
  const resolve=()=>({location:undefined,match:undefined});
  const leadership=buildLeadershipReview([agency],[id],[],[shared],resolve,today,30,asOf,asOf);
  assert.equal(leadership.eligible,1);assert.equal(leadership.recorded,1);assert.equal(leadership.qualified,1);assert.equal(leadership.rows[0].stage,'evaluation');
  const analytics=buildTerritoryAnalytics([agency],[id],[],[shared],resolve,today,30,asOf,asOf);
  assert.equal(analytics.workingRecords,1);assert.equal(analytics.stageChanges,1);assert.equal(analytics.current.contacts,0);
  assert.equal(buildTerritoryAnalytics([agency],[id],[],[],resolve,today,30,asOf,asOf).deviceReadable,0);
  const selection=commandSelection([agency],'FL',[id]);assert.equal(selection.valid,true);
  assert.equal(currentCommandSample({samples:[],started:asOf,scope:selection.scope},selection,false,asOf),undefined);
  assert.equal(buildTerritoryAnalytics([agency],[id],[],[shared],resolve,today,30,asOf,asOf+300000).eligible,0);
  const canon=await desktop('/api/agencies/'+id);assert.equal((await canon.json()).agency.zollOpportunity.salesStage,'Target Lead');
  // Reject unrelated origins at the actual app entry point, before private records are exposed.
  const cross=await fetch(base+'/api/agencies/'+id+'/working-pipeline',{headers:{Origin:'https://other.example','Sec-Fetch-Site':'cross-site',Cookie:'sid=ci-e2e-editor'}});
  assert.equal(cross.status,403);assert.equal(cross.headers.get('access-control-allow-origin'),null);
  await db.delete(sessionsTable).where(eq(sessionsTable.sid,'ci-e2e-editor'));
  await assert.rejects(readSharedDeal(id,identityKey,desktop));
  await assert.rejects(saveSharedDeal(desktopLatest,input,1,true,desktop));
  assert.equal((await readSharedDeal(id,identityKey,mobile)).record?.revision,2);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await pool.end();}
});
