import assert from "node:assert/strict";
import test from "node:test";
import {once} from "node:events";
import express from "express";
import {parseObservation,parseDecision} from "../lib/facilityEquipment";
const observation={family:"monitors",maker:"zoll",model:"CI fixture",apparatus:"",observedOn:"2025-01-01",basis:"direct-observation",sourceUrl:"",description:"Test fixture only"};
test("equipment input requires dated attribution and explicit review",()=>{
 assert.ok(parseObservation(observation,"2026-01-01"));
 for(const p of [{observedOn:"2025-02-30"},{observedOn:"2027-01-01"},{maker:"invented"},{description:""},{basis:"public-document"},{basis:"public-document",sourceUrl:"javascript:alert(1)"}])assert.equal(parseObservation({...observation,...p},"2026-01-01"),undefined);
 assert.ok(parseObservation({...observation,basis:"public-document",sourceUrl:"https://example.gov/fixture"}));
 assert.equal(parseDecision({decision:"accepted",note:"CI",attested:false}),undefined);
});
test("station equipment is private, immutable, independently reviewed and station scoped",async()=>{
 assert.equal(process.env.ATLAS_EVIDENCE_CI,"1");
 assert.equal(process.env.DATABASE_URL,"postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci");
 process.env.ATLAS_AGENCY_EDITOR_IDS="eq-author,eq-reviewer";process.env.ATLAS_AGENCY_VIEWER_IDS="eq-viewer";
 const {db,pool,sessionsTable,agencyRecordsTable}=await import("@workspace/db");
 const {authMiddleware}=await import("../middlewares/authMiddleware");
 const {makeFacilityEquipmentRouter}=await import("./facility-equipment");
 const parentId="FD12345678",stationId="ST123456789012",agencyId="ci-station-equipment";
 const router=makeFacilityEquipmentRouter(async parent=>({parent,facilities:[{source:"NERIS" as const,sourceRecordId:stationId,name:"CI fixture",address:null,city:null,stateCode:"FL",postalCode:null,coordinates:null,sourceUrl:"https://services5.arcgis.com/example",exportDate:null,endUserValidationRequired:true as const}],withheld:0,reportedStationCount:1,retrievedAt:new Date().toISOString(),warning:null}));
 const app=express();app.use(express.json());app.use(authMiddleware);app.use(router);const server=app.listen(0,"127.0.0.1");
 try{
  await once(server,"listening");const addr=server.address();assert(addr&&typeof addr!=="string");const base="http://127.0.0.1:"+addr.port;
  for(const uid of ["eq-author","eq-reviewer","eq-viewer","eq-outsider"])await db.insert(sessionsTable).values({sid:"ci-"+uid,sess:{user:{id:uid},access_token:"local-test-only"},expire:new Date(Date.now()+60000)});
  await db.insert(agencyRecordsTable).values({id:agencyId,stateCode:"FL",payload:{id:agencyId,stateCode:"FL",registryIdentity:{sourceName:"NERIS",identifier:parentId,stateCode:"FL",sourceUrl:"https://services5.arcgis.com/example"}}});
  const root="/agencies/"+agencyId+"/facilities/"+parentId+"/"+stationId+"/equipment",id="a1234567-1234-4234-8234-123456789012",body={submissionId:id,observation};
  async function req(path:string,uid?:string,payload?:unknown){const r=await fetch(base+path,{method:payload?"POST":"GET",headers:{"Content-Type":"application/json",...(uid?{Authorization:"Bearer ci-"+uid}:{})},...(payload?{body:JSON.stringify(payload)}:{})});assert.match(r.headers.get("cache-control")??"",/no-store/);return {status:r.status,body:await r.json()};}
  assert.equal((await req(root)).status,401);assert.equal((await req(root,"eq-outsider")).status,403);assert.equal((await req(root,"eq-viewer",body)).status,403);
  assert.equal((await req(root.replace(stationId,"OTHER"),"eq-author",body)).status,409);
  const created=await req(root,"eq-author",body);assert.equal(created.status,200);assert.equal(created.body.decision,null);assert.equal(created.body.sourceSnapshot.endUserValidationRequired,true);
  assert.equal((await req(root,"eq-author",body)).status,200);
  assert.equal((await req(root,"eq-author",{...body,observation:{...observation,model:"changed"}})).status,409);
  const review=root+"/"+id+"/review",decision={decision:"accepted",note:"CI independent review",attested:true};
  assert.equal((await req(review,"eq-author",decision)).status,403);assert.equal((await req(review,"eq-viewer",decision)).status,403);
  assert.equal((await req(review,"eq-reviewer",{...decision,attested:false})).status,400);
  assert.equal((await req(review,"eq-reviewer",decision)).status,200);assert.equal((await req(review,"eq-reviewer",decision)).status,200);
  assert.equal((await req(review,"eq-reviewer",{...decision,decision:"rejected"})).status,409);
  const list=await req(root,"eq-viewer");assert.equal(list.body.rows.length,1);assert.equal(list.body.rows[0].decision,"accepted");assert.equal(list.body.canWrite,false);
  assert.equal((await req(root.replace(stationId,"OTHER"),"eq-viewer")).body.rows.length,0);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await pool.end();}
});
