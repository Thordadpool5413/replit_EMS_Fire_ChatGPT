import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, agencyRecordsTable, facilityNotesTable } from "@workspace/db";
import { requireAgencyWorkspace, agencyWorkspaceRole } from "../middlewares/agencyWorkspaceAccess";
import { listDepartmentFacilities, validFacilityParent, type FacilityParent } from "../lib/fireRegistry";

const object=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
function trustedNerisUrl(x:unknown):boolean {
  if(typeof x!=="string")return false;
  try{const u=new URL(x);return u.protocol==="https:"&&!u.username&&!u.password&&["services5.arcgis.com","www.usfa.fema.gov"].includes(u.hostname);}catch{return false;}
}
export function linkedNerisParent(payload:Record<string,unknown>,parentId:string):FacilityParent|undefined{
  const stateCode=payload.stateCode;
  if(typeof stateCode!=="string")return undefined;
  const p:FacilityParent={source:"NERIS",stateCode,identifier:parentId};
  if(!validFacilityParent(p))return undefined;
  const ids=new Set<string>();
  const direct=object(payload.registryIdentity);
  if(direct.sourceName==="NERIS"&&direct.stateCode===stateCode&&!direct.deactivatedAt&&typeof direct.identifier==="string"&&trustedNerisUrl(direct.sourceUrl))ids.add(direct.identifier);
  for(const value of Array.isArray(payload.sourceRecordAssociations)?payload.sourceRecordAssociations:[]){
    const a=object(value),fields=object(a.sourceFields);
    if(a.sourceName==="NERIS"&&a.decision==="confirmed"&&fields.stateCode===stateCode&&typeof a.sourceRecordId==="string"&&a.sourceRecordId===fields.nerisId&&trustedNerisUrl(a.sourceUrl))ids.add(a.sourceRecordId);
  }
  return ids.size===1&&ids.has(parentId)?p:undefined;
}
const noteId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nativeId=/^[-A-Z0-9]{1,14}$/;
export function makeFacilityNotesRouter(loadFacilities= listDepartmentFacilities):IRouter {
  const router:IRouter=Router();
  const path="/agencies/:agencyId/facilities/:parentId/:stationId/notes";
  router.get(path,requireAgencyWorkspace,async(req,res)=>{
    const {agencyId,parentId,stationId}=req.params;
    if(!nativeId.test(parentId)||!nativeId.test(stationId)||agencyId.length>300){res.status(400).json({error:"Invalid facility identity."});return;}
    try{
      const [a]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,agencyId)).limit(1);
      if(!a||!linkedNerisParent(a.payload,parentId)){res.status(404).json({error:"Save and link the exact department before using facility notes."});return;}
      const rows=await db.select().from(facilityNotesTable).where(and(eq(facilityNotesTable.agencyId,agencyId),eq(facilityNotesTable.parentId,parentId),eq(facilityNotesTable.stationId,stationId))).orderBy(desc(facilityNotesTable.createdAt),desc(facilityNotesTable.submissionId)).limit(101);
      res.json({notes:rows.slice(0,100),more:rows.length>100,canWrite:req.isAuthenticated()&&agencyWorkspaceRole(req.user.id)==="editor"});
    }catch(error){req.log?.warn({err:error},"Facility notes unavailable");res.status(503).json({error:"Facility notes unavailable; no data was changed."});}
  });
  router.post(path,requireAgencyWorkspace,async(req,res)=>{
    const {agencyId,parentId,stationId}=req.params;
    const body=object(req.body),submissionId=body.submissionId,note=typeof body.note==="string"?body.note.trim():"";
    if(!nativeId.test(parentId)||!nativeId.test(stationId)||agencyId.length>300||typeof submissionId!=="string"||!noteId.test(submissionId)||!note||note.length>4000){res.status(400).json({error:"Invalid facility note."});return;}
    if(!req.isAuthenticated()){res.status(401).json({error:"Sign in required."});return;}
    const authorUid=req.user.id;
    const key=and(eq(facilityNotesTable.agencyId,agencyId),eq(facilityNotesTable.parentId,parentId),eq(facilityNotesTable.stationId,stationId),eq(facilityNotesTable.submissionId,submissionId));
    try{
      const [a]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,agencyId)).limit(1);
      const parent=a&&linkedNerisParent(a.payload,parentId);
      if(!parent){res.status(404).json({error:"Save and link the exact department first."});return;}
      const [existing]=await db.select().from(facilityNotesTable).where(key).limit(1);
      if(existing){if(existing.note!==note||existing.authorUid!==authorUid){res.status(409).json({error:"Submission already exists with different content."});return;}res.json(existing);return;}
      const source=await loadFacilities(parent);
      const matches=source.facilities.filter(f=>f.source==="NERIS"&&f.sourceRecordId===stationId);
      if(source.warning||matches.length!==1){res.status(409).json({error:"Station relationship could not be confirmed from the current source."});return;}
      const sourceSnapshot={...matches[0],retrievedAt:source.retrievedAt,endUserValidationRequired:true};
      const saved=await db.transaction(async tx=>{
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${agencyId}, 0))`);
        const [current]=await tx.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,agencyId)).limit(1);
        if(!current||!linkedNerisParent(current.payload,parentId)||current.stateCode!==parent.stateCode)return undefined;
        await tx.insert(facilityNotesTable).values({agencyId,parentId,stationId,submissionId,note,authorUid,sourceSnapshot}).onConflictDoNothing();
        const [row]=await tx.select().from(facilityNotesTable).where(key).limit(1);
        return row;
      });
      if(!saved||saved.note!==note||saved.authorUid!==authorUid){res.status(409).json({error:"Facility association or submission changed. Refresh before retrying."});return;}
      res.json(saved);
    }catch(error){req.log?.warn({err:error},"Facility note save unavailable");res.status(503).json({error:"Save could not be confirmed. Retry the same submission."});}
  });
  return router;
}
export default makeFacilityNotesRouter();
