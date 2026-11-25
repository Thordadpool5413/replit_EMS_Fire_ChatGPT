import {Router,type IRouter} from 'express';
import {and,desc,eq,isNull} from 'drizzle-orm';
import {db,agencyRecordsTable,agencyAuthorityTable as observations} from '@workspace/db';
import {requireAgencyWorkspace,agencyWorkspaceRole} from '../middlewares/agencyWorkspaceAccess';
import {object,parseDecision,uuid} from '../lib/facilityEquipment';
import {authorityIdentity,parseAuthority} from '../lib/agencyAuthority';
const router:IRouter=Router(),path='/agencies/:agencyId/authority';
const valid=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=300;
const canonical=(v:unknown)=>JSON.stringify(Object.entries(object(v)).sort(([a],[b])=>a.localeCompare(b)));
router.get(path,requireAgencyWorkspace,async(req,res)=>{
 const id=req.params.agencyId;if(!valid(id)){res.status(400).json({error:'Invalid saved account.'});return;}
 try{
  const [a]=await db.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,id)).limit(1);
  const identity=a&&authorityIdentity(a.payload);if(!identity){res.status(404).json({error:'Save a non-modeled account before recording authority.'});return;}
  const rows=await db.select().from(observations).where(eq(observations.agencyId,id)).orderBy(desc(observations.createdAt),desc(observations.submissionId)).limit(101);
  const uid=req.isAuthenticated()?req.user.id:'',editor=agencyWorkspaceRole(uid)==='editor';
  const visible=rows.slice(0,100).filter(r=>r.identityKey===identity);
  res.json({identity,rows:visible.map(r=>({...r,canReview:editor&&r.authorUid!==uid&&!r.decision})),withheld:Math.min(rows.length,100)-visible.length,more:rows.length>100,canWrite:editor});
 }catch{res.status(503).json({error:'Private authority evidence unavailable.'});}
});
router.post(path,requireAgencyWorkspace,async(req,res)=>{
 const id=req.params.agencyId,b=object(req.body),submissionId=b.submissionId,observation=parseAuthority(b.observation);
 if(!valid(id)||typeof submissionId!=='string'||!uuid.test(submissionId)||typeof b.identity!=='string'||!observation){res.status(400).json({error:'Dated role, scope and evidence required.'});return;}
 if(!req.isAuthenticated()){res.status(401).json({error:'Sign in required.'});return;}const uid=req.user.id;
 try{
  const result=await db.transaction(async tx=>{
   const [a]=await tx.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,id)).for('update');
   const identity=a&&authorityIdentity(a.payload);
   if(!identity||identity!==b.identity)return {status:409};
   const key=and(eq(observations.agencyId,id),eq(observations.submissionId,submissionId));
   await tx.insert(observations).values({agencyId:id,submissionId,identityKey:identity,observation,authorUid:uid}).onConflictDoNothing();
   const [r]=await tx.select().from(observations).where(key).limit(1);
   return r&&r.identityKey===identity&&r.authorUid===uid&&canonical(r.observation)===canonical(observation)?{status:200,row:r}:{status:409};
  });
  res.status(result.status).json(result.row??{error:'Account identity or submission changed. Refresh before retrying.'});
 }catch{res.status(503).json({error:'Save not confirmed. Retry the same submission.'});}
});
router.post(path+'/:submissionId/review',requireAgencyWorkspace,async(req,res)=>{
 const id=req.params.agencyId,submissionId=req.params.submissionId,b=object(req.body),review=parseDecision(b);
 if(!valid(id)||typeof submissionId!=='string'||!uuid.test(submissionId)||typeof b.identity!=='string'||!review){res.status(400).json({error:'Explicit independent review required.'});return;}
 if(!req.isAuthenticated()){res.status(401).json({error:'Sign in required.'});return;}const uid=req.user.id;
 try{
  const result=await db.transaction(async tx=>{
   const [a]=await tx.select().from(agencyRecordsTable).where(eq(agencyRecordsTable.id,id)).for('update');
   const identity=a&&authorityIdentity(a.payload);if(!identity||identity!==b.identity)return {status:409};
   const key=and(eq(observations.agencyId,id),eq(observations.submissionId,submissionId),eq(observations.identityKey,identity));
   const [r]=await tx.select().from(observations).where(key).limit(1);
   if(!r)return {status:404};
   if(r.authorUid===uid)return {status:403};
   if(r.decision)return r.reviewerUid===uid&&r.decision===review.decision&&r.reviewNote===review.note?{status:200,row:r}:{status:409};
   const [saved]=await tx.update(observations).set({decision:review.decision,reviewNote:review.note,reviewerUid:uid,reviewedAt:new Date()}).where(and(key,isNull(observations.decision))).returning();
   return saved?{status:200,row:saved}:{status:409};
  });
  res.status(result.status).json(result.row??{error:'Review denied, already decided or account identity changed.'});
 }catch{res.status(503).json({error:'Review not confirmed.'});}
});
export default router;
