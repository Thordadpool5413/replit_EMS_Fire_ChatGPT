import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {authorityIdentity,parseAuthority} from '../lib/agencyAuthority';
const agency={id:'ci-authority',name:'Fixture Agency',stateCode:'FL'};
const observation={name:'Fixture official',title:'Fixture chief',organization:'Fixture Agency',role:'final-approval',scope:'Specific fixture purchase',observedOn:'2025-01-01',basis:'official-document',sourceUrl:'https://example.gov/fixture',description:'Fixture evidence only'};
test('authority requires dated explicit scope, never inferred titles',()=>{
 assert.deepEqual(parseAuthority(observation,'2026-01-01'),observation);
 for(const p of [{scope:''},{role:'invented'},{observedOn:'2025-02-30'},{observedOn:'2027-01-01'},{sourceUrl:'javascript:alert(1)'},{description:''},{basis:'agency-confirmation'}])assert.equal(parseAuthority({...observation,...p},'2026-01-01'),undefined);
 assert.ok(authorityIdentity(agency));assert.notEqual(authorityIdentity(agency),authorityIdentity({...agency,name:'Changed'}));
 assert.equal(authorityIdentity({...agency,dataProvenanceTier:'generated_prospect'}),undefined);
});
test('private authority claims are immutable, independently reviewed and identity scoped',async()=>{
 assert.equal(process.env.ATLAS_EVIDENCE_CI,'1');
 assert.equal(process.env.DATABASE_URL,'postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci');
 process.env.ATLAS_AGENCY_EDITOR_IDS='authority-author,authority-reviewer';process.env.ATLAS_AGENCY_VIEWER_IDS='authority-viewer';
 const {db,pool,sessionsTable,agencyRecordsTable}=await import('@workspace/db');
 const {eq}=await import('drizzle-orm');
 const {authMiddleware}=await import('../middlewares/authMiddleware');
 const {default:router}=await import('./agency-authority');
 const app=express();app.use(express.json());app.use(authMiddleware);app.use(router);const server=app.listen(0,'127.0.0.1');
 try{
  await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
  for(const uid of ['authority-author','authority-reviewer','authority-viewer','authority-outsider'])await db.insert(sessionsTable).values({sid:'ci-'+uid,sess:{user:{id:uid},access_token:'local-test-only'},expire:new Date(Date.now()+60000)});
  await db.insert(agencyRecordsTable).values({id:agency.id,stateCode:agency.stateCode,payload:agency});
  const root='/agencies/'+agency.id+'/authority',submissionId='a1234567-1234-4234-8234-123456789012',identity=authorityIdentity(agency)!,body={submissionId,identity,observation};
  async function req(path:string,uid?:string,payload?:unknown){const r=await fetch(base+path,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json',...(uid?{Authorization:'Bearer ci-'+uid}:{})},...(payload?{body:JSON.stringify(payload)}:{})});assert.match(r.headers.get('cache-control')??'',/no-store/);return {status:r.status,body:await r.json()};}
  assert.equal((await req(root)).status,401);assert.equal((await req(root,'authority-outsider')).status,403);assert.equal((await req(root,'authority-viewer',body)).status,403);
  assert.equal((await req(root,'authority-author')).body.identity,identity);
  assert.equal((await req(root,'authority-author',{...body,identity:'wrong'})).status,409);
  assert.equal((await req(root,'authority-author',body)).status,200);
  assert.equal((await req(root,'authority-author',body)).status,200);
  assert.equal((await req(root,'authority-author',{...body,observation:{...observation,scope:'changed'}})).status,409);
  const review=root+'/'+submissionId+'/review',decision={identity,decision:'accepted',note:'Fixture review',attested:true};
  assert.equal((await req(review,'authority-author',decision)).status,403);
  assert.equal((await req(review,'authority-viewer',decision)).status,403);
  assert.equal((await req(review,'authority-reviewer',{...decision,attested:false})).status,400);
  assert.equal((await req(review,'authority-reviewer',decision)).status,200);
  assert.equal((await req(review,'authority-reviewer',decision)).status,200);
  assert.equal((await req(review,'authority-reviewer',{...decision,decision:'rejected'})).status,409);
  const list=await req(root,'authority-viewer');assert.equal(list.body.rows.length,1);assert.equal(list.body.rows[0].decision,'accepted');assert.equal(list.body.canWrite,false);
  await db.update(agencyRecordsTable).set({payload:{...agency,name:'Changed fixture'}}).where(eq(agencyRecordsTable.id,agency.id));
  const changed=await req(root,'authority-viewer');assert.equal(changed.body.rows.length,0);assert.equal(changed.body.withheld,1);
  assert.equal((await req(review,'authority-reviewer',decision)).status,409);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await pool.end();}
});
