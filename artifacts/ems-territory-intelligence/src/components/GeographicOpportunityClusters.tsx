import React,{useEffect,useMemo,useState} from 'react';
import {APIProvider,Map,AdvancedMarker,useMap} from '@vis.gl/react-google-maps';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildGeographicResearch,DISTANCES,type Distance,type LocatedAccount} from '../services/geographicResearch';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision,loadProviderLocationState} from '../services/providerLocation';
import {stationMapBounds} from '../services/departmentFacilities';
import {OPPORTUNITY_LABELS,type OpportunityKind} from '../services/opportunityRadar';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
const COLORS=['#2563eb','#059669','#9333ea','#c2410c','#0e7490','#be185d','#475569','#854d0e'];
function Fit({points}:{points:LocatedAccount[]}){
 const map=useMap();
 useEffect(()=>{if(!map||!points.length)return;if(points.length===1){map.setCenter(points[0].point);map.setZoom(12);return;}const bounds=stationMapBounds(points.map(p=>p.point));if(bounds)map.fitBounds(bounds,32);},[map,points]);
 return null;
}
export function GeographicOpportunityClusters({agencies,selected,samples,onOpenAgency}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];onOpenAgency:(a:Agency)=>void}){
 const revision=useLocationRevision();
 const [open,setOpen]=useState(false),[radius,setRadius]=useState<Distance>(25),[kind,setKind]=useState<OpportunityKind|'all'>('all'),[mapOpen,setMapOpen]=useState(false),[active,setActive]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const result=useMemo(()=>buildGeographicResearch(agencies,selected,samples,resolve,radius,Date.now(),kind),[agencies,selected,samples,radius,kind,revision]);
 const key=(import.meta as unknown as {env?:Record<string,string>}).env?.VITE_GOOGLE_MAPS_API_KEY||(()=>{try{return localStorage.getItem('gmp_api_key')||'';}catch{return '';}})();
 const chosen=result.located.find(a=>a.identityKey===active);
 async function load(){
  setBusy(true);setNotice('');
  try{
   const states=[...new Set(agencies.filter(a=>selected.includes(a.id)).map(a=>a.stateCode))];
   const results=await Promise.allSettled(states.map(loadProviderLocationState));
   setNotice(results.every(r=>r.status==='fulfilled'&&!!r.value)?'Bundled location snapshots loaded. Missing or conflicting matches remain excluded.':'Some location snapshots unavailable. Results may be incomplete.');
  }catch{setNotice('Location snapshots unavailable.');}finally{setBusy(false);}
 }
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="Geographic opportunity research">
  <button type="button" className="workspace-button min-h-11" aria-expanded={open} onClick={()=>{setOpen(!open);if(open){setMapOpen(false);setActive('');}}}>{open?'Hide geographic research':'Open geographic opportunity clusters'}</button>
  {open&&<div className="space-y-3 text-sm">
   <p>Group only selected accounts with eligible reviewed signals and accepted source-matched physical addresses. Clusters are straight-line proximity, not driving routes, active stations, customer appointments or predicted sales.</p>
   <button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>void load()}>{busy?'Loading location snapshots…':'Load source location snapshots'}</button>
   {notice&&<p role="status">{notice}</p>}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label>Maximum group diameter<select className={control} value={radius} onChange={e=>setRadius(Number(e.target.value) as Distance)}>{DISTANCES.map(d=><option key={d} value={d}>{d} miles</option>)}</select></label><label>Reviewed signal type<select className={control} value={kind} onChange={e=>setKind(e.target.value as OpportunityKind|'all')}><option value="all">All eligible signals</option>{Object.entries(OPPORTUNITY_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
   <p>{result.located.length}/{result.selected} selected accounts with eligible mapped signals · {result.clusters.filter(c=>c.accounts.length>1).length} multi-account groups · {result.unmapped.length} location gaps · {result.checked} complete document samples.</p>
   {result.located.length>0&&<button type="button" className="workspace-button min-h-11" aria-expanded={mapOpen} onClick={()=>setMapOpen(!mapOpen)}>{mapOpen?'Hide map':'View source-matched map'}</button>}
   {mapOpen&&result.located.length>0&&(key?<div className="h-64 w-full rounded border overflow-hidden"><APIProvider apiKey={key} libraries={['marker']}><Map mapId="DEMO_MAP_ID" defaultCenter={result.located[0].point} defaultZoom={8} gestureHandling="cooperative"><Fit points={result.located}/>{result.clusters.flatMap((g,i)=>g.accounts.map(a=><AdvancedMarker key={a.identityKey} position={a.point} title={a.agency.name} onClick={()=>setActive(a.identityKey)}><span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white text-xs font-bold shadow" style={{background:COLORS[i%COLORS.length]}}>{i+1}</span></AdvancedMarker>))}</Map></APIProvider></div>:<p>Google Maps is not configured. The account list remains available.</p>)}
   {mapOpen&&chosen&&<div className="border rounded p-2 break-words"><p className="font-semibold">{chosen.agency.name}</p><p>{chosen.address}</p><p>{chosen.matchLabel}</p><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(chosen.agency)}>Open provider profile</button></div>}
   {result.clusters.map((g,i)=><section className="border rounded p-2 space-y-1" key={g.key}><h4 className="font-semibold">Group {i+1} · {g.accounts.length} account(s)</h4><p className="text-xs">Maximum separation {g.diameterMiles.toFixed(1)} miles, straight-line.</p><ul className="divide-y">{g.accounts.map(a=><li key={a.identityKey} className="py-2 space-y-1 break-words"><p className="font-semibold">{a.agency.name}</p><p>{a.address}</p><p className="text-xs">{a.matchLabel} · end-user validation required</p><p>{[...new Set(a.signals.map(s=>OPPORTUNITY_LABELS[s.signal.kind]))].join(' · ')}</p><a className="underline" href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Location source</a><div><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open provider profile</button></div></li>)}</ul></section>)}
   {result.unmapped.length>0&&<details><summary>Eligible accounts without accepted locations ({result.unmapped.length})</summary>{result.unmapped.map(r=><p key={r.agency.id} className="py-1 break-words">{r.agency.name} · {r.reason} <button type="button" className="underline min-h-11" onClick={()=>onOpenAgency(r.agency)}>Review location</button></p>)}</details>}
   {result.excluded.length>0&&<details><summary>Excluded accounts ({result.excluded.length})</summary>{result.excluded.map(r=><p key={r.agency.id} className="py-1">{r.agency.name} · {r.reason}</p>)}</details>}
   {result.gaps.length>0&&<details><summary>Unranked or unchecked accounts ({result.gaps.length})</summary>{result.gaps.map(r=><p key={r.id} className="py-1">{r.name} · {r.status}</p>)}</details>}
   <p className="text-xs">No county-centroid fallback, no inferred station location, no navigation or automatic itinerary. Selected sample only; not a territory heatmap or market share. Validate addresses and contact permission before visiting.</p>
  </div>}
 </section>;
}
