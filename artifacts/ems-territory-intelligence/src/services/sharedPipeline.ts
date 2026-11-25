import {useEffect,useState} from 'react';
import type {Agency} from '../types';
import {dealScope,readDeal,type DealInput,type DealRecord} from './workingPipeline';
import type {DeviceRead} from './leadershipReview';
export type SharedRead=DeviceRead&{binding?:string;canWrite?:boolean};
async function request(agencyId:string,identityKey:string,init?:RequestInit,fetcher:typeof fetch=fetch):Promise<SharedRead>{
 const response=await fetcher('/api/agencies/'+encodeURIComponent(agencyId)+'/working-pipeline',{...init,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'}});
 if(!response.ok){const e=await response.json().catch(()=>({}));throw Error(typeof e.error==='string'?e.error:typeof e.error?.message==='string'?e.error.message:'Shared pipeline unavailable.');}
 const p=await response.json();
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid shared record response.');
 if(p.identityKey!==identityKey||typeof p.binding!=='string'||!/^[a-f0-9]{64}$/.test(p.binding)||typeof p.canWrite!=='boolean')throw Error('Account identity mismatch.');
 const record=p.record===null?undefined:readDeal(p.record,agencyId,identityKey);
 if(p.record!==null&&!record)throw Error('Invalid shared record.');
 return {agencyId,identityKey,status:'read',binding:p.binding,canWrite:p.canWrite,record};
}
export function readSharedDeal(agencyId:string,identityKey:string,fetcher:typeof fetch=fetch){return request(agencyId,identityKey,undefined,fetcher);}
export async function saveSharedDeal(read:SharedRead,input:DealInput,expectedRevision:number,confirmed:boolean,fetcher:typeof fetch=fetch):Promise<DealRecord>{
 if(read.status!=='read'||!read.canWrite||!read.binding||!confirmed||(read.record?.revision??0)!==expectedRevision)throw Error('Current editable shared record and explicit confirmation required.');
 const saved=await request(read.agencyId,read.identityKey,{method:'PUT',body:JSON.stringify({identityKey:read.identityKey,binding:read.binding,input,expectedRevision,confirmed})},fetcher);
 if(saved.binding!==read.binding||!saved.canWrite||!saved.record||saved.record.revision!==expectedRevision+1)throw Error('Save not confirmed. Reload before retrying.');
 return saved.record;
}
export function useSharedPipeline(uid:string,agencies:Agency[],selected:string[],started:number){
 const scope=dealScope(agencies,selected,started),key=JSON.stringify([uid,started,scope.map(a=>[a.agency.id,a.identityKey]).sort()]);
 const [generation,setGeneration]=useState(0),[result,setResult]=useState<{key:string;generation:number;rows:SharedRead[]}>();
 useEffect(()=>{
  let active=true;
  if(!uid)return;
  void Promise.all(scope.map(async a=>{
   try{return await readSharedDeal(a.agency.id,a.identityKey);}catch{return {agencyId:a.agency.id,identityKey:a.identityKey,status:'unavailable' as const};}
  })).then(rows=>{if(active)setResult({key,generation,rows});});
  return()=>{active=false;};
 },[key,generation]);
 const current=result?.key===key&&result.generation===generation?result:undefined;
 return {reads:current?.rows??[],loading:!current,reload:()=>setGeneration(n=>n+1)};
}
