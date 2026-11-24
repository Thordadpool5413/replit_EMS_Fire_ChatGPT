import React,{useEffect,useMemo,useState} from 'react';
import type {Agency,AgencySourceRecordAssociation} from '../types';
import {loadOhioRoster,ohioRegistryIdentity,type StateEmsRoster as Roster} from '../services/stateEmsRoster';
import {RegistryAccountReview} from './RegistryAccountReview';
export function StateEmsRoster({agencies,onOpen,onDecide,onCreate,city='',countySelected=false}:{agencies:Agency[];onOpen?:(a:Agency)=>void;onDecide?:(id:string,a:AgencySourceRecordAssociation)=>void;onCreate?:(a:Agency)=>void|Promise<void>;city?:string;countySelected?:boolean}){
 const [data,setData]=useState<Roster|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[query,setQuery]=useState(''),[page,setPage]=useState(1),[emsOnly,setEmsOnly]=useState(true);
 useEffect(()=>{let active=true;setError('');loadOhioRoster().then(r=>{if(active)setData(r)}).catch(e=>{if(active)setError(String(e.message??e))});return()=>{active=false}},[attempt]);
 const matches=useMemo(()=>(data?.records??[]).filter(r=>(!emsOnly||['EMR','EMT','AEMT','Paramedic'].includes(r.serviceLevel??''))&&(!city||r.city.toLowerCase()===city.toLowerCase())&&[r.identifier,r.name,r.city,r.serviceLevel].join(' ').toLowerCase().includes(query.toLowerCase().trim())),[data,query,city,emsOnly]);
 return <section className="space-y-3 min-w-0" aria-label="Ohio EMS agency roster">
 <h4 className="font-semibold">Ohio state agency directory</h4><p className="text-sm">Agency codes are not FDIDs or state license numbers. {countySelected?'County is not reported; showing state or selected-city listings. ':''}Service level is source-reported, not proof of current licensure.</p>
 {error?<p role="alert">{error} <button type="button" className="workspace-button" onClick={()=>setAttempt(x=>x+1)}>Retry</button></p>:!data?<p role="status">Loading Ohio roster…</p>:<>
 <p className="text-xs">Source update: {data.sourceDate??'not stated'} · retrieved {data.retrievedAt} · {data.records.length.toLocaleString()} state agency listings. <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="underline">Official source</a></p>
 <label className="block text-sm">Search Ohio agency codes<input aria-label="Search Ohio agency codes" className="block w-full min-w-0 border rounded p-2 bg-transparent text-base" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Agency, city or code"/></label>
 <label className="block text-sm"><input type="checkbox" checked={emsOnly} onChange={e=>{setEmsOnly(e.target.checked);setPage(1)}}/> Only listings with reported EMS service levels</label>
 <p role="status" className="text-sm">{matches.length.toLocaleString()} matching agency listings</p>
 <ul>{matches.slice((page-1)*8,page*8).map(r=><li className="py-3 border-b text-sm break-words" key={r.identifier}><strong>{r.name}</strong><p>Ohio agency code {r.identifier} · {r.city||'City not reported'}</p><p>EMS service level: {r.serviceLevel??'Not reported'}</p><RegistryAccountReview identity={ohioRegistryIdentity(data,r)} agencies={agencies} onOpen={onOpen} onDecide={onDecide} onCreate={onCreate}/></li>)}</ul>
 <div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={page===1} onClick={()=>setPage(x=>x-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(matches.length/8))}</span><button type="button" className="workspace-button" disabled={page*8>=matches.length} onClick={()=>setPage(x=>x+1)}>Next</button></div></>}
 </section>
}
