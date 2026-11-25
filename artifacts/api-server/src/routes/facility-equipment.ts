import {Router,type IRouter} from "express";
import {and,desc,eq,isNull} from "drizzle-orm";
import {db,agencyRecordsTable,facilityEquipmentTable as equipment} from "@workspace/db";
import {requireAgencyWorkspace,agencyWorkspaceRole} from "../middlewares/agencyWorkspaceAccess";
import {listDepartmentFacilities} from "../lib/fireRegistry";
import {linkedNerisParent} from "./facility-notes";
import {object,parseObservation,parseDecision,uuid,nativeId} from "../lib/facilityEquipment";
const path="/agencies/:agencyId/facilities/:parentId/:stationId/equipment";
function scope(params:Record<string,unknown>){
 const {agencyId,parentId,stationId}=params;
 if(typeof agencyId!=="string"||!agencyId.trim()||agencyId.length>300||typeof parentId!=="string"||typeof stationId!=="string"||!nativeId.test(parentId)||!nativeId.test(stationId))return undefined;
 return {agencyId,parentId,stationId};
}
type Scope=NonNullable<ReturnType<typeof scope>>;
const where=(s:Scope)=>and(eq(equipment.agencyId,s.agencyId),eq(equipment.parentId,s.parentId),eq(equipment.stationId,s.stationId));
const key=(s:Scope,id:string)=>and(where(s),eq(equipment.submissionId,id));
const canonical=(v:unknown)=>JSON.stringify(Object.entries(object(v)).sort(([a],[b])=>a.localeCompare(b)));
export function makeFacilityEquipmentRouter(loadFacilities=listDepartmentFacilities):IRouter{
 const router:IRouter=Router();
 // A bounded read-only sample. Geometry comes from the current station source, not equipment observations or HQ.
 router.get(["/agencies/:agencyId/facilities/:parentId/equipment-map","/agencies/:agencyId/facilities/:parentId/equipment-lifecycle"],requireAgencyWorkspace,async(req,res)=>{
  const {agencyId,parentId}=req.params;
  if(typeof agencyId!=="string"||!agencyId.trim()||agencyId.length>300||typeof parentId!=="string"||!nativeId.test(parentId)){res.status(400).json({error:"Invalid department identity."});return;}
  try{
   const [a]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,agencyId)).limit(1);
   const parent=a&&linkedNerisParent(a.payload,parentId);
   if(!parent){res.status(404).json({error:"Save and link the exact department first."});return;}
   const source=await loadFacilities(parent);
   if(source.warning||source.withheld||source.facilities.length>1000){res.status(409).json({error:"Incomplete or unavailable station source; map sample withheld."});return;}
   const rows=await db.select().from(equipment).where(and(eq(equipment.agencyId,agencyId),eq(equipment.parentId,parentId),eq(equipment.decision,"accepted"))).limit(2001);
   if(rows.length>2000){res.status(409).json({error:"Equipment sample exceeds safe limit; narrow scope."});return;}
   const [current]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,agencyId)).limit(1);
   if(!current||!linkedNerisParent(current.payload,parentId)||current.stateCode!==parent.stateCode){res.status(409).json({error:"Department association changed; refresh."});return;}
   const facilities=source.facilities.filter(f=>f.source==="NERIS"&&f.sourceRecordId&&nativeId.test(f.sourceRecordId));
   const ids=new Set(facilities.map(f=>f.sourceRecordId));
   if(ids.size!==facilities.length||facilities.length!==source.facilities.length){res.status(409).json({error:"Station identity ambiguous; map sample withheld."});return;}
   const lifecycle=req.path.endsWith("/equipment-lifecycle");
   if(lifecycle){
    const observations=rows.flatMap(r=>{
     const o=parseObservation(r.observation);
     if(!o||!r.reviewerUid||r.authorUid===r.reviewerUid||!r.reviewedAt||!r.reviewNote||!ids.has(r.stationId))return [];
     if(!o.acquiredOn&&!o.warrantyEnd&&!o.serviceEnd)return [];
     return [{stationId:r.stationId,submissionId:r.submissionId,family:o.family,maker:o.maker,model:o.model,apparatus:o.apparatus,observedOn:o.observedOn,basis:o.basis,sourceUrl:o.sourceUrl,acquiredOn:o.acquiredOn,warrantyEnd:o.warrantyEnd,serviceEnd:o.serviceEnd}];
    });
    res.json({agencyId,parentId,stations:facilities.map(f=>({id:f.sourceRecordId,name:f.name,stateCode:f.stateCode})),observations,acceptedRowsChecked:rows.length,checkedAt:new Date().toISOString()});return;
   }
   const observations=rows.flatMap(r=>{
    const o=parseObservation(r.observation);
    if(!o||!r.reviewerUid||r.authorUid===r.reviewerUid||!r.reviewedAt||!r.reviewNote||!ids.has(r.stationId))return [];
    return [{stationId:r.stationId,family:o.family,maker:o.maker,observedOn:o.observedOn}];
   });
   res.json({agencyId,parentId,facilities,observations,withheldEvidence:rows.length-observations.length,checkedAt:new Date().toISOString(),sourceRetrievedAt:source.retrievedAt});
  }catch(e){req.log?.warn({err:e},"Station competitive map unavailable");res.status(503).json({error:"Station competitive map unavailable."});}
 });
 router.get(path,requireAgencyWorkspace,async(req,res)=>{
  const s=scope(req.params);if(!s){res.status(400).json({error:"Invalid facility identity."});return;}
  try{
   const [a]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,s.agencyId)).limit(1);
   if(!a||!linkedNerisParent(a.payload,s.parentId)){res.status(404).json({error:"Save and link the exact department first."});return;}
   const rows=await db.select().from(equipment).where(where(s)).orderBy(desc(equipment.createdAt),desc(equipment.submissionId)).limit(101);
   const uid=req.isAuthenticated()?req.user.id:"";
   const editor=agencyWorkspaceRole(uid)==="editor";
   res.json({rows:rows.slice(0,100).map(r=>({...r,canReview:editor&&r.authorUid!==uid&&!r.decision})),more:rows.length>100,canWrite:editor});
  }catch(e){req.log?.warn({err:e},"Station equipment unavailable");res.status(503).json({error:"Station equipment unavailable."});}
 });
 router.post(path,requireAgencyWorkspace,async(req,res)=>{
  const s=scope(req.params),body=object(req.body),id=body.submissionId,observation=parseObservation(body.observation);
  if(!s||typeof id!=="string"||!uuid.test(id)||!observation){res.status(400).json({error:"Invalid dated equipment observation."});return;}
  if(!req.isAuthenticated()){res.status(401).json({error:"Sign in required."});return;}const uid=req.user.id;
  try{
   const [a]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,s.agencyId)).limit(1);
   const parent=a&&linkedNerisParent(a.payload,s.parentId);
   if(!parent){res.status(404).json({error:"Save and link the exact department first."});return;}
   const [prior]=await db.select().from(equipment).where(key(s,id)).limit(1);
   if(prior){if(prior.authorUid!==uid||canonical(prior.observation)!==canonical(observation)){res.status(409).json({error:"Submission content conflicts."});return;}res.json(prior);return;}
   const source=await loadFacilities(parent),matches=source.facilities.filter(f=>f.source==="NERIS"&&f.sourceRecordId===s.stationId);
   if(source.warning||matches.length!==1){res.status(409).json({error:"Current station relationship unavailable."});return;}
   const row=await db.transaction(async tx=>{
    const [current]=await tx.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,s.agencyId)).for("update");
    if(!current||!linkedNerisParent(current.payload,s.parentId)||current.stateCode!==parent.stateCode)return undefined;
    await tx.insert(equipment).values({...s,submissionId:id,observation,authorUid:uid,sourceSnapshot:{...matches[0],retrievedAt:source.retrievedAt,endUserValidationRequired:true}}).onConflictDoNothing();
    const [saved]=await tx.select().from(equipment).where(key(s,id)).limit(1);return saved;
   });
   if(!row||row.authorUid!==uid||canonical(row.observation)!==canonical(observation)){res.status(409).json({error:"Association or submission changed."});return;}
   res.json(row);
  }catch(e){req.log?.warn({err:e},"Station equipment save unavailable");res.status(503).json({error:"Save not confirmed; retry the same submission."});}
 });
 router.post(path+"/:submissionId/review",requireAgencyWorkspace,async(req,res)=>{
  const s=scope(req.params),id=req.params.submissionId,review=parseDecision(req.body);
  if(!s||typeof id!=="string"||!uuid.test(id)||!review){res.status(400).json({error:"Explicit review decision and rationale required."});return;}
  if(!req.isAuthenticated()){res.status(401).json({error:"Sign in required."});return;}const uid=req.user.id;
  try{
   const result=await db.transaction(async tx=>{
    const [a]=await tx.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,s.agencyId)).for("update");
    if(!a||!linkedNerisParent(a.payload,s.parentId))return {status:404};
    const [r]=await tx.select().from(equipment).where(key(s,id)).limit(1);
    if(!r)return {status:404};
    if(r.authorUid===uid)return {status:403};
    if(r.decision)return r.reviewerUid===uid&&r.decision===review.decision&&r.reviewNote===review.note?{status:200,row:r}:{status:409};
    const [saved]=await tx.update(equipment).set({decision:review.decision,reviewNote:review.note,reviewerUid:uid,reviewedAt:new Date()}).where(and(key(s,id),isNull(equipment.decision))).returning();
    return saved?{status:200,row:saved}:{status:409};
   });
   if(result.status!==200){res.status(result.status).json({error:"Review denied, missing or already decided. Authors cannot review their own observations."});return;}
   res.json(result.row);
  }catch(e){req.log?.warn({err:e},"Station equipment review unavailable");res.status(503).json({error:"Review not confirmed."});}
 });
 return router;
}
export default makeFacilityEquipmentRouter();
