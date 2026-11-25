import type {Agency} from '../types';
import {buildAccountCoverage,ACTIVITY_WINDOWS,type ActivityWindow} from './accountCoverage';
import {buildWorkingPipeline,dealScope,DEAL_STAGES,type DealRecord} from './workingPipeline';
import {buildReviewedAccountPriorities,MAX_REVIEW_ACCOUNTS,type ReviewedSample} from './reviewedAccountPriorities';
import type {ResolveLocation} from './geographicResearch';
import {validIsoDay} from './documentedIntelligence';
import type {CommandView} from './territoryCommand';

export const REVIEW_REASONS=['deadline','follow-up','pipeline-risk','contact-gap','document-gap','location-gap','working-record-gap'] as const;
export type ReviewReason=typeof REVIEW_REASONS[number];
export const REASON_LABELS:Record<ReviewReason,string>={deadline:'Reviewed near-term purchasing date', 'follow-up':'Recorded follow-up due or overdue','pipeline-risk':'Working opportunity next-action or recency gap','contact-gap':'No recent contact recorded for reviewed priority','document-gap':'Reviewed document sample unavailable','location-gap':'Accepted map location not loaded','working-record-gap':'Reviewed priority without a working record'};
export const REASON_VIEWS:Record<ReviewReason,CommandView>={deadline:'commercial','follow-up':'followups','pipeline-risk':'pipeline','contact-gap':'activity','document-gap':'coverage','location-gap':'geography','working-record-gap':'pipeline'};
export type DeviceRead={agencyId:string;identityKey:string;status:'read'|'unavailable';record?:DealRecord};
/** Read-only review of the current selected accounts, not a team performance or employee evaluation. */
export function buildLeadershipReview(agencies:Agency[],selected:string[],samples:ReviewedSample[],device:DeviceRead[],resolve:ResolveLocation,today:string,window:ActivityWindow,started:number,now=Date.now()){
 const active=Number.isFinite(now)&&Number.isFinite(started)&&started<=now&&now-started<300000&&validIsoDay(today)&&ACTIVITY_WINDOWS.includes(window)&&selected.length>0&&selected.length<=MAX_REVIEW_ACCOUNTS&&selected.length===new Set(selected).size;
 const scope=active?dealScope(agencies,selected,started,now):[];
 const eligibleIds=scope.map(a=>a.agency.id);
 const safeSamples=samples.filter(s=>eligibleIds.includes(s.agencyId));
 const coverage=buildAccountCoverage(agencies,eligibleIds,safeSamples,resolve,today,window,started,now);
 const reviewed=active?buildReviewedAccountPriorities(agencies,eligibleIds,safeSamples,now):undefined;
 const missing=new Set(reviewed?.gaps.filter(g=>g.status==='unavailable'||g.status==='identity-excluded').map(g=>g.id));
 const byIdentity=new Map(scope.map(a=>{
  const matches=device.filter(d=>d.agencyId===a.agency.id&&d.identityKey===a.identityKey);
  const read=matches.length===1&&matches[0].status==='read'?matches[0]:undefined;
  return [a.identityKey,read] as const;
 }));
 const records=[...byIdentity.values()].flatMap(d=>d?.record?[d.record]:[]);
 const pipeline=buildWorkingPipeline(agencies,eligibleIds,safeSamples,records,started,today,now);
 const rows=active?coverage.rows.map(a=>{
  const p=pipeline.rows.find(r=>r.identityKey===a.identityKey),read=byIdentity.get(a.identityKey);
  const dealAvailable=!!read&&(!read.record||!!p?.deal);
  const deal=dealAvailable?p?.deal:undefined;
  const reasons:ReviewReason[]=[];
  if(a.priority&&(a.priority.band==='verify-now'||a.priority.band==='verify-soon'))reasons.push('deadline');
  if(a.overdue>0)reasons.push('follow-up');
  if(dealAvailable&&p?.risks.length)reasons.push('pipeline-risk');
  if(a.priority&&a.status!=='recent')reasons.push('contact-gap');
  if(missing.has(a.agency.id))reasons.push('document-gap');
  if(!a.mapped)reasons.push('location-gap');
  if(a.priority&&dealAvailable&&!deal)reasons.push('working-record-gap');
  return {agency:a.agency,identityKey:a.identityKey,activity:a.status,lastContact:a.lastContact,contacts:a.contacts,visits:a.visits,mapped:a.mapped,priority:a.priority,documentsAvailable:!missing.has(a.agency.id),dealAvailable,stage:deal?.stage,openTasks:a.openTasks,dueTasks:a.overdue,risks:dealAvailable?p?.risks??[]:[],reasons};
 }):[];
 rows.sort((a,b)=>(a.reasons.length?REVIEW_REASONS.indexOf(a.reasons[0]):99)-(b.reasons.length?REVIEW_REASONS.indexOf(b.reasons[0]):99)||a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey));
 const readable=rows.filter(r=>r.dealAvailable);
 return {active,selected:selected.length,eligible:rows.length,excluded:active?selected.length-rows.length:0,rows,checked:rows.filter(r=>r.documentsAvailable).length,contacted:rows.filter(r=>r.activity==='recent').length,mapped:rows.filter(r=>r.mapped).length,deviceReadable:readable.length,recorded:readable.filter(r=>r.stage).length,qualified:readable.filter(r=>r.stage&&['qualified','evaluation','procurement'].includes(r.stage)).length,withheldActivity:active?coverage.withheld:0,attention:rows.filter(r=>r.reasons.length).length,byReason:REVIEW_REASONS.map(reason=>({reason,count:rows.filter(r=>r.reasons.includes(reason)).length})),byStage:DEAL_STAGES.map(stage=>({stage,count:readable.filter(r=>r.stage===stage).length}))};
}
