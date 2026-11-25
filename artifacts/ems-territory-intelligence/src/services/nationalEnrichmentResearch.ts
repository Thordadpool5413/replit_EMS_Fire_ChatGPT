import type {Agency} from '../types';
import {buildDiscoveryMatches,DISCOVERY_STATES,loadDiscoveryPage} from './publicIntelligenceDiscovery';
import {loadFederalDiscovery} from './federalSpendingDiscovery';
import {FEDERAL_TOPICS,type FederalTopic} from './federalDiscoveryContract';
export const TOPICS=['fema','grants','defibrillator','resuscitation','ventilator','ambulance','epcr'] as const;
export type Topic=typeof TOPICS[number];
export type Candidate={source:'openfema'|'usaspending';id:string;recipient:string;state:string;kind:'grant'|'supplier';title:string;amount:number|null;url:string;period:string};
export type Scope={topic:Topic;status:'retrieved'|'partial'|'unavailable';pages:number;sourceRows:number;withheld:number;rows:Candidate[]};
export type Snapshot={state:string;started:number;scopes:Scope[]};
export function topicLabel(t:Topic){return t==='fema'?'OpenFEMA firefighter assistance':FEDERAL_TOPICS[t];}
export async function sampleResearch(state:string,year:number,topics:Topic[],signal:AbortSignal,progress:(text:string)=>void,load={fema:loadDiscoveryPage,federal:loadFederalDiscovery}):Promise<Snapshot>{
 if(!DISCOVERY_STATES.includes(state)||!Number.isInteger(year)||year<2010||year>new Date().getUTCFullYear()||!topics.length||topics.length>3||new Set(topics).size!==topics.length||topics.some(t=>!TOPICS.includes(t)))throw Error('Invalid research scope.');
 const started=Date.now(),scopes:Scope[]=[];
 for(const topic of topics){
  signal.throwIfAborted();progress('Checking '+topicLabel(topic));
  const rows:Candidate[]=[];let pages=0,sourceRows=0,withheld=0,more=false,failed=false;
  for(let i=0;i<2;i++){
   try{
    if(topic==='fema'){
     const r=await load.fema({state,fromYear:year,offset:i*50},signal);
     rows.push(...r.candidates.map(c=>({source:'openfema' as const,id:c.id,recipient:c.recipient,state:c.state,kind:'grant' as const,title:c.program+' · '+c.awardNumber,amount:c.awardAmount,url:c.sourceUrl,period:'FY '+c.fiscalYear})));
     sourceRows+=r.sourceRows;withheld+=r.withheld+r.duplicates;more=r.nextOffset!==null||r.scopeCapped;
    }else{
     const r=await load.federal({state,fromYear:year,topic:topic as FederalTopic,page:i+1},signal);
     if(r.warnings){failed=true;break;}
     rows.push(...r.candidates.map(c=>({source:'usaspending' as const,id:c.id,recipient:c.recipient,state:c.state,kind:c.kind==='grant'?'grant' as const:'supplier' as const,title:c.description||c.awardNumber,amount:c.awardAmount,url:c.sourceUrl,period:[c.startDate,c.endDate].filter(Boolean).join(' to ')})));
     sourceRows+=r.sourceRows;withheld+=r.withheld+r.duplicates;more=r.nextPage!==null||r.scopeCapped;
    }
    pages++;if(!more)break;
   }catch{signal.throwIfAborted();failed=true;break;}
  }
  scopes.push({topic,status:!pages?'unavailable':failed||more||withheld?'partial':'retrieved',pages,sourceRows,withheld,rows});
 }
 signal.throwIfAborted();if(Date.now()-started>=300000)throw Error('Sample expired.');
 return {state,started,scopes};
}
export function reconcileResearch(snapshot:Snapshot,agencies:Agency[]){
 const grouped=new Map<string,Candidate>(),conflicts=new Set<string>();
 for(const s of snapshot.scopes)for(const c of s.rows){
  const key=c.source+':'+c.id,old=grouped.get(key);
  if(c.state!==snapshot.state){conflicts.add(key);continue;}
  if(old){
   const {url:_a,...a}=old,{url:_b,...b}=c;
   if(JSON.stringify(a)!==JSON.stringify(b))conflicts.add(key);
  }else grouped.set(key,c);
 }
 const candidates=[...grouped].filter(([k])=>!conflicts.has(k)).map(([,c])=>c);
 const matches=buildDiscoveryMatches(agencies,candidates.filter(c=>c.kind==='grant'));
 const lookup=new Map(matches.map(m=>[m.candidate.source+':'+m.candidate.id,m]));
 const rows=candidates.map(c=>{const m=lookup.get(c.source+':'+c.id);return {candidate:c,account:m?.account,status:c.kind==='supplier'?'supplier-not-buyer' as const:m?.status??'unmatched'};});
 return {rows,conflicts:conflicts.size};
}
