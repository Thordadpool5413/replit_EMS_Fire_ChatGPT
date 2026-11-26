import React,{useEffect,useState} from 'react';
import type {Agency} from '../../types';
import {UsfaNerisParentComparisons} from './UsfaLegacyStations';
import {loadNerisDepartment,nerisAddressText,nerisCatalogDate,nerisObjectUrl,profileNerisId,type NerisCatalogDepartment} from '../../services/nerisStationCatalog';
export function NerisDepartmentStations({id}:{id:string}){
 const [opened,setOpened]=useState(false),[data,setData]=useState<NerisCatalogDepartment|null>(null),[status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle'),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0);
 useEffect(()=>{if(!opened)return;let active=true;setStatus('loading');setPage(0);setData(null);loadNerisDepartment(id).then(d=>{if(active){setData(d);setStatus('ready')}}).catch(()=>{if(active)setStatus('error')});return()=>{active=false}},[id,opened,attempt]);
 const d=data?.id===id?data:null;
 return <details className="min-w-0 border rounded p-3 text-sm" onToggle={e=>setOpened(e.currentTarget.open)} data-testid="neris-station-catalog"><summary className="cursor-pointer font-semibold">Federal NERIS station directory</summary>
 <p className="my-2 text-xs">Retained national API snapshot, {nerisCatalogDate.slice(0,10)} UTC. Native department and station IDs; source-reported locations. End-user validation required.</p>
 {status==='loading'&&<p role="status">Loading individual stations…</p>}
 {status==='error'&&<p role="alert">Retained source unavailable. <button type="button" className="underline" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}
 {status==='ready'&&!d&&<p>No matching native department in this snapshot.</p>}
 {d&&<><p className="font-semibold break-words">{d.name} · {d.id}</p><p className="break-words">Reported headquarters: {nerisAddressText(d.address)||'Not reported'}</p>
 <p>{d.stations.length} station source records · reported department station count {d.reportedStationCount??'not reported'}.</p><a className="underline text-xs" href={nerisObjectUrl(0,d.oid)} target="_blank" rel="noreferrer">Original department GIS record</a>
 <UsfaNerisParentComparisons key={d.id} id={d.id} state={d.state}/>
 {!d.stations.length&&<p>No station records returned; does not imply zero facilities.</p>}
 <ul className="divide-y">{d.stations.slice(page*8,page*8+8).map(s=><li key={s.id} className="py-2 space-y-1 break-words"><strong>{s.name||'Unnamed station source record'}</strong><p>Station ID {s.id} · Parent {s.parentId}</p><p>Reported address: {nerisAddressText(s.address)||'Not reported'}</p>
 {s.address[3]!==d.state&&<p>Cross-state station address.</p>}
 {s.parentNameConflict&&<p>Parent name discrepancy; validate relationship.</p>}
 {s.coordinates?<><p>Source coordinates: {s.coordinates[0].toFixed(5)}, {s.coordinates[1].toFixed(5)}{s.sharedPoint?' · Shared source point':''}</p><a className="underline" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.coordinates.join(','))}>Open source location map</a></>:<p>Coordinates not supplied.</p>}
 <p><a className="underline text-xs" href={nerisObjectUrl(1,s.oid)} target="_blank" rel="noreferrer">Original station GIS record</a></p></li>)}</ul>
 {d.stations.length>8&&<div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={!page} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} of {Math.ceil(d.stations.length/8)}</span><button type="button" className="workspace-button" disabled={(page+1)*8>=d.stations.length} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
 <p className="text-xs">Addresses and points are government-source claims, not confirmed operating locations. No saved account address or station assignment is changed.</p></>}
 </details>;
}
export function NerisProfileStations({agency,directory}:{agency:Agency;directory:Agency[]}){
 const id=profileNerisId(agency,directory);return id?<NerisDepartmentStations key={id} id={id}/>:null;
}
