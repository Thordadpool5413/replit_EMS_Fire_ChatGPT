import type {Agency,FieldNote} from '../types';
import {eligiblePriorityAccounts,MAX_REVIEW_ACCOUNTS,type ReviewedSample} from './reviewedAccountPriorities';
import {providerIdentityReady} from './providerCompetitiveProfile';
import {buildTerritoryCommand} from './territoryCommand';
import type {ResolveLocation} from './geographicResearch';
import {isPhysicalStreet} from './providerLocationContract';
import {DAY_MS,validIsoDay} from './documentedIntelligence';

export const ACTIVITY_WINDOWS=[30,60,90] as const;
export type ActivityWindow=typeof ACTIVITY_WINDOWS[number];
export type ActivityStatus='recent'|'older'|'not-recorded';
const CONTACT_TYPES=new Set<FieldNote['meetingType']>(['On-Site Station Visit','Virtual Demo','Phone Call','Ride-Along']);
const VISIT_TYPES=new Set<FieldNote['meetingType']>(['On-Site Station Visit','Ride-Along']);
export function accountActivity(a:Agency,today:string,window:ActivityWindow){
 const notes=a.fieldNotes??[],tasks=a.followUpTasks??[];
 const ids=new Map<string,number>();
 for(const n of [...notes,...tasks])if(typeof n.id==='string'&&n.id.trim())ids.set(n.id.trim(),(ids.get(n.id.trim())??0)+1);
 const contacts:FieldNote[]=[];let withheld=0;
 for(const n of notes){
  if(n.taskOnly||!CONTACT_TYPES.has(n.meetingType))continue;
  if(!validIsoDay(today)||!validIsoDay(n.date)||n.date>today||typeof n.id!=='string'||!n.id.trim()||ids.get(n.id.trim())!==1){withheld++;continue;}
  contacts.push(n);
 }
 const since=validIsoDay(today)&&ACTIVITY_WINDOWS.includes(window)?new Date(Date.parse(today)-(window-1)*DAY_MS).toISOString().slice(0,10):'';
 const last=(rows:FieldNote[])=>rows.reduce<string|undefined>((v,n)=>!v||n.date>v?n.date:v,undefined);
 const lastContact=last(contacts),lastVisit=last(contacts.filter(n=>VISIT_TYPES.has(n.meetingType)));
 const recent=since?contacts.filter(n=>n.date>=since):[];
 const status:ActivityStatus=recent.length?'recent':lastContact?'older':'not-recorded';
 return {since,lastContact,lastVisit,status,contacts:recent.length,visits:recent.filter(n=>VISIT_TYPES.has(n.meetingType)).length,withheld};
}
/** Account coverage is a local recorded-activity lower bound, not market share, territory ownership or customer relationship status. */
export function buildAccountCoverage(agencies:Agency[],selected:string[],samples:ReviewedSample[],resolve:ResolveLocation,today:string,window:ActivityWindow,started:number,now=Date.now()){
 const invalid=selected.length>MAX_REVIEW_ACCOUNTS||selected.length!==new Set(selected).size||!validIsoDay(today)||!ACTIVITY_WINDOWS.includes(window)||!Number.isFinite(started)||!Number.isFinite(now)||started>now||now-started>=300000;
 const command=invalid?undefined:buildTerritoryCommand(agencies,selected,samples,resolve,today,now);
 const rows=command?eligiblePriorityAccounts(agencies).filter(a=>selected.includes(a.agency.id)&&providerIdentityReady(a.agency,agencies)).map(a=>{
  const activity=accountActivity(a.agency,today,window);
  const priority=command.priorities.find(p=>p.identityKey===a.identityKey)?.primary;
  const openTasks=command.tasks.filter(t=>t.agency.id===a.agency.id);
  const {location,match}=resolve(a.agency,agencies);
  const mapped=!!location&&location.identityKey===a.identityKey&&location.address.state===a.agency.stateCode&&isPhysicalStreet(location.address.street)&&!!match&&Number.isFinite(match.latitude)&&Number.isFinite(match.longitude)&&Math.abs(match.latitude)<=90&&Math.abs(match.longitude)<=180&&(match.latitude!==0||match.longitude!==0);
  return {...a,...activity,priority,mapped,openTasks:openTasks.length,overdue:openTasks.filter(t=>t.bucket==='overdue'||t.bucket==='today').length};
 }):[];
 const order:Record<ActivityStatus,number>={'not-recorded':0,older:1,recent:2};
 rows.sort((a,b)=>order[a.status]-order[b.status]||b.overdue-a.overdue||a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey));
 const recent=rows.filter(r=>r.status==='recent').length,older=rows.filter(r=>r.status==='older').length,notRecorded=rows.filter(r=>r.status==='not-recorded').length;
 return {active:!invalid,selected:selected.length,eligible:rows.length,excluded:invalid?0:selected.length-rows.length,rows,recent,older,notRecorded,visitAccounts:rows.filter(r=>r.visits>0).length,priorityGaps:rows.filter(r=>r.status!=='recent'&&r.priority).length,overdueAccounts:rows.filter(r=>r.overdue>0).length,mapped:rows.filter(r=>r.mapped).length,withheld:rows.reduce((n,r)=>n+r.withheld,0),checked:command?.checked??0};
}
