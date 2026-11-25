import type {Agency} from '../types';
import {buildTerritoryCommand} from './territoryCommand';
import {buildGeographicResearch,groupNearby,type ResolveLocation} from './geographicResearch';
import {eligiblePriorityAccounts,type ReviewedSample} from './reviewedAccountPriorities';
import {providerIdentityReady} from './providerCompetitiveProfile';
import {validIsoDay,DAY_MS} from './documentedIntelligence';

export type FieldVisit={agencyId:string;identityKey:string;day:string;objective:string};
export function fieldPlanDays(today:string):string[]{
 if(!validIsoDay(today))return [];
 return Array.from({length:7},(_,i)=>new Date(Date.parse(today)+i*DAY_MS).toISOString().slice(0,10));
}
export function buildFieldPlan(agencies:Agency[],selected:string[],samples:ReviewedSample[],resolve:ResolveLocation,today:string,visits:FieldVisit[],started:number,now=Date.now()){
 const days=fieldPlanDays(today);
 const valid=days.length===7&&Number.isFinite(started)&&started<=now&&now-started<300000;
 const command=buildTerritoryCommand(agencies,selected,samples,resolve,today,now);
 const active=valid&&!command.invalidScope;
 const ranked=new Map(command.priorities.map((r,i)=>[r.agency.id,{rank:i+1,primary:r.primary}]));
 const geography=active?buildGeographicResearch(agencies,selected,samples,resolve,25,now):undefined;
 const candidates=active?eligiblePriorityAccounts(agencies).filter(a=>selected.includes(a.agency.id)&&providerIdentityReady(a.agency,agencies)).map(a=>({
  ...a,priority:ranked.get(a.agency.id),location:geography?.located.find(g=>g.identityKey===a.identityKey),
  tasks:command.tasks.filter(t=>t.agency.id===a.agency.id),
 })).sort((a,b)=>(a.priority?.rank??Infinity)-(b.priority?.rank??Infinity)||a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey)):[];
 const byId=new Map(candidates.map(a=>[a.agency.id,a]));
 const counts=new Map<string,number>();
 for(const v of visits)counts.set(v.agencyId,(counts.get(v.agencyId)??0)+1);
 const planned=active?visits.flatMap(v=>{
  const a=byId.get(v.agencyId);
  return a&&a.identityKey===v.identityKey&&counts.get(v.agencyId)===1&&days.includes(v.day)&&typeof v.objective==='string'&&v.objective.trim().length>0&&v.objective.length<=300?[{...a,visit:{...v,objective:v.objective.trim()}}]:[];
 }):[];
 const schedule=days.map(day=>{
  const rows=planned.filter(a=>a.visit.day===day).sort((a,b)=>(a.priority?.rank??Infinity)-(b.priority?.rank??Infinity)||a.agency.name.localeCompare(b.agency.name));
  const points=rows.flatMap(a=>a.location?[a.location]:[]);
  return {day,rows,groups:groupNearby(points,25).filter(g=>g.accounts.length>1),unmapped:rows.filter(a=>!a.location).length};
 });
 return {active,days,candidates,planned,schedule,unplanned:candidates.filter(a=>!planned.some(p=>p.agency.id===a.agency.id)),withheld:visits.length-planned.length,checked:active?command.checked:0,selected:selected.length};
}
