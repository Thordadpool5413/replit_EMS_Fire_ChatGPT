import React,{useState,useEffect,useMemo} from 'react';
import type {Agency,AgencySourceRecordAssociation} from '../types';
import {RegistryAccountReview} from './RegistryAccountReview';
import type {RegistryIdentity} from '../services/registryAccountLink';
type Department={nerisId:string;name:string;stateCode:string;city:string|null;headquartersAddress:string|null;exportDate:string|null};
type Roster={source:'NERIS';stateCode:string;fetchedAt:string;warning:string|null;departments:Department[]};
const publicSource='https://www.usfa.fema.gov/neris/public/';
export function NerisStateDirectory({state,city='',countySelected=false,agencies,onOpen,onDecide,onCreate}:{state:string;city?:string;countySelected?:boolean;agencies:Agency[];onOpen?:(a:Agency)=>void;onDecide?:(id:string,a:AgencySourceRecordAssociation)=>void;onCreate?:(a:Agency)=>void|Promise<void>}){
 const [roster,setRoster]=useState<Roster|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{setRoster(null);setError('');setPage(1);if(!/^[A-Z]{2}$/.test(state))return;const controller=new AbortController();setBusy(true);
 fetch('/api/fire-registry/directory?stateCode='+encodeURIComponent(state),{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('NERIS state directory unavailable.');const data=await response.json() as Roster;if(data.source!=='NERIS'||data.stateCode!==state||!Array.isArray(data.departments)||!data.departments.every(d=>d.stateCode===state&&typeof d.nerisId==='string'&&!!d.nerisId&&typeof d.name==='string'))throw Error('Invalid NERIS directory response.');if(!controller.signal.aborted)setRoster(data);}).catch(e=>{if(!controller.signal.aborted)setError(String(e.message??e));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();
 },[state,attempt]);
 const matches=useMemo(()=>(roster?.departments??[]).filter(d=>(!city||d.city?.toLowerCase()===city.toLowerCase())&&[d.nerisId,d.name,d.city,d.headquartersAddress].join(' ').toLowerCase().includes(query.trim().toLowerCase())),[roster,city,query]);
 return <div className="space-y-3 min-w-0">
 <p className="text-sm">Current public NERIS department source. {countySelected?'The selected county is not established by this feed; the results are state-wide unless a city filter is active. ':''}Listings are not a claim of active service, licensure or equipment.</p>
 <a href={publicSource} className="underline text-sm" target="_blank" rel="noreferrer">Official NERIS public data</a>
 {busy&&<p role="status">Loading public NERIS records…</p>}
 {error&&<p role="alert">{error} <button className="workspace-button" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}
 {roster&&<><p className="text-xs">Retrieved {roster.fetchedAt}. {matches.length.toLocaleString()} matching listings.</p>{roster.warning&&<p role="status">{roster.warning}</p>}
 <label className="block text-sm">Search NERIS<input className="block w-full min-w-0 rounded border p-2 bg-transparent text-base" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Name, city or NERIS ID"/></label>
 {!matches.length&&<p>No matching public records. This does not establish that no agencies operate here.</p>}
 <ul>{matches.slice((page-1)*8,page*8).map(d=><li className="border-b py-3 text-sm break-words" key={d.nerisId}><strong>{d.name}</strong><p>NERIS ID {d.nerisId}</p><p>{d.headquartersAddress||[d.city,d.stateCode].filter(Boolean).join(', ')} · County not established</p>{d.exportDate&&<p>Source date: {d.exportDate.slice(0,10)}</p>}<RegistryAccountReview key={d.nerisId} identity={{sourceName:'NERIS',identifier:d.nerisId,name:d.name,stateCode:d.stateCode,city:d.city??'',address:d.headquartersAddress??'',sourceUrl:publicSource,sourceDate:d.exportDate,retrievedAt:roster.fetchedAt}} agencies={agencies} onOpen={onOpen} onDecide={onDecide} onCreate={onCreate}/></li>)}</ul>
 <div className="flex flex-wrap items-center gap-2"><button className="workspace-button" disabled={page===1} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(matches.length/8))}</span><button className="workspace-button" disabled={page*8>=matches.length} onClick={()=>setPage(n=>n+1)}>Next</button></div></>}
 </div>;
}
