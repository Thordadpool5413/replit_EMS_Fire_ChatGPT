import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import express from 'express';
test('shared pipeline validates scope, permissions, optimistic revisions and durable history',async()=>{
 assert.equal(process.env.ATLAS_EVIDENCE_CI,'1');
 assert.equal(process.env.DATABASE_URL,'postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci');
 process.env.ATLAS_AGENCY_EDITOR_IDS='pipeline-editor,pipeline-editor2';
 process.env.ATLAS_AGENCY_VIEWER_IDS='pipeline-viewer';
 const {db,pool,sessionsTable,agencyRecordsTable,workingPipelineHistoryTable}=await import('@workspace/db');
 const {authMiddleware}=await import('../middlewares/authMiddleware');
 const {default:router}=await import('./working-pipeline');
 const {eq}=await import('drizzle-orm');
 const app=express();app.use(express.json());app.use(authMiddleware);app.use(router);
 const server=app.listen(0,'127.0.0.1');
 try{
  await once(server,'listening');const addr=server.address();assert(addr&&typeof addr!=='string');
  const base='http://127.0.0.1:'+addr.port;
  for(const uid of ['pipeline-editor','pipeline-editor2','pipeline-viewer','pipeline-outsider'])await db.insert(sessionsTable).values({sid:'ci-'+uid,sess:{user:{id:uid},access_token:'local-test-only'},expire:new Date(Date.now()+60000)});
  const id='ci-working-pipeline',identityKey='FDID:FL:98371',agency={id,name:'CI fixture',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'98371',stateCode:'FL',name:'CI fixture',sourceUrl:'https://apps.usfa.fema.gov/registry/search'},zollOpportunity:{salesStage:'Target Lead'}};
  await db.insert(agencyRecordsTable).values({id,stateCode:'FL',payload:agency,revision:1});
  async function request(uid?:string,body?:unknown,headers?:Record<string,string>){
   const r=await fetch(base+'/agencies/'+id+'/working-pipeline',{method:body===undefined?'GET':'PUT',headers:{'Content-Type':'application/json',...(uid?{Authorization:'Bearer ci-'+uid}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
   assert.match(r.headers.get('cache-control')??'',/no-store/);return {status:r.status,body:await r.json()};
  }
  assert.equal((await request()).status,401);assert.equal((await request('pipeline-outsider')).status,403);
  const empty=await request('pipeline-editor');assert.equal(empty.status,200);assert.equal(empty.body.record,null);assert.equal(empty.body.identityKey,identityKey);assert.equal(empty.body.canWrite,true);
  assert.equal((await request('pipeline-viewer')).body.canWrite,false);
  const input={stage:'qualified',need:'CI need',authority:'Purchasing role',milestone:'',reference:'CI document',nextAction:'Verify scope',dueDate:'2027-01-01'};
  const write={identityKey,binding:empty.body.binding,expectedRevision:0,confirmed:true,input};
  assert.equal((await request('pipeline-viewer',write)).status,403);assert.equal((await request('pipeline-editor',{...write,confirmed:false})).status,400);
  assert.equal((await request('pipeline-editor',{...write,input:{...input,authority:''}})).status,400);
  assert.equal((await request('pipeline-editor',{...write,identityKey:'FDID:FL:OTHER'})).status,409);
  assert.equal((await request('pipeline-editor',write,{Origin:'https://other.example','Sec-Fetch-Site':'cross-site'})).status,403);
  const outcomes=await Promise.all([request('pipeline-editor',write),request('pipeline-editor2',write)]);
  assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);
  const shared=await request('pipeline-viewer');assert.equal(shared.body.record.revision,1);assert.equal(shared.body.record.stage,'qualified');
  const next=await request('pipeline-editor2',{...write,expectedRevision:1,input:{...input,stage:'evaluation',milestone:'CI evaluation'}});
  assert.equal(next.status,200);assert.equal(next.body.record.revision,2);assert.equal(next.body.record.history.length,2);
  assert.equal((await request('pipeline-editor',write)).status,409);
  const audit=await db.select().from(workingPipelineHistoryTable).where(eq(workingPipelineHistoryTable.agencyId,id));assert.equal(audit.length,2);assert.ok(audit.some(r=>r.revision===2&&r.actorUid==='pipeline-editor2'));
  const [saved]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,id));assert.equal(saved.revision,1);assert.deepEqual(saved.payload.zollOpportunity,agency.zollOpportunity);
  await db.insert(agencyRecordsTable).values({id:id+'-duplicate',stateCode:'FL',payload:{...agency,id:id+'-duplicate'},revision:1});
  assert.equal((await request('pipeline-viewer')).status,409);
  await db.delete(agencyRecordsTable).where(eq(agencyRecordsTable.id,id+'-duplicate'));
  await db.update(agencyRecordsTable).set({payload:{...agency,name:'Changed name'}}).where(eq(agencyRecordsTable.id,id));
  assert.equal((await request('pipeline-viewer')).status,409);
  assert.equal((await request('pipeline-editor',{...write,expectedRevision:2})).status,409);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end();}
});
