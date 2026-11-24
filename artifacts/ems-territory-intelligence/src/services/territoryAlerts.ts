import type {Agency,FieldNote} from '../types';
import {buildOpportunityPriorities,type PrioritySignal} from './opportunityPrioritization';
import {DAY_MS,utcDay} from './documentedIntelligence';
import {localDay} from '../utils/followUps';
import {feedIsStale,feedKey,possibleGrantOverlap,validateDiscoveryFeed,type DiscoveryFeed,type FeedItem} from './recurringDiscoveryContract';
export const ALERT_WINDOWS={followUpDays:7,bidDays:45,contractDays:90,fundingDocumentDays:30} as const;
export const ALERT_TYPES={followup:'Follow-up',procurement:'Purchasing deadline',contract:'Contract end date',funding:'Recent funding document',public:'Public research change'} as const;
export type AlertType=keyof typeof ALERT_TYPES;
export type LocalAlert={key:string;type:Exclude<AlertType,'public'>;urgency:'now'|'soon'|'research';agency:Agency;date:string;days:number;title:string;detail:string;signal?:PrioritySignal;task?:FieldNote};
export type PublicAlert={key:string;type:'public';urgency:'research';state:string;date:string;title:string;detail:string;item:FeedItem;overlap:boolean};
export type TerritoryAlert=LocalAlert|PublicAlert;
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const daysBetween=(date:string,today:string)=>(Date.parse(date)-Date.parse(today))/DAY_MS;
const urgency={now:0,soon:1,research:2};
function compare(a:TerritoryAlert,b:TerritoryAlert){return urgency[a.urgency]-urgency[b.urgency]||a.date.localeCompare(b.date)||a.key.localeCompare(b.key);}
function taskSignature(n:FieldNote){return JSON.stringify([n.nextAction.trim(),n.dueDate,n.followUpStatus??'open',n.owner??'',n.priority??'normal']);}
export function buildLocalTerritoryAlerts(agencies:Agency[],now=Date.now()){
 const today=localDay(new Date(now)),utc=utcDay(now),ids=new Map<string,number>();
 for(const a of agencies)if(a.id)ids.set(a.id,(ids.get(a.id)??0)+1);
 const alerts:LocalAlert[]=[];
 let withheldTasks=0;
 for(const agency of agencies){
  const tasks=[...(agency.fieldNotes??[]),...(agency.followUpTasks??[])];
  if(!tasks.length)continue;
  const records=new Map<string,{note:FieldNote;signature:string}>(),conflicts=new Set<string>();
  for(const note of tasks){
   if(!note.id||typeof note.nextAction!=='string'){withheldTasks++;continue;}
   // Include completed/undated copies in conflict detection, not just due copies.
   const signature=taskSignature(note),prior=records.get(note.id);
   if(prior&&prior.signature!==signature)conflicts.add(note.id);
   else if(!prior)records.set(note.id,{note,signature});
  }
  for(const [id,{note}] of records){
   if(conflicts.has(id)||ids.get(agency.id)!==1){withheldTasks++;continue;}
   if(note.followUpStatus==='completed'||!note.nextAction.trim())continue;
   if(note.followUpStatus!==undefined&&note.followUpStatus!=='open'||!day(note.dueDate)){withheldTasks++;continue;}
   const days=daysBetween(note.dueDate,today);
   if(days>ALERT_WINDOWS.followUpDays)continue;
   alerts.push({key:JSON.stringify(['task',agency.id,id,note.dueDate]),type:'followup',urgency:days<=0?'now':'soon',agency,date:note.dueDate,days,title:note.nextAction,detail:days<0?'Saved follow-up is overdue by '+(-days)+' local calendar day(s).':days===0?'Saved follow-up is due today.':'Saved follow-up is due in '+days+' local calendar day(s).',task:note});
  }
 }
 const ranked=buildOpportunityPriorities(agencies,'all','all',now);
 for(const row of ranked.ranked)for(const signal of row.signals){
  let type:LocalAlert['type'],level:LocalAlert['urgency'],date:string,days:number,title:string;
  if(signal.kind==='open-procurement'&&signal.date&&signal.days!==undefined&&signal.days>=0&&signal.days<=ALERT_WINDOWS.bidDays){
   type='procurement';level=signal.band==='verify-now'?'now':'soon';date=signal.date;days=signal.days;title='Published solicitation response date';
  }else if(signal.kind==='contract-renewal'&&signal.date&&signal.days!==undefined&&signal.days>=0&&signal.days<=ALERT_WINDOWS.contractDays){
   type='contract';level=signal.days<=14?'now':'soon';date=signal.date;days=signal.days;title='Documented agreement end date';
  }else if((signal.kind==='grant-award'||signal.kind==='capital-approved')&&daysBetween(utc,signal.evidence.documentDate)<=ALERT_WINDOWS.fundingDocumentDays&&signal.evidence.documentDate<=utc){
   type='funding';level='research';date=signal.evidence.documentDate;days=daysBetween(date,utc);title=signal.kind==='grant-award'?'Recent dated grant document':'Recent dated capital approval';
  }else continue;
  alerts.push({key:JSON.stringify(['evidence',row.identityKey,signal.key]),type,urgency:level,agency:row.agency,date,days,title,detail:signal.reason,signal});
 }
 return {alerts:alerts.sort(compare),withheldTasks,reviewRequired:ranked.reviewRequired,identityExcluded:ranked.identityExcluded,loadedRows:ranked.loadedRows,asOfUtc:utc,asOfLocal:today};
}
export function buildPublicTerritoryAlerts(input:unknown,now=Date.now()):{status:'unavailable'|'stale'|'ready';alerts:PublicAlert[];feed?:DiscoveryFeed}{
 let feed:DiscoveryFeed;
 try{feed=validateDiscoveryFeed(input,now);}catch{return {status:'unavailable',alerts:[]};}
 if(feedIsStale(feed,now))return {status:'stale',alerts:[],feed};
 const overlap=possibleGrantOverlap(feed.items);
 const alerts:PublicAlert[]=feed.items.filter(i=>i.lastSeen===feed.runAt&&i.lastChanged===feed.runAt&&i.event!=='baseline').map(i=>{
  const c=i.candidate;
  const kind=c.kind==='grant'?'Grant record':c.kind==='federal-contract-award'?'Federal supplier award':'Municipal procurement notice';
  return {key:JSON.stringify(['public',feedKey(c),i.lastChanged]),type:'public',urgency:'research',state:c.state,date:i.lastChanged.slice(0,10),title:kind+(i.event==='changed'?' changed in source sample':' new to monitored sample'),detail:'Public research only. Not an assigned provider, verified open solicitation, available funding or confirmed buying intent.',item:i,overlap:overlap.has(feedKey(c))};
 });
 return {status:'ready',alerts:alerts.sort(compare),feed};
}
export function combineTerritoryAlerts(local:LocalAlert[],publicAlerts:PublicAlert[]):TerritoryAlert[]{return [...local,...publicAlerts].sort(compare);}
export function alertState(a:TerritoryAlert){return a.type==='public'?a.state:a.agency.stateCode;}
export function alertOrganization(a:TerritoryAlert){return a.type==='public'?a.item.candidate.organization:a.agency.name;}
