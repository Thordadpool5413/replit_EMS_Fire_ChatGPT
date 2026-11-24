import type {Agency} from '../types';
import {buildProviderCompetitiveProfile,PROVIDER_EQUIPMENT_KINDS,type ProviderEquipmentKind,type ProfileDocument} from './providerCompetitiveProfile';
import {buildOpportunityPriorities,PRIORITY_LABELS,type PrioritySignal} from './opportunityPrioritization';
import {utcDay} from './documentedIntelligence';
import type {SharedEvidence} from './sharedEvidence';

export const CALL_FOCUS_LABELS={
 recommended:'Recommended from evidence',discovery:'General account discovery',
 'installed-monitor':'Cardiac monitors / defibrillators','installed-cpr':'Mechanical CPR',
 'installed-ventilator':'Transport ventilation','installed-epcr':'ePCR',
 'installed-cad':'Dispatch CAD','installed-billing':'Billing',
} as const;
export type CallFocus=keyof typeof CALL_FOCUS_LABELS;
type TalkingPoints={objective:string;opening:string;questions:readonly [string,string,string];role:string;objection:string;response:string;commitment:string};
export type CallPlan={accountName:string;stateCode:string;asOf:string;focus:CallFocus;topic:string;status:'identity-review'|'evidence-review'|'document-led'|'discovery';context:string;source:SharedEvidence|null;priority:string|null;points:TalkingPoints;preparation:string;reviewNote:string|null};
const discovery:TalkingPoints={
 objective:'Identify one confirmed operational priority, the responsible decision owner and an agreed next conversation.',
 opening:'I want to understand how your team works today and what you would actually like to improve, rather than assume you need a product.',
 questions:['What is the most important clinical or operational problem your team wants to solve this year?','Who evaluates changes, who controls the budget, and what process determines whether a project moves forward?','What timeline or evaluation criteria would make a follow-up useful?'],
 role:'Confirm the operational lead, clinical lead and purchasing authority; no individual is assumed.',
 objection:'We are not looking to change anything.',
 response:'Respect that. Ask what is working well, what could trigger a future review, and whether a check-in at an agreed time would be useful.',
 commitment:'Agree on a named decision owner and the purpose and date of a next conversation, if invited.',
};
const review:TalkingPoints={
 objective:'Resolve the account identity or evidence gap before discussing a specific commercial opportunity.',
 opening:'Before making recommendations, I want to make sure I understand the right organization, its current situation and its purchasing process.',
 questions:['Which organization actually operates the service and owns its equipment?','Who is authorized to confirm the current inventory or purchasing information?','Which dated inventory, agreement or public purchasing document should we use as the source of truth?'],
 role:'Confirm the organization and its authorized operational or procurement representative.',
 objection:'That information is inaccurate or belongs to another department.',
 response:'Thank them for the correction. Do not defend the record; ask for the appropriate source and update it through the evidence review process.',
 commitment:'Obtain a reliable source or an authorized contact for verification before preparing a product-specific proposal.',
};
const equipment:Record<ProviderEquipmentKind,TalkingPoints>={
 'installed-monitor':{
  objective:'Confirm the monitor fleet, one workflow or service challenge, and the criteria for any future evaluation.',
  opening:'I would like to understand how your monitors support your crews in the field and during handoff, and what you would change if anything.',
  questions:['Which monitor models and quantities are currently in service, and who owns the inventory?','Where do crews experience friction in usability, data transfer, training, battery management or service support?','How are clinical evaluation, replacement planning and purchase approval handled?'],
  role:'Confirm the EMS chief or operations lead, clinical educator, biomedical/fleet lead and purchasing owner.',
  objection:'Our current monitors work well.',
  response:'Acknowledge that. Ask what makes the system successful and what evidence would matter if the agency ever evaluates alternatives.',
  commitment:'Agree on a workflow review or a future evaluation discussion with the relevant stakeholders, if invited.',
 },
 'installed-cpr':{
  objective:'Confirm mechanical CPR deployment and the agency’s actual protocol, training and evaluation needs.',
  opening:'I would like to understand where mechanical CPR fits into your resuscitation workflow and what matters most to your team.',
  questions:['Which devices, if any, are in service and under what local protocols?','What training, deployment or quality review challenges have crews identified?','Who owns protocol approval, equipment evaluation and replacement decisions?'],
  role:'Confirm clinical leadership, medical direction, training and equipment purchasing roles.',
  objection:'Our existing mechanical CPR process is established.',
  response:'Respect established protocols. Ask which performance, workflow and training criteria leadership uses to evaluate equipment; avoid unsupported clinical comparisons.',
  commitment:'Agree on an authorized clinical and operational workflow review if there is a relevant need.',
 },
 'installed-ventilator':{
  objective:'Confirm transport ventilation equipment, workflow needs and evaluation requirements.',
  opening:'I want to understand how your team manages transport ventilation, including training and service support.',
  questions:['Which ventilators are currently in service, and for which transport settings?','What training, usability, servicing or interoperability issues have staff identified?','Who sets clinical and technical requirements, and when are those requirements reviewed?'],
  role:'Confirm clinical leadership, transport operations, training, biomedical and purchasing roles.',
  objection:'Our current ventilation equipment meets our requirements.',
  response:'Ask which requirements are most important and what would warrant a future review. Do not claim better clinical outcomes without relevant evidence.',
  commitment:'Agree on a requirements discussion or future review with the authorized team.',
 },
 'installed-epcr':{
  objective:'Confirm the current patient care reporting workflow, integration requirements and decision process.',
  opening:'I want to understand how documentation moves from the field to quality review and downstream systems.',
  questions:['Which ePCR platform is deployed and which organization administers it?','Where do crews or administrators experience documentation, reporting or integration friction?','What contract, security, interoperability and evaluation requirements govern a change?'],
  role:'Confirm the EMS operations lead, documentation/quality owner, IT and purchasing authority.',
  objection:'Changing ePCR would disrupt our crews.',
  response:'Acknowledge the transition risk. Ask which workflows and data migration requirements would have to be protected; do not promise effortless implementation.',
  commitment:'Agree on a scoped workflow and integration requirements discussion with the system owner.',
 },
 'installed-cad':{
  objective:'Confirm dispatch ownership, operational requirements and the process for evaluating changes.',
  opening:'I would like to understand how your dispatch and field systems work together today.',
  questions:['Which dispatch system is in use and which entity owns or administers it?','What interoperability, reliability or workflow challenges have users identified?','Which stakeholders, contract terms and procurement rules govern system changes?'],
  role:'Confirm dispatch leadership, communications/IT ownership and purchasing authority.',
  objection:'Dispatch decisions are handled by another organization.',
  response:'Respect that boundary. Ask who owns the system and whether an authorized introduction would be appropriate.',
  commitment:'Identify the correct system owner and an approved next conversation.',
 },
 'installed-billing':{
  objective:'Confirm billing ownership, workflow needs and the criteria for reviewing the current platform.',
  opening:'I want to understand how documentation and billing workflows fit together for your organization.',
  questions:['Who owns the billing process, and what platform or service is currently used?','What documentation, reporting, integration or administrative bottlenecks matter most?','How are service agreements, security requirements and purchasing decisions reviewed?'],
  role:'Confirm the billing owner, finance, IT/compliance and procurement roles.',
  objection:'Billing is managed by an outside partner.',
  response:'Ask how responsibilities are divided and whether the authorized owner would benefit from a workflow discussion.',
  commitment:'Agree on the appropriate owner and a scoped follow-up, without requesting patient-level data.',
 },
};
const purchasing:Partial<Record<PrioritySignal['kind'],TalkingPoints>>={
 'open-procurement':{
  objective:'Verify the current solicitation status and determine the permitted evaluation and response process before its published deadline.',
  opening:'I found a published purchasing record. Before discussing anything substantive, I want to confirm the current notice and the appropriate communication channel.',
  questions:['Is the solicitation still active, and have any amendments, cancellations or deadline changes been published?','What specifications, eligibility requirements and evaluation criteria are stated in the official documents?','What is the authorized channel for clarifications and submissions, and what deadlines apply?'],
  role:'Use the officially designated procurement contact or portal; do not seek privileged access to evaluators.',
  objection:'All vendor communication must go through the procurement portal.',
  response:'Respect the restriction. Use only the authorized channel and published clarification process; do not request private evaluation information.',
  commitment:'Confirm the official solicitation record and next permitted action through its authorized channel.',
 },
 'contract-renewal':{
  objective:'Confirm the agreement’s current term, renewal or extension status, scope and authorized purchasing timeline.',
  opening:'A dated document lists an agreement end date. I want to verify whether that date still applies before discussing any evaluation.',
  questions:['Is the recorded agreement still in effect, amended, extended or already renewed?','Which equipment or services does it actually cover, and who owns performance and contract review?','What is the authorized process and timeline for evaluating renewal or alternatives?'],
  role:'Confirm the contract owner, procurement lead and relevant operational decision owners.',
  objection:'We have already renewed the agreement.',
  response:'Accept the update. Ask whether a public amendment or authorized confirmation is available and when a future review would be appropriate.',
  commitment:'Verify the current agreement and agree on a relevant next discussion only if appropriate.',
 },
 'grant-award':{
  objective:'Confirm the grant’s recipient, eligible scope, funding conditions and any actual purchase planning.',
  opening:'I found a dated grant document and would like to understand its scope and any procurement requirements without assuming the funding is still available.',
  questions:['Does the award belong to this organization, and what expenses or equipment are eligible?','What conditions, match requirements, spending deadlines and remaining funds have been confirmed?','Who manages the grant and the authorized procurement process?'],
  role:'Confirm the grant administrator, finance and procurement roles.',
  objection:'The funds are already committed or spent.',
  response:'Accept that the award is not available cash. Ask whether an unrelated future planning conversation would be useful; do not assume other funding exists.',
  commitment:'Confirm the award scope and actual authorized purchase pathway, or close the funding lead.',
 },
 'capital-approved':{
  objective:'Confirm the approved appropriation, purchasing scope and actual implementation schedule.',
  opening:'A dated document references a capital approval. I want to verify what it authorizes and whether purchasing has started.',
  questions:['Which project and equipment are covered by the appropriation?','Has funding been released, committed, modified or spent?','Who owns the project and which purchasing process or milestone governs the next step?'],
  role:'Confirm the project owner, finance, procurement and operational leadership.',
  objection:'The capital budget is approved, but purchasing is on hold.',
  response:'Do not equate approval with spending authority. Ask what milestone or decision must occur before purchasing can proceed.',
  commitment:'Confirm the actual next milestone and an authorized follow-up date.',
 },
 'awarded-procurement':{
  objective:'Understand the reported award’s scope and implementation or future review needs, without treating it as an open bid.',
  opening:'I found a dated award record. I am interested in understanding the implementation and future requirements, not reopening a completed purchase.',
  questions:['What was awarded, and has delivery or implementation been completed?','Which training, service, integration or lifecycle requirements remain relevant?','Who owns implementation and when is the next permitted review?'],
  role:'Confirm the implementation owner, operational lead and procurement/contract owner.',
  objection:'The award is final and we are not seeking alternatives.',
  response:'Respect the award and do not push for a reversal. Ask whether a future planning discussion is appropriate under the agency’s rules.',
  commitment:'Identify a permitted future milestone or close the research lead if no next step is appropriate.',
 },
};
function localObservation(doc:ProfileDocument|undefined){return doc?.status==='document-observation'?doc.item.evidence:null;}
function sourceContext(e:SharedEvidence){return 'Local document dated '+e.documentDate+' reports: '+e.value+'. Verify the original source and current status.';}
const category=(kind:string):kind is ProviderEquipmentKind=>PROVIDER_EQUIPMENT_KINDS.some(k=>k===kind);

/** Reuse the same identity/reconciliation gates as the Radar. Never join independent documents into a purchase narrative. */
export function buildPreCallPlan(agency:Agency,directory:Agency[],focus:CallFocus='recommended',now=Date.now()):CallPlan{
 const selected=Object.hasOwn(CALL_FOCUS_LABELS,focus)?focus:'recommended';
 const p=buildProviderCompetitiveProfile(agency,directory,now);
 const base={accountName:agency.name,stateCode:agency.stateCode,asOf:utcDay(now),focus:selected,source:null,priority:null,reviewNote:null};
 if(!p.identityReady)return {...base,topic:'Identity verification',status:'identity-review',context:'A unique validated source-native account identity is not established. No account-specific commercial claims are used.',points:review,preparation:'Confirm the correct provider and registry identity in Sources before using account records.'};
 if(!p.complete)return {...base,topic:'Source verification',status:'evidence-review',context:'The local typed evidence collection is incomplete or invalid. No document is used as a commercial signal.',points:review,preparation:'Review the invalid or incomplete records in Sources.'};
 const ranked=buildOpportunityPriorities([agency],agency.stateCode,'all',now);
 const r=ranked.ranked[0];
 const needsReview=ranked.reviewRequired>0;
 const reviewNote=needsReview?'Some local documents require review. Do not combine them with this plan or assume separate documents refer to the same purchase.':null;
 const withSource=(e:SharedEvidence,points:TalkingPoints,topic:string,signal?:PrioritySignal):CallPlan=>({...base,topic,status:'document-led',context:sourceContext(e),source:e,priority:signal?PRIORITY_LABELS[signal.band]:null,points,preparation:signal?.kind==='open-procurement'?'Check the official notice and communication restrictions before contact. Published dates are not verified current deadlines.':'Open the original document and confirm its date, scope and current status before the conversation.',reviewNote});
 if(selected==='recommended'&&r){
  const s=r.primary,e=s.evidence;
  const points=s.kind==='competitor-equipment'&&category(e.kind)?equipment[e.kind]:purchasing[s.kind];
  if(points)return withSource(e,points,category(e.kind)?CALL_FOCUS_LABELS[e.kind]:s.kind==='open-procurement'?'Solicitation verification':s.kind==='contract-renewal'?'Contract review':s.kind==='grant-award'?'Grant scope':s.kind==='capital-approved'?'Capital planning':'Award follow-up',s);
 }
 if(category(selected)||selected==='recommended'){
  const c=category(selected)?p.equipment.find(x=>x.kind===selected):p.equipment.find(x=>x.status==='document-observation');
  if(c){
   const e=localObservation(c.observations[0]);
   if(e)return withSource(e,equipment[c.kind],CALL_FOCUS_LABELS[c.kind]);
   if(c.status==='review-required')return {...base,topic:CALL_FOCUS_LABELS[c.kind],status:'evidence-review',context:'The selected equipment records require review. Do not assume the current product, quantity or deployment.',points:review,preparation:'Inspect the conflicting or flagged source documents before preparing a product-specific recommendation.',reviewNote};
   return {...base,topic:CALL_FOCUS_LABELS[c.kind],status:'discovery',context:'No eligible current dated local observation for this category. Questions are exploratory, not claims about the account.',points:equipment[c.kind],preparation:'Research the actual equipment and decision owner before proposing a comparison.',reviewNote};
  }
 }
 if(selected==='recommended'&&needsReview)return {...base,topic:'Source verification',status:'evidence-review',context:'No eligible priority signal is available and local evidence requires review.',points:review,preparation:'Resolve the source disagreements in Sources before relying on the records.',reviewNote};
 return {...base,topic:'General account discovery',status:'discovery',context:'No document-led claim is selected. Questions are exploratory; no purchase intent, installed fleet or decision maker is assumed.',points:discovery,preparation:'Confirm organization, roles and operating priorities before discussing a specific product.',reviewNote};
}
export function formatPreCallPlan(plan:CallPlan):string{
 const p=plan.points,e=plan.source;
 return ['ATLAS | Pre-call research brief',plan.accountName+' · '+plan.stateCode,'Prepared '+plan.asOf+' UTC | '+plan.topic,plan.context,'Internal preparation only. Local records are not independently verified; validate before use.','Objective: '+p.objective,'Before contact: '+plan.preparation,'Suggested opening: '+p.opening,'Three qualifying questions:',...p.questions.map((q,i)=>(i+1)+'. '+q),'Roles to confirm: '+p.role,'Possible objection (hypothetical): '+p.objection,'Suggested response: '+p.response,'Proposed commitment: '+p.commitment,...(plan.reviewNote?[plan.reviewNote]:[]),...(e?['Original source: '+e.sourceName+' · '+e.sourceRecordId+' · '+e.documentDate,e.sourceUrl]:[])].join('\n');
}
