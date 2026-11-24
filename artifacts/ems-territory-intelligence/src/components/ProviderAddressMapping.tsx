import React,{useEffect,useRef,useState} from 'react';
import type {Agency} from '../types';
import {canResearchProviderLocation,mappedProviderLocation,researchProviderLocation,useLocationRevision} from '../services/providerLocation';
export function ProviderAddressMapping({agencies,scope,state}:{agencies:Agency[];scope:Agency[];state:string}){
 useLocationRevision();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[offset,setOffset]=useState(0);
 const request=useRef<AbortController|undefined>(undefined);
 useEffect(()=>{request.current?.abort();setBusy(false);setMessage('');setOffset(0);return()=>request.current?.abort();},[state,scope]);
 // Bound the scope before any expensive identity resolution or external requests.
 const bounded=scope.slice(offset,offset+20);
 const eligible=state==='all'?[]:bounded.filter(a=>canResearchProviderLocation(a,agencies)&&!mappedProviderLocation(a,agencies));
 async function run(){
  const c=new AbortController();request.current=c;setBusy(true);setMessage('');let placed=0,unmatched=0,failed=0;
  for(const a of eligible){
   if(c.signal.aborted)break;
   try{await researchProviderLocation(a,agencies,c.signal,true);if(mappedProviderLocation(a,agencies))placed++;else unmatched++;}catch{failed++;}
  }
  if(!c.signal.aborted){setBusy(false);setMessage(placed+' approximate street locations mapped · '+unmatched+' no unique street match · '+failed+' unavailable. No saved account was changed.');}
 }
 return <section className="pi-surface p-3 min-w-0 space-y-2" aria-label="Provider address mapping">
  <h2 className="font-semibold text-sm">Provider street locations</h2><p className="text-xs">Select a state to resolve addresses from linked public records, 20 loaded account rows at a time. Census street-range matches are approximate; they are not verified stations. Unmatched addresses receive no new pin.</p>
  {state!=='all'&&<><p className="text-xs">Rows {scope.length?offset+1:0}–{Math.min(offset+20,scope.length)} of {scope.length} · {eligible.length} eligible for lookup in this batch.</p><div className="flex flex-wrap gap-2"><button className="workspace-button" type="button" disabled={busy||!eligible.length} onClick={()=>void run()}>{busy?'Resolving addresses…':'Map this batch'}</button><button className="workspace-button" type="button" disabled={busy||offset===0} onClick={()=>{setOffset(o=>Math.max(0,o-20));setMessage('');}}>Previous</button><button className="workspace-button" type="button" disabled={busy||offset+20>=scope.length} onClick={()=>{setOffset(o=>o+20);setMessage('');}}>Next</button></div></>}
  {message&&<p role="status" className="text-xs">{message}</p>}
 </section>;
}
