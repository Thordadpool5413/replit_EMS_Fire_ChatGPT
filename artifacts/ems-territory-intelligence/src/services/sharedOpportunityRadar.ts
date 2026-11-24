import type { Agency } from '../types';
import { DAY_MS, definitionFor, utcDay } from './documentedIntelligence';
import { EQUIPMENT_VENDORS } from '../utils/equipmentPresence';
import { readSharedEvidence, sharedAgencyKey, type SharedEvidence } from './sharedEvidence';
import { readDecision, summarizeDecisions, type EvidenceDecision, type GovernanceStatus } from './sharedEvidenceGovernance';
import { reconcileSharedEvidence, sharedObservationSignature } from './sharedEvidenceReconciliation';
import type { OpportunityKind } from './opportunityRadar';

export type ReviewedEvidenceRow = {
 evidence:SharedEvidence; authorUid:string; publishedAt:string; decisions:EvidenceDecision[]; invalid:number;
};
export type ReviewedSignal = {
 kind:OpportunityKind; evidence:SharedEvidence; approval:EvidenceDecision; date?:string; nextAction:string;
};
export type ReviewedRadarResult = {
 complete:boolean; reason?:string; checked:number; approved:number; withheld:number; signals:ReviewedSignal[];
};
type CheckedRow = ReviewedEvidenceRow & { status:GovernanceStatus };
const scopedKinds = new Set(['procurement-open','procurement-awarded','procurement-closed','contract-expiration','grant-awarded','capital-approved']);
const validTime=(s:unknown,now:number)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=now;
function replacementMatches(a:SharedEvidence,b:SharedEvidence):boolean{
 return a.agencyKey===b.agencyKey&&a.stateCode===b.stateCode&&a.kind===b.kind&&
  (!scopedKinds.has(a.kind)||(a.sourceName===b.sourceName&&a.sourceRecordId===b.sourceRecordId));
}
/** Shared-only, selected-account research signals. No local notes, scores, estimated fields or cloud mutations. */
export function buildReviewedRadar(agency:Agency,rows:ReviewedEvidenceRow[],scope:{complete:boolean;withheld:number},now=Date.now()):ReviewedRadarResult{
 const fail=(reason:string):ReviewedRadarResult=>({complete:false,reason,checked:rows.length,approved:0,withheld:rows.length,signals:[]});
 const key=sharedAgencyKey(agency);
 if(!key||!scope.complete||scope.withheld||rows.length>=50)return fail('A complete, valid first-page server read of fewer than 50 published records is required.');
 const byId=new Map<string,CheckedRow>();
 for(const row of rows){
  const e=readSharedEvidence(row.evidence,key,row.evidence.factId,now);
  if(!e||e.stateCode!==agency.stateCode||byId.has(e.factId)||row.invalid||!row.authorUid?.trim()||!validTime(row.publishedAt,now))return fail('Invalid, duplicated or mismatched published evidence; review withheld.');
  const events:EvidenceDecision[]=[];
  for(const raw of row.decisions){
   const d=readDecision(raw,e.factId,raw.action);
   if(!d||!validTime(d.reviewedAt,now)||Date.parse(d.reviewedAt)<Date.parse(row.publishedAt)||(d.action==='approved'&&d.reviewerUid===row.authorUid))return fail('Review history is invalid or independent approval cannot be established.');
   events.push(d);
  }
  const status=summarizeDecisions(events,row.invalid);
  if(status==='unavailable')return fail('A permanent review history is unavailable.');
  byId.set(e.factId,{...row,evidence:e,decisions:events,status});
 }
 const checked=[...byId.values()];
 // An original may only be removed from reconciliation through an intact, approved replacement chain.
 // Other blocked or pending observations remain as negative/contextual evidence, so removing them cannot resurrect an older bid or fleet.
 const suppressed=new Set<string>();
 for(const row of checked){
  if(row.status!=='superseded')continue;
  let current=row;
  const seen=new Set<string>([row.evidence.factId]);
  while(current.status==='superseded'){
   const link=current.decisions.find(d=>d.action==='superseded');
   const next=link&&byId.get(link.replacementId);
   if(!next||seen.has(next.evidence.factId)||!replacementMatches(current.evidence,next.evidence))return fail('A correction link is missing, cyclic or mismatched.');
   const approval=next.decisions.find(d=>d.action==='approved');
   if(!approval||Date.parse(approval.reviewedAt)>Date.parse(link!.reviewedAt))return fail('A correction was not independently approved before supersession.');
   seen.add(next.evidence.factId);current=next;
  }
  if(current.status!=='approved')return fail('A correction chain no longer ends in an unblocked approved observation.');
  suppressed.add(row.evidence.factId);
 }
 const active=checked.filter(r=>!suppressed.has(r.evidence.factId));
 const review=reconcileSharedEvidence({...agency,sourceFacts:[],_factReviews:[]},active.map(r=>r.evidence),{singleCompletePage:true,withheld:0},now);
 if(!review.complete)return fail('Document reconciliation is incomplete.');
 const signals:ReviewedSignal[]=[];
 const today=utcDay(now);
 for(const item of review.items){
  if(item.status!=='review-candidate')continue;
  const e=item.evidence;
  const duplicates=active.filter(r=>sharedObservationSignature(r.evidence)===sharedObservationSignature(e));
  // All matching published copies must be independently approved, not merely the representative selected by deduplication.
  if(!duplicates.length||duplicates.some(r=>r.status!=='approved'))continue;
  const row=byId.get(e.factId);
  const approval=row?.decisions.find(d=>d.action==='approved');
  if(!approval||row?.status!=='approved')continue;
  // Conflicting procurement records with different issuers but identical record IDs are not combined into a single opportunity.
  const sameRecord=active.filter(r=>r.evidence.sourceRecordId.trim().toLowerCase()===e.sourceRecordId.trim().toLowerCase());
  if(e.kind.startsWith('procurement-')&&sameRecord.some(r=>r.evidence.kind.startsWith('procurement-')&&r.evidence.sourceName.trim().toLowerCase()!==e.sourceName.trim().toLowerCase()))continue;
  let kind:OpportunityKind|undefined,date:string|undefined,nextAction='';
  if(definitionFor(e.kind)?.family){
   const vendors=EQUIPMENT_VENDORS.filter(v=>v.pattern.test(e.value));
   if(vendors.length===1&&vendors[0].id!=='zoll'){kind='competitor-equipment';nextAction='Confirm the installed model, quantity and replacement cycle before treating this as a conversion opportunity.';}
  }else if(e.kind==='contract-expiration'&&e.value>=today&&Date.parse(e.value)-Date.parse(today)<=365*DAY_MS){
   kind='contract-renewal';date=e.value;nextAction='Check amendments, renewal options and the purchasing decision timeline.';
  }else if(e.kind==='procurement-open'&&e.dueDate>=today){
   kind='open-procurement';date=e.dueDate;nextAction='Check the official solicitation for amendments, eligibility and whether submissions are still accepted.';
  }else if(e.kind==='procurement-awarded'){
   kind='awarded-procurement';nextAction='Review the award scope and delivery or service terms. This is not an open bid.';
  }else if(e.kind==='grant-awarded'){
   kind='grant-award';nextAction='Verify eligible equipment, remaining funds and award conditions.';
  }else if(e.kind==='capital-approved'){
   kind='capital-approved';nextAction='Verify the appropriation, approved scope and purchasing schedule.';
  }
  if(kind)signals.push({kind,evidence:e,approval,date,nextAction});
 }
 signals.sort((a,b)=>(a.date??'9999-12-31').localeCompare(b.date??'9999-12-31')||b.evidence.documentDate.localeCompare(a.evidence.documentDate)||a.evidence.factId.localeCompare(b.evidence.factId));
 return {complete:true,checked:rows.length,approved:checked.filter(r=>r.status==='approved').length,withheld:rows.length-signals.length,signals};
}
