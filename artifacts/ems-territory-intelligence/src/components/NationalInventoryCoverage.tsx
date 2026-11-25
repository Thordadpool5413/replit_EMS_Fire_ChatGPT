import React,{useMemo,useState} from 'react';
import type {Agency} from '../types';
import {INTELLIGENCE_DEFINITIONS} from '../services/documentedIntelligence';
import {buildInventoryCoverage,INVENTORY_KINDS,INVENTORY_STATUS,type InventoryKind,type InventoryStatus} from '../services/nationalInventoryCoverage';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function NationalInventoryCoverage({agencies,state,onOpen}:{agencies:Agency[];state:string;onOpen?:(a:Agency)=>void}){
 const [kind,setKind]=useState<InventoryKind>('installed-monitor'),[filter,setFilter]=useState<InventoryStatus|'all'>('all'),[page,setPage]=useState(1);
 const data=useMemo(()=>buildInventoryCoverage(agencies,state),[agencies,state]);
 const rows=data.rows.filter(r=>r.kind===kind&&(filter==='all'||r.status===filter)),current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="research-workspace space-y-2 min-w-0" aria-label="Equipment research coverage">
 <h3 className="font-semibold">Equipment evidence research gaps</h3>
 <p className="text-xs">{data.eligible} eligible loaded source identities · {data.excluded} excluded rows. Local documents only, not statewide installed fleet coverage or independently approved shared evidence.</p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label>Equipment category<select className={control} value={kind} onChange={e=>{setKind(e.target.value as InventoryKind);setPage(1);}}>{INVENTORY_KINDS.map(k=><option key={k} value={k}>{INTELLIGENCE_DEFINITIONS[k].label}</option>)}</select></label>
 <label>Research status<select className={control} value={filter} onChange={e=>{setFilter(e.target.value as InventoryStatus|'all');setPage(1);}}><option value="all">All statuses</option>{Object.entries(INVENTORY_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
 <dl className="research-metric-grid">{Object.entries(data.counts[kind]).map(([k,n])=><div className="research-metric" key={k}><strong>{n}</strong><span>{INVENTORY_STATUS[k as InventoryStatus]}</span></div>)}</dl>
 {!rows.length&&<p>No eligible loaded accounts in this filter. Absence of documents is not evidence of no equipment.</p>}
 <ul className="divide-y">{rows.slice((current-1)*8,current*8).map(r=><li key={r.identityKey} className="py-2 space-y-1 min-w-0"><strong>{r.agency.name}</strong><p className="text-xs">{r.identityKey} · {INVENTORY_STATUS[r.status]}</p>
 {r.makers.length>0&&<p className="text-xs">Manufacturer text: {r.makers.join(', ')} · verify original inventory.</p>}
 {r.documents.length>0&&<details><summary className="min-h-11">Source observations ({r.documents.length})</summary><ul>{r.documents.map((d,i)=><li key={i} className="py-1 text-xs break-words"><p>{d.evidence.value} · {d.evidence.documentDate} · {d.reason}</p><a className="underline" href={d.evidence.sourceUrl} target="_blank" rel="noreferrer">Original document</a></li>)}</ul></details>}
 {onOpen&&<button className="workspace-button min-h-11" type="button" onClick={()=>onOpen(r.agency)}>Review provider</button>}</li>)}</ul>
 <div className="flex flex-wrap items-center gap-2"><button className="workspace-button" type="button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-xs">Page {current}</span><button className="workspace-button" type="button" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
 <p className="text-xs">No quantities, warranty dates, market share or equipment installation are inferred. Validate the original source before use.</p>
 </section>;
}
