import assert from "node:assert/strict";
import test from "node:test";
import {once} from "node:events";
import express from "express";
test("private station observations are authorized, append-only, source-linked and idempotent",async()=>{
 assert.equal(process.env.ATLAS_EVIDENCE_CI,"1");
 assert.equal(process.env.DATABASE_URL,"postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci");
 process.env.ATLAS_AGENCY_EDITOR_IDS="station-editor";
 process.env.ATLAS_AGENCY_VIEWER_IDS="station-viewer";
 const {db,pool,sessionsTable,agencyRecordsTable}=await import("@workspace/db");
 const {authMiddleware}=await import("../middlewares/authMiddleware");
 const {makeFacilityNotesRouter}=await import("./facility-notes");
 const parentId="FD12345678",stationId="ST123456789012",agencyId="ci-facility-notes";
 let calls=0;
 const router=makeFacilityNotesRouter(async parent=>{calls++;return {parent,facilities:[{source:"NERIS" as const,sourceRecordId:stationId,name:"CI fixture",address:null,city:null,stateCode:"FL",postalCode:null,coordinates:null,sourceUrl:"https://services5.arcgis.com/example",exportDate:null,endUserValidationRequired:true as const}],withheld:0,reportedStationCount:1,retrievedAt:new Date().toISOString(),warning:null};});
 const app=express();app.use(express.json());app.use(authMiddleware);app.use(router);
 const server=app.listen(0,"127.0.0.1");
 try{
  await once(server,"listening");const addr=server.address();assert(addr&&typeof addr!=="string");
  const base="http://127.0.0.1:"+addr.port;
  for(const id of ["station-editor","station-viewer","station-outsider"])await db.insert(sessionsTable).values({sid:"ci-"+id,sess:{user:{id},access_token:"local-test-only"},expire:new Date(Date.now()+60000)});
  await db.insert(agencyRecordsTable).values({id:agencyId,stateCode:"FL",payload:{id:agencyId,stateCode:"FL",registryIdentity:{sourceName:"NERIS",identifier:parentId,stateCode:"FL",sourceUrl:"https://services5.arcgis.com/example"}}});
  const root="/agencies/"+agencyId+"/facilities/"+parentId+"/"+stationId+"/notes";
  const note={submissionId:"a1234567-1234-4234-8234-123456789012",note:"CI observation"};
  async function request(path:string,user?:string,body?:unknown){const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(user?{Authorization:"Bearer ci-"+user}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.match(r.headers.get("cache-control")??"",/no-store/);return {status:r.status,body:await r.json()};}
  assert.equal((await request(root)).status,401);
  assert.equal((await request(root,"station-outsider")).status,403);
  assert.equal((await request(root,"station-viewer",note)).status,403);
  assert.equal((await request(root.replace(stationId,"bad%20id"),"station-editor")).status,400);
  assert.equal((await request(root.replace(parentId,"bad%20id"),"station-editor",note)).status,400);
  assert.equal(calls,0);
  assert.equal((await request(root.replace(stationId,"OTHER"),"station-editor",note)).status,409);
  assert.equal((await request(root.replace(parentId,"OTHER"),"station-editor",note)).status,404);
  const saved=await request(root,"station-editor",note);assert.equal(saved.status,200);assert.equal(saved.body.sourceSnapshot.endUserValidationRequired,true);
  assert.equal((await request(root,"station-editor",note)).status,200);assert.equal(calls,2);
  assert.equal((await request(root,"station-editor",{...note,note:"changed"})).status,409);
  const list=await request(root,"station-viewer");assert.equal(list.body.notes.length,1);assert.equal(list.body.canWrite,false);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await pool.end();}
});
