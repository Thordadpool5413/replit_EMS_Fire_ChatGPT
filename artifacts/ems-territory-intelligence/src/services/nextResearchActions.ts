import type {Agency,FieldNote} from '../types';
import {buildReviewedCallContext,type ReviewedCallSample} from './reviewedPreCallPlanning';
import {DAY_MS,validIsoDay,utcDay,normalizedValue} from './documentedIntelligence';
export type ActionPriority='urgent'|'near-term'|'research'|'gap';
export type ResearchAction={key:string;candidateKey?:string;priority:ActionPriority;title:string;reason:string;taskText:string;sourceUrl?:string;publishedDate?:string;sourceScope?:'department'|'station'};
const order:Record<ActionPriority,number>={urgent:0,'near-term':1,research:2,gap:3};
const taskByKind={
 'open-procurement':'Verify official solicitation status, amendments and permitted response channel.',
 'contract-renewal':'Verify agreement scope, current term, amendments and renewal process.',
 'grant-award':'Confirm grant eligibility, restrictions, actual remaining funds and procurement process.',
 'capital-approved':'Confirm approved project scope, release of funds and purchasing milestones.',
 'awarded-procurement':'Review award implementation, service terms and permitted future milestones.',
 'competitor-equipment':'Confirm currently installed equipment, scope and evaluation criteria.',
 equipment:'Confirm installed equipment, model, quantity, operational needs and evaluation process.',
 discovery:'Confirm operating priorities and authorized decision roles.'
} as const;
export function buildNextResearchActions(agency:Agency,directory:Agency[],sample:ReviewedCallSample|undefined,now=Date.now()){
 const ctx=buildReviewedCallContext(agency,directory,sample,now),today=utcDay(now),actions:ResearchAction[]=[];
 const fresh=!!sample&&sample.agencyId===agency.id&&Number.isFinite(sample.started)&&sample.started<=now&&now-sample.started<300000;
 if(!ctx.identityReady||!fresh)return {actions,ready:false,checked:ctx};
 const seen=new Set<string>();
 for(const c of ctx.candidates){
  const title=c.kind==='equipment'?'Confirm equipment and workflow':c.kind.replaceAll('-',' ')+' research';
  const dated=(c.kind==='open-procurement'||c.kind==='contract-renewal')&&validIsoDay(c.date)?c.date:undefined;
  const delta=dated?(Date.parse(dated)-Date.parse(today))/DAY_MS:undefined;
  if(delta!==undefined&&delta<0)continue;
  const priority:ActionPriority=c.kind==='open-procurement'&&delta!==undefined&&delta<=14?'urgent':delta!==undefined&&((c.kind==='open-procurement'&&delta<=45)||(c.kind==='contract-renewal'&&delta<=90))?'near-term':'research';
  const sig=JSON.stringify([c.scope,c.kind,normalizedValue(c.context),c.sourceUrl,dated]);if(seen.has(sig))continue;seen.add(sig);
  actions.push({key:c.key,candidateKey:c.key,priority,title,reason:c.context,taskText:taskByKind[c.kind],sourceUrl:c.sourceUrl,publishedDate:dated,sourceScope:c.scope});
 }
 const gap=(key:string,title:string,reason:string,taskText:string)=>actions.push({key:'gap:'+key,priority:'gap',title,reason,taskText});
 if(!ctx.documentsChecked)gap('documents','Complete document research','Reviewed department source unavailable or incomplete. This is not a negative purchasing signal.','Check official purchasing and funding sources; resolve document review gaps.');
 else if(!ctx.candidates.some(c=>c.scope==='department'&&c.kind!=='equipment'))gap('purchasing','Research purchasing evidence','No eligible reviewed commercial document in this sample.','Research current procurement, contract and funding documents through official channels.');
 if(!ctx.stationsChecked)gap('stations','Resolve station evidence','Exact linked station evidence not checked or incomplete; agency may not have a NERIS relationship.','Verify provider and station identity and available equipment sources.');
 else if(!ctx.candidates.some(c=>c.scope==='station'))gap('equipment','Confirm equipment inventory','No eligible reviewed station device observation in this sample.','Confirm equipment category, manufacturer, model and quantity with authorized staff.');
 if(!ctx.authorityChecked||!ctx.roles.some(r=>r==='procurement'||r==='final-approval'||r==='budget'))gap('authority','Clarify purchasing authority','No eligible reviewed purchasing, budget or final approval responsibility in this sample.','Confirm the authorized procurement process and budget or approval responsibilities; do not infer authority from titles.');
 actions.sort((a,b)=>order[a.priority]-order[b.priority]||(a.publishedDate??'9999-12-31').localeCompare(b.publishedDate??'9999-12-31')||a.key.localeCompare(b.key));
 return {actions,ready:true,checked:ctx};
}
export function duplicateOpenResearchTask(agency:Agency,text:string){
 const value=normalizedValue(text);
 return !!value&&[...(agency.followUpTasks??[]),...(agency.fieldNotes??[])].some(t=>t.followUpStatus!=='completed'&&normalizedValue(t.nextAction)===value);
}
export function makeResearchTask(agency:Agency,action:ResearchAction,owner:string,dueDate:string,id:string,localDate:string):FieldNote|undefined{
 if(!action.taskText.trim()||!validIsoDay(dueDate)||!validIsoDay(localDate)||dueDate<localDate||!id||duplicateOpenResearchTask(agency,action.taskText)||owner.length>120)return undefined;
 // Do not store private source excerpts, names, or inferred commitments in the existing task collection.
 return {id,date:localDate,repName:'',meetingType:'Standalone task',notes:'',nextAction:action.taskText,owner:owner.trim(),dueDate,priority:action.priority==='urgent'?'high':'normal',taskOnly:true,followUpStatus:'open'};
}
