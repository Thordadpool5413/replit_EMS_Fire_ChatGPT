import type {Agency,FieldNote} from '../types';
import {buildLeadershipReview,type DeviceRead,type ReviewReason} from './leadershipReview';
import type {ReviewedSample} from './reviewedAccountPriorities';
import type {ResolveLocation} from './geographicResearch';
import {reviewedCallPoints} from './preCallPlanning';
import {PROVIDER_EQUIPMENT_KINDS,type ProviderEquipmentKind} from './providerCompetitiveProfile';
import {validIsoDay,DAY_MS} from './documentedIntelligence';

export type CoachingTopic=ReviewReason|'pre-call';
export const COACHING_LABELS:Record<CoachingTopic,string>={'pre-call':'Pre-call preparation',deadline:'Purchasing timeline', 'follow-up':'Follow-up accountability','pipeline-risk':'Opportunity advancement','contact-gap':'Account discovery','document-gap':'Evidence validation','location-gap':'Field visit readiness','working-record-gap':'Opportunity qualification'};
type Prompt={objective:string;questions:readonly [string,string,string];measure:string};
const prompts:Record<CoachingTopic,Prompt>={
 'pre-call':{objective:'Prepare a specific, permission-based discovery conversation.',questions:['What do we know from current sources, and what is still unknown?','Which operational problem and authorized decision role should we clarify?','What mutually agreed next step would demonstrate progress?'],measure:'Record one verified need or an explicit evidence gap, the decision role to confirm, and a dated next action.'},
 deadline:{objective:'Verify the published purchasing milestone before deciding a response.',questions:['Is the date still current after amendments, extensions or cancellations?','What scope, eligibility and communication rules apply?','Who owns the next permissible step and when is it due?'],measure:'Check the official record, document current date and restrictions, and agree an internal next action.'},
 'follow-up':{objective:'Resolve outstanding commitments without treating overdue tasks as customer failure.',questions:['What was actually agreed and what remains outstanding?','What is blocking completion or a realistic revised date?','Which action can we complete or renegotiate with the appropriate owner?'],measure:'Review due tasks; record actual completion or an explicitly agreed revised owner and date.'},
 'pipeline-risk':{objective:'Clarify the actual opportunity status and next milestone.',questions:['What evidence supports the current stage?','What changed since the last update and which decision role must be confirmed?','What measurable action, owner and date should be recorded?'],measure:'Revalidate the working stage and record a supported milestone plus a dated next action.'},
 'contact-gap':{objective:'Check the activity record before planning account discovery.',questions:['Was contact recorded elsewhere or is the relationship still unknown?','Which verified priority is relevant to an authorized contact?','What question or permitted next conversation would establish a useful next step?'],measure:'Reconcile recorded contact history and define a permission-based discovery objective.'},
 'document-gap':{objective:'Establish the missing evidence before making account-specific claims.',questions:['Which record or review could not be established?','What official source or authorized observation would resolve the gap?','How will we verify the identity, date and scope before use?'],measure:'Record a current source reference or an explicit unresolved gap; do not qualify on missing evidence.'},
 'location-gap':{objective:'Verify a physical provider location before planning a field visit.',questions:['Is the reported site a physical service location or a mailing address?','Which source confirms the specific provider and site?','What verification or permission is required before visiting?'],measure:'Record a source-matched physical location or mark the visit location unresolved.'},
 'working-record-gap':{objective:'Determine whether a reviewed signal warrants a working opportunity.',questions:['What actual need has the agency confirmed?','Which role owns evaluation and purchasing decisions?','What supporting reference and dated next action would justify qualification?'],measure:'Record a user-validated need, decision role and reference, or retain discovery status.'}
};
export function buildCoachingReview(agencies:Agency[],selected:string[],samples:ReviewedSample[],device:DeviceRead[],resolve:ResolveLocation,today:string,started:number,now=Date.now()){
 const review=buildLeadershipReview(agencies,selected,samples,device,resolve,today,30,started,now);
 return {...review,rows:review.rows.map(a=>{
  const topics:CoachingTopic[]=[...a.reasons,'pre-call'];
  return {...a,topics};
 })};
}
export type CoachingAccount=ReturnType<typeof buildCoachingReview>['rows'][number];
export function coachingPrompt(account:CoachingAccount,topic:CoachingTopic):Prompt|undefined{
 if(!account.topics.includes(topic))return;
 if(topic==='pre-call'&&account.priority){
  const s=account.priority.signal,kind=s.evidence.kind;
  const focus=PROVIDER_EQUIPMENT_KINDS.some(k=>k===kind)?kind as ProviderEquipmentKind:undefined;
  const p=reviewedCallPoints(s.kind,focus);
  return {objective:p.objective,questions:p.questions,measure:'Verify the source and current account scope; record a confirmed need or evidence gap and an agreed next action if appropriate.'};
 }
 return prompts[topic];
}
export type CoachingDraft={agencyId:string;identityKey:string;topic:CoachingTopic;action:string;measure:string;owner:string;dueDate:string};
export function coachingDraftError(d:CoachingDraft,today:string):string|undefined{
 if(!validIsoDay(today)||!validIsoDay(d.dueDate)||d.dueDate<today||Date.parse(d.dueDate)-Date.parse(today)>365*DAY_MS)return 'Choose a review date from today through the next 365 days.';
 for(const [v,max] of [[d.action,240],[d.measure,240],[d.owner,100]] as const)if(typeof v!=='string'||!v.trim()||v.length>max)return 'Enter a specific action, success measure and responsible owner within the field limits.';
 return undefined;
}
/** Only a confirmed coaching commitment becomes an existing internal task, never a field contact or opportunity update. */
export function makeCoachingTask(account:CoachingAccount|undefined,draft:CoachingDraft,confirmed:boolean,id:string,today:string,started:number,now=Date.now()):FieldNote{
 if(!confirmed||!id.trim()||!Number.isFinite(started)||!Number.isFinite(now)||started>now||now-started>=300000||!account||account.agency.id!==draft.agencyId||account.identityKey!==draft.identityKey||!coachingPrompt(account,draft.topic))throw Error('Current selected account, coaching topic and explicit validation required.');
 const error=coachingDraftError(draft,today);if(error)throw Error(error);
 return {id,date:today,repName:'',meetingType:'Standalone task',notes:'',taskOnly:true,nextAction:'Coaching: '+draft.action.trim()+' | Success measure: '+draft.measure.trim(),owner:draft.owner.trim(),dueDate:draft.dueDate,priority:'normal',followUpStatus:'open'};
}
