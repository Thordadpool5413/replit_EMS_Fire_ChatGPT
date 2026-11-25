import {Router,type IRouter} from 'express';
import {and,eq,sql} from 'drizzle-orm';
import {db,agencyRecordsTable,workingPipelineTable as deals,workingPipelineHistoryTable as history} from '@workspace/db';
import {requireAgencyWorkspace,agencyWorkspaceRole} from '../middlewares/agencyWorkspaceAccess';
import {pipelineIdentity,parsePipelineWrite,pipelineRecord,STAGES} from '../lib/workingPipeline';
const router:IRouter=Router(),path='/agencies/:agencyId/working-pipeline';
const valid=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=300;
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function scoped(tx:Tx,id:string){
 const [a]=await tx.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,id)).for('update');
 const identity=a&&pipelineIdentity(a.payload);if(!identity||a.payload.id!==id)return;
 // Duplicate native identifiers are withheld, including across states for national IDs.
 const matches=await tx.select({id:agencyRecordsTable.id}).from(agencyRecordsTable).where(and(
  sql`${agencyRecordsTable.payload}->'registryIdentity'->>'sourceName' = ${identity.source}`,
  sql`upper(btrim(${agencyRecordsTable.payload}->'registryIdentity'->>'identifier')) = ${identity.id}`,
  identity.source==='NPPES'||identity.source==='NERIS'?undefined:sql`${agencyRecordsTable.payload}->'registryIdentity'->>'stateCode' = ${identity.state}`,
  identity.source==='State EMS'?sql`${agencyRecordsTable.payload}->'registryIdentity'->>'identifierKind' = ${identity.kind}`:undefined
 )).limit(2);
 if(matches.length!==1||matches[0].id!==id)return;
 const [row]=await tx.select().from(deals).where(eq(deals.agencyId,id)).limit(1);
 if(row&&(row.identityKey!==identity.key||row.binding!==identity.binding))return;
 return {identity,row};
}
router.get(path,requireAgencyWorkspace,async(req,res)=>{
 const id=req.params.agencyId;if(!valid(id)){res.status(400).json({error:'Invalid saved account.'});return;}
 try{
  const result=await db.transaction(tx=>scoped(tx,id));
  if(!result){res.status(409).json({error:'Save and reconcile a unique source-native account before using the shared pipeline.'});return;}
  res.json({identityKey:result.identity.key,binding:result.identity.binding,record:result.row?.record??null,canWrite:req.isAuthenticated()&&agencyWorkspaceRole(req.user.id)==='editor'});
 }catch{res.status(503).json({error:'Shared pipeline unavailable.'});}
});
router.put(path,requireAgencyWorkspace,async(req,res)=>{
 const id=req.params.agencyId,body=parsePipelineWrite(req.body);
 if(!valid(id)||!body){res.status(400).json({error:'Explicit validation and valid opportunity fields are required.'});return;}
 if(!req.isAuthenticated()){res.status(401).json({error:'Sign in required.'});return;}const uid=req.user.id;
 try{
  const result=await db.transaction(async tx=>{
   const current=await scoped(tx,id);
   if(!current||current.identity.key!==body.identityKey||current.identity.binding!==body.binding||(current.row?.revision??0)!==body.expectedRevision)return undefined;
   const revision=body.expectedRevision+1,at=new Date();
   const prior=await tx.select({record:history.record,revision:history.revision,createdAt:history.createdAt}).from(history).where(eq(history.agencyId,id)).orderBy(sql`${history.revision} desc`).limit(49);
   if(prior.length!==Math.min(49,body.expectedRevision)||prior.some((p,i)=>p.revision!==body.expectedRevision-i||!STAGES.some(s=>s===p.record.stage)))throw Error('Inconsistent pipeline history');
   const previous=prior.reverse().map(p=>({stage:p.record.stage as typeof STAGES[number],at:p.createdAt.toISOString()}));
   const record=pipelineRecord(body.input,id,body.identityKey,revision,at.toISOString(),previous);
   const values={agencyId:id,identityKey:body.identityKey,binding:body.binding,revision,record,updatedBy:uid,updatedAt:at};
   if(current.row)await tx.update(deals).set(values).where(eq(deals.agencyId,id));else await tx.insert(deals).values(values);
   await tx.insert(history).values({agencyId:id,revision,identityKey:body.identityKey,binding:body.binding,record,actorUid:uid,createdAt:at});
   return record;
  });
  if(!result){res.status(409).json({error:'Account identity or opportunity revision changed. Reload and reconcile before saving.'});return;}
  res.json({identityKey:body.identityKey,binding:body.binding,record:result,canWrite:true});
 }catch{res.status(503).json({error:'Shared save not confirmed. Reload before retrying.'});}
});
export default router;
