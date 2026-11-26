import React,{useEffect,useState} from 'react';
import type {Agency} from '../../types';
import {loadLegacyStationParent,loadLegacyStationState,legacyProfileKey,type LegacyParent} from '../../services/usfaStationCatalog';
import {nerisObjectUrl} from '../../services/nerisStationCatalog';
function LegacyRecords({parent:p}:{parent:LegacyParent}){
 const [page,setPage]=useState(0);
 return <div className="space-y-2 text-sm break-words"><p className="font-semibold">{p.name} · {p.key}</p><p>{p.stations.length} historical station address rows. Source edition not reported; retrieved November 25, 2026 Eastern time.</p>
 <a className="underline" href="https://apps.usfa.fema.gov/registry/download" target="_blank" rel="noreferrer">USFA original directory</a>
 {!!p.nerisParentCandidates.length&&<div><p className="font-medium">Possible NERIS parent comparisons (exact name, city, state and ZIP)</p>{p.nerisParentCandidates.map(d=><p key={d.id}><a className="underline" href={nerisObjectUrl(0,d.oid)} target="_blank" rel="noreferrer">{d.name} · {d.id}</a></p>)}<p className="text-xs">Comparison only; not a confirmed department association.</p></div>}
 <ul className="divide-y">{p.stations.slice(page*8,page*8+8).map(s=><li key={s.sourceKey} className="py-2 space-y-1"><strong>{s.name||'Unnamed historical listing'}</strong><p>{s.address.filter(Boolean).join(', ')||'Address not reported'}</p>{s.address[3]!==p.state&&<p>Cross-state address.</p>}{s.duplicateSourceFields&&<p>Duplicate source fields; not counted as a unique station.</p>}
 {s.physicalAddressCandidate&&<a className="underline" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.address.filter(Boolean).join(', '))} target="_blank" rel="noreferrer">Search reported address in Maps</a>}
 {!!s.nerisAddressCandidates.length&&<div><p className="font-medium">NERIS records with matching full street, city, state and ZIP</p>{s.nerisAddressCandidates.map(n=><p key={n.id}><a className="underline" href={nerisObjectUrl(1,n.oid)} target="_blank" rel="noreferrer">{n.name||n.id} · {n.parentName}</a>{n.parentNameCityZipCorroborated?' · Parent comparison also matches':''}</p>)}<p className="text-xs">Address overlap is not proof of identical facilities.</p></div>}
 </li>)}</ul>
 {p.stations.length>8&&<div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={!page} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} of {Math.ceil(p.stations.length/8)}</span><button type="button" className="workspace-button" disabled={(page+1)*8>=p.stations.length} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
 <p className="text-xs">Historical voluntary source, no native station ID. Do not treat as a verified operating station, merge identities or overwrite saved locations. End-user validation required.</p></div>;
}
export function UsfaLegacyStations({parentKey}:{parentKey:string}){
 const [open,setOpen]=useState(false),[data,setData]=useState<LegacyParent|null>(null),[status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle'),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!open)return;let active=true;setData(null);setStatus('loading');loadLegacyStationParent(parentKey).then(p=>{if(active){setData(p);setStatus('ready')}}).catch(()=>{if(active)setStatus('error')});return()=>{active=false}},[parentKey,open,attempt]);
 return <details className="min-w-0 border rounded p-3 text-sm" onToggle={e=>setOpen(e.currentTarget.open)} data-testid="usfa-historical-stations"><summary className="cursor-pointer font-semibold">USFA historical station addresses</summary>{status==='loading'&&<p role="status">Loading historical evidence…</p>}{status==='error'&&<p role="alert">Historical evidence unavailable. <button type="button" className="underline" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}{status==='ready'&&!data&&<p>No station address rows reported for this FDID.</p>}{data?.key===parentKey&&<LegacyRecords key={parentKey} parent={data}/>}</details>;
}
export function UsfaProfileStations({agency,directory}:{agency:Agency;directory:Agency[]}){
 const key=legacyProfileKey(agency,directory);return key?<UsfaLegacyStations key={key} parentKey={key}/>:null;
}
export function UsfaNerisParentComparisons({id,state}:{id:string;state:string}){
 const [open,setOpen]=useState(false),[data,setData]=useState<LegacyParent[]|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!open)return;let active=true;setFailed(false);setData(null);loadLegacyStationState(state).then(rows=>{if(active)setData(rows.filter(p=>p.nerisParentCandidates.some(d=>d.id===id)));}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[open,state,id,attempt]);
 return <details className="min-w-0 border rounded p-2 text-sm" onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer font-medium">Compare historical USFA department listings</summary>
 {open&&failed&&<p role="alert">Historical comparison unavailable. <button type="button" className="underline" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}
 {open&&!failed&&!data&&<p role="status">Loading comparison records…</p>}
 {data&&<><p className="text-xs">Exact name, city, state and ZIP comparison only; not a confirmed FDID relationship.</p>{!data.length&&<p>No exact historical parent comparison found.</p>}{data.map(p=><UsfaLegacyStations key={p.key} parentKey={p.key}/>)}</>}
 </details>;
}
