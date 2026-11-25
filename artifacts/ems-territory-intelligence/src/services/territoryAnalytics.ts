import type {Agency} from '../types';
import {accountActivity,type ActivityWindow} from './accountCoverage';
import {buildLeadershipReview,type DeviceRead} from './leadershipReview';
import {buildCompetitiveDisplacement} from './competitiveDisplacement';
import {readDeal,DEAL_STAGES} from './workingPipeline';
import type {ReviewedSample} from './reviewedAccountPriorities';
import type {ResolveLocation} from './geographicResearch';
import {validIsoDay,DAY_MS} from './documentedIntelligence';

const shift=(day:string,n:number)=>new Date(Date.parse(day)+n*DAY_MS).toISOString().slice(0,10);
export function recordedTaskCohort(a:Agency,start:string,end:string,today:string){
 const all=[...(a.fieldNotes??[]),...(a.followUpTasks??[])],ids=new Map<string,number>();
 for(const t of all)if(typeof t.id==='string'&&t.id.trim())ids.set(t.id.trim(),(ids.get(t.id.trim())??0)+1);
 let total=0,complete=0,open=0,overdue=0,unknownDate=0,coaching=0,coachingComplete=0,withheld=0;
 if(![start,end,today].every(validIsoDay)||start>end||end>today)return {total,complete,open,overdue,unknownDate,coaching,coachingComplete,withheld};
 for(const t of all){
  if(typeof t.nextAction!=='string'||!t.nextAction.trim())continue;
  if(typeof t.id!=='string'||!t.id.trim()||ids.get(t.id.trim())!==1||!validIsoDay(t.date)||t.date>today||!(t.followUpStatus===undefined||t.followUpStatus==='open'||t.followUpStatus==='completed')){withheld++;continue;}
  if(t.date<start||t.date>end)continue;
  total++;
  const done=t.followUpStatus==='completed';
  if(done)complete++;else{open++;if(!validIsoDay(t.dueDate))unknownDate++;else if(t.dueDate<today)overdue++;}
  // Existing coaching tasks have an explicit text marker, not a separate audited coaching entity.
  if(t.taskOnly===true&&t.meetingType==='Standalone task'&&/^Coaching: .+ \| Success measure: .+/s.test(t.nextAction)){coaching++;if(done)coachingComplete++;}
 }
 return {total,complete,open,overdue,unknownDate,coaching,coachingComplete,withheld};
}
/** Compares equal-length recorded contact windows for the same eligible sample. Other measures are current snapshots, not historic conversion rates. */
export function buildTerritoryAnalytics(agencies:Agency[],selected:string[],samples:ReviewedSample[],device:DeviceRead[],resolve:ResolveLocation,today:string,window:ActivityWindow,started:number,now=Date.now()){
 const review=buildLeadershipReview(agencies,selected,samples,device,resolve,today,window,started,now);
 const start=review.active?shift(today,1-window):'',previousEnd=review.active?shift(today,-window):'',previousStart=review.active?shift(today,1-2*window):'';
 const competitive=review.active?buildCompetitiveDisplacement(agencies,review.rows.map(a=>a.agency.id),samples,started,90,now):undefined;
 const rows=review.rows.map(a=>{
  const prior=accountActivity(a.agency,previousEnd,window);
  const tasks=recordedTaskCohort(a.agency,start,today,today);
  const matches=device.filter(d=>d.agencyId===a.agency.id&&d.identityKey===a.identityKey);
  const raw=matches.length===1&&matches[0].status==='read'?matches[0].record:undefined;
  const deal=a.dealAvailable?readDeal(raw,a.agency.id,a.identityKey,now):undefined;
  // Stored timestamps are UTC; exclude the first retained item, which may be truncated.
  const changes=deal?.history.filter((h,i)=>i>0&&h.stage!==deal.history[i-1].stage&&h.at.slice(0,10)>=start&&h.at.slice(0,10)<=today).length??0;
  const c=competitive?.accounts.find(x=>x.identityKey===a.identityKey);
  return {agency:a.agency,identityKey:a.identityKey,contacts:a.contacts,previousContacts:prior.contacts,visits:a.visits,previousVisits:prior.visits,documentsAvailable:a.documentsAvailable,mapped:a.mapped,dealAvailable:a.dealAvailable,stage:deal?.stage,changes,historyTruncated:!!deal&&deal.revision>deal.history.length,competitive:c?.status??'review-unavailable',tasks};
 });
 const sum=(pick:(r:typeof rows[number])=>number)=>rows.reduce((n,r)=>n+pick(r),0);
 const taskTotals={total:sum(r=>r.tasks.total),complete:sum(r=>r.tasks.complete),open:sum(r=>r.tasks.open),overdue:sum(r=>r.tasks.overdue),unknownDate:sum(r=>r.tasks.unknownDate),coaching:sum(r=>r.tasks.coaching),coachingComplete:sum(r=>r.tasks.coachingComplete),withheld:sum(r=>r.tasks.withheld)};
 return {active:review.active,selected:review.selected,eligible:rows.length,excluded:review.excluded,start,today,previousStart,previousEnd,rows,current:{contacts:sum(r=>r.contacts),visits:sum(r=>r.visits),accounts:rows.filter(r=>r.contacts>0).length},previous:{contacts:sum(r=>r.previousContacts),visits:sum(r=>r.previousVisits),accounts:rows.filter(r=>r.previousContacts>0).length},documents:review.checked,mapped:review.mapped,withheldActivity:review.withheldActivity,competitiveChecked:competitive?.checked??0,competitorAccounts:competitive?.competitorAccounts??0,deviceReadable:review.deviceReadable,workingRecords:review.recorded,stageChanges:sum(r=>r.changes),changedAccounts:rows.filter(r=>r.changes>0).length,truncatedHistories:rows.filter(r=>r.historyTruncated).length,byStage:DEAL_STAGES.map(stage=>({stage,count:rows.filter(r=>r.stage===stage).length})),tasks:taskTotals};
}
