import type {Agency} from '../types';
import {eligiblePriorityAccounts,MAX_REVIEW_ACCOUNTS,type ReviewedSample} from './reviewedAccountPriorities';
import {providerIdentityReady} from './providerCompetitiveProfile';
import {buildTerritoryCommand} from './territoryCommand';
import {validIsoDay,DAY_MS} from './documentedIntelligence';
export const DEAL_STAGES=['research','qualified','evaluation','procurement','won','closed'] as const;
export type DealStage=typeof DEAL_STAGES[number];
export const DEAL_LABELS:Record<DealStage,string>={research:'Research / discovery',qualified:'Qualified need',evaluation:'Evaluation',procurement:'Purchasing process',won:'Won (user recorded)',closed:'Closed / not pursuing'};
export type DealInput={stage:DealStage;need:string;authority:string;milestone:string;reference:string;nextAction:string;dueDate:string};
export type DealRecord=DealInput&{identityKey:string;agencyId:string;revision:number;updatedAt:string;history:{stage:DealStage;at:string}[]};
export const EMPTY_DEAL:DealInput={stage:'research',need:'',authority:'',milestone:'',reference:'',nextAction:'',dueDate:''};
const limits={need:300,authority:160,milestone:300,reference:300,nextAction:300,dueDate:10} as const;
const terminal=(s:DealStage)=>s==='won'||s==='closed';
const isStage=(v:unknown):v is DealStage=>DEAL_STAGES.some(s=>s===v);
const time=(v:unknown,now:number):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now;
export function validateDealInput(input:DealInput):string|undefined{
 if(!input||!isStage(input.stage))return 'Choose a working opportunity stage.';
 for(const [k,max] of Object.entries(limits) as [keyof typeof limits,number][])if(typeof input[k]!=='string'||input[k].length>max)return 'One or more fields exceed the permitted length.';
 if(input.dueDate&&!validIsoDay(input.dueDate))return 'Enter a valid next-action date.';
 if(input.stage!=='research'&&input.stage!=='closed'&&(!input.need.trim()||!input.authority.trim()||!input.reference.trim()))return 'Record the validated need, decision role and evidence reference before advancing.';
 if(['evaluation','procurement','won','closed'].includes(input.stage)&&!input.milestone.trim())return 'Record the actual milestone or reason for closure.';
 if(terminal(input.stage)&&!input.reference.trim())return 'Record the evidence reference for the outcome or closure.';
 if(!terminal(input.stage)&&input.stage!=='research'&&(!input.nextAction.trim()||!input.dueDate))return 'Record a dated next action before advancing.';
 if(input.nextAction.trim()&&!input.dueDate||input.dueDate&&!input.nextAction.trim())return 'A next action and its due date must be recorded together.';
 return undefined;
}
export function dealScope(agencies:Agency[],selected:string[],started:number,now=Date.now()){
 if(!Number.isFinite(now)||!Number.isFinite(started)||started>now||now-started>=300000||selected.length>MAX_REVIEW_ACCOUNTS||selected.length!==new Set(selected).size)return [];
 return eligiblePriorityAccounts(agencies).filter(a=>selected.includes(a.agency.id)&&providerIdentityReady(a.agency,agencies));
}
export function readDeal(raw:unknown,agencyId:string,identityKey:string,now=Date.now()):DealRecord|undefined{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
 const r=raw as DealRecord;
 if(r.agencyId!==agencyId||r.identityKey!==identityKey||!Number.isSafeInteger(r.revision)||r.revision<1||!time(r.updatedAt,now)||validateDealInput(r)||!Array.isArray(r.history)||!r.history.length||r.history.length>50||r.history.length!==Math.min(50,r.revision))return;
 if(r.history.some((h,i)=>!h||!isStage(h.stage)||!time(h.at,now)||i>0&&Date.parse(h.at)<Date.parse(r.history[i-1].at)))return;
 const last=r.history[r.history.length-1];if(last.stage!==r.stage||last.at!==r.updatedAt)return;
 return {...Object.fromEntries(Object.keys(limits).map(k=>[k,r[k as keyof typeof limits]])),stage:r.stage,agencyId,identityKey,revision:r.revision,updatedAt:r.updatedAt,history:r.history.map(h=>({stage:h.stage,at:h.at}))} as DealRecord;
}
export function advanceDeal(input:DealInput,agencyId:string,identityKey:string,previous:DealRecord|undefined,confirmed:boolean,now=Date.now()):DealRecord{
 if(!confirmed)throw Error('Explicit user validation is required.');
 if(!agencyId||!identityKey||!Number.isFinite(now))throw Error('Provider identity unavailable.');
 if(previous&&!readDeal(previous,agencyId,identityKey,now))throw Error('Existing opportunity record is invalid.');
 const error=validateDealInput(input);if(error)throw Error(error);
 const next={...EMPTY_DEAL,stage:input.stage};for(const k of Object.keys(limits) as (keyof typeof limits)[])next[k]=input[k].trim();
 const at=new Date(now).toISOString(),revision=(previous?.revision??0)+1;
 if(!Number.isSafeInteger(revision))throw Error('Revision limit reached.');
 return {...next,agencyId,identityKey,revision,updatedAt:at,history:[...(previous?.history??[]),{stage:input.stage,at}].slice(-50)};
}
type Store=Pick<Storage,'getItem'|'setItem'>;
export const dealStorageKey=(uid:string,agencyId:string,identityKey:string)=>'atlas_working_deal_v1:'+JSON.stringify([uid,agencyId,identityKey]);
export function loadDeal(store:Store,uid:string,agencyId:string,identityKey:string,now=Date.now()):DealRecord|undefined{
 if(!uid)throw Error('Sign in required.');
 const raw=store.getItem(dealStorageKey(uid,agencyId,identityKey));if(raw===null)return;
 let data:unknown;try{data=JSON.parse(raw);}catch{throw Error('Saved device record is unreadable.');}
 const r=readDeal(data,agencyId,identityKey,now);if(!r)throw Error('Saved device record is invalid. No changes made.');return r;
}
export function saveDeal(store:Store,uid:string,agencyId:string,identityKey:string,input:DealInput,expected:number,confirmed:boolean,now=Date.now()){
 const previous=loadDeal(store,uid,agencyId,identityKey,now);
 if((previous?.revision??0)!==expected)throw Error('Record changed in another view. Reload before saving.');
 const r=advanceDeal(input,agencyId,identityKey,previous,confirmed,now);
 store.setItem(dealStorageKey(uid,agencyId,identityKey),JSON.stringify(r));return r;
}
export function buildWorkingPipeline(agencies:Agency[],selected:string[],samples:ReviewedSample[],records:DealRecord[],started:number,today:string,now=Date.now()){
 const scope=validIsoDay(today)?dealScope(agencies,selected,started,now):[];
 const command=scope.length?buildTerritoryCommand(agencies,selected,samples,()=>({location:undefined,match:undefined}),today,now):undefined;
 const rows=scope.map(a=>{
  const matches=records.filter(r=>r.agencyId===a.agency.id&&r.identityKey===a.identityKey);
  const deal=matches.length===1?readDeal(matches[0],a.agency.id,a.identityKey,now):undefined;
  const priority=command?.priorities.find(p=>p.identityKey===a.identityKey)?.primary;
  const tasks=command?.tasks.filter(t=>t.agency.id===a.agency.id)??[];
  const risks=deal&&!terminal(deal.stage)?[...(!deal.nextAction||!deal.dueDate?['Next action not recorded']:deal.dueDate<today?['Next action overdue']:[]),...(Date.parse(today)-Date.parse(deal.updatedAt.slice(0,10))>30*DAY_MS?['Working record older than 30 days']:[])]:[];
  return {...a,deal,priority,openTasks:tasks.length,overdueTasks:tasks.filter(t=>t.bucket==='overdue').length,risks};
 });
 return {rows,eligible:rows.length,selected:selected.length,checked:command?.checked??0,unrecorded:rows.filter(r=>!r.deal).length,qualified:rows.filter(r=>r.deal&&['qualified','evaluation','procurement'].includes(r.deal.stage)).length,atRisk:rows.filter(r=>r.risks.length>0).length,byStage:DEAL_STAGES.map(stage=>({stage,count:rows.filter(r=>r.deal?.stage===stage).length}))};
}
