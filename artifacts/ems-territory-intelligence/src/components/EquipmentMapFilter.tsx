import {useIsMobile} from '../hooks/use-mobile';
import type {Agency} from '../types';
import React,{useId,useState,useMemo,useEffect} from 'react';
import {HeartPulse,ChevronDown} from 'lucide-react';
import {DEFAULT_EQUIPMENT_FILTER,parseEquipmentFilter,EQUIPMENT_VENDORS,getRecordedEquipmentEntries,getRecordedVendorMatches,matchesEquipmentFilter,type EquipmentMapFilter as Filter} from '../utils/equipmentPresence';
import {EQUIPMENT_COVERAGE_STYLES} from '../utils/equipmentGeography';
const KEY='ems-map-equipment-filter-v1';
export function useEquipmentMapFilter():[Filter,(value:Filter)=>void] {
 const [value,setValue]=useState<Filter>(()=>{try{return parseEquipmentFilter(JSON.parse(sessionStorage.getItem(KEY)||'null'));}catch{return DEFAULT_EQUIPMENT_FILTER;}});
 useEffect(()=>{
  const receive=(event:Event)=>setValue(parseEquipmentFilter((event as CustomEvent).detail));
  window.addEventListener('ems-equipment-filter-changed',receive);
  return ()=>window.removeEventListener('ems-equipment-filter-changed',receive);
 },[]);
 const update=(next:Filter)=>{setValue(next);try{sessionStorage.setItem(KEY,JSON.stringify(next));}catch{/* Filter remains usable without session storage. */}window.dispatchEvent(new CustomEvent('ems-equipment-filter-changed',{detail:next}));};
 return [value,update];
}
export function EquipmentCoverageLegend({note,className='',mode='area'}:{note?:string;className?:string;mode?:'area'|'composition'}) {
 const items=mode==='composition'?(['zoll','competitor','mixed','unknown','notReported'] as const).map(key=>({...EQUIPMENT_COVERAGE_STYLES[key],label:key==='zoll'?'ZOLL only':key==='competitor'?'Competitor only':key==='mixed'?'Both at same agency':EQUIPMENT_COVERAGE_STYLES[key].label})):Object.values(EQUIPMENT_COVERAGE_STYLES);
 return <section className={`equipment-coverage-legend ${className}`.trim()} aria-label="Recorded equipment map legend" data-testid="equipment-coverage-legend">
  <strong>{mode==='composition'?'Recorded agency mix · state bars':'Recorded equipment by county/state'}</strong>
   {mode==='composition'&&<p>State shapes are neutral geography. Bars show proportions in loaded profiles, not statewide market share or a complete equipment census. Dark crossed bars mean no eligible profiles.</p>}
  <div className="equipment-coverage-legend-items">
   {items.map((item)=><span key={item.label}><i style={{backgroundColor:item.color}} aria-hidden="true"/>{item.label}</span>)}
  </div>
   <p>{note||(mode==='composition'?'Each bar counts one loaded agency profile once. Mixed agencies are a separate category.':'Colors summarize recorded directory entries by county or state. An agency may record multiple vendors; this is not a complete equipment census.')}</p>
 </section>;
}
export function EquipmentMapFilter({value,onChange,agencies=[],onOpen,scopeLabel='loaded records before geographic, search, location, and score filters'}:{value:Filter;onChange:(value:Filter)=>void;agencies?:Agency[];scopeLabel?:string;onOpen?:(agency:Agency)=>void}) {
 const id=useId();
 const phone=useIsMobile();
 const catalog=useMemo(()=>agencies.map(agency=>({agency,matches:getRecordedVendorMatches(agency,value.family),entries:getRecordedEquipmentEntries(agency,value.family)})),[agencies,value.family]);
 const counts=useMemo(()=>{const result:Record<string,number>={};for(const row of catalog)for(const vendor of new Set(row.matches.map(m=>m.vendor)))result[vendor]=(result[vendor]||0)+1;return result;},[catalog]);
 const filtered=useMemo(()=>catalog.filter(row=>matchesEquipmentFilter(row.agency,value)),[catalog,value]);
 const vendorMode=value.presence==='competitor'||value.presence==='mixed';
  const controls = <div className="equipment-map-filter"><label className="equipment-filter-field equipment-filter-field--presence" htmlFor={`${id}-presence`}><span><HeartPulse size={15} aria-hidden="true"/>Recorded equipment</span><select className="equipment-filter-select equipment-filter-select--presence" id={`${id}-presence`} value={value.presence} onChange={e=>onChange({...value,presence:e.target.value as Filter['presence'],vendor:undefined})}><option value="all">All agencies</option><option value="zoll">ZOLL recorded (includes mixed)</option><option value="competitor">Competitor recorded (includes mixed)</option><option value="mixed">ZOLL + competitor recorded</option><option value="unknown">Unknown / no recognized vendor</option></select></label><label className="equipment-filter-field equipment-filter-field--family" htmlFor={`${id}-family`}><span>Product category</span><select className="equipment-filter-select equipment-filter-select--family" id={`${id}-family`} value={value.family} onChange={e=>onChange({...value,family:e.target.value as Filter['family']})}><option value="all">All product categories</option><option value="monitors">Monitors / defibrillators</option><option value="cpr">Mechanical CPR</option><option value="ventilators">Transport ventilators</option><option value="software">ePCR, CAD & billing</option></select></label>{vendorMode&&<label className="equipment-filter-field equipment-filter-field--vendor" htmlFor={`${id}-vendor`}><span>Competitor name</span><select className="equipment-filter-select equipment-filter-select--vendor" id={`${id}-vendor`} value={value.vendor||'all'} onChange={e=>onChange({...value,vendor:e.target.value==='all'?undefined:e.target.value})}><option value="all">All named competitors</option>{EQUIPMENT_VENDORS.filter(v=>v.id!=='zoll').map(v=><option key={v.id} value={v.id}>{v.name} ({counts[v.id]||0})</option>)}</select></label>}<p>Recorded installed products. Mixed agencies can appear in both vendor views.</p><details className="equipment-match-details"><summary>Vendor breakdown &amp; recorded equipment · {filtered.length.toLocaleString()} agency records</summary><p>Counts cover {scopeLabel}; counts are not market share.</p><div className="equipment-vendor-breakdown">{EQUIPMENT_VENDORS.filter(v=>(counts[v.id]||0)>0).map(v=><button key={v.id} type="button" onClick={()=>onChange({...value,presence:v.id==='zoll'?'zoll':'competitor',vendor:v.id==='zoll'?undefined:v.id})}>{v.name}<strong>{counts[v.id]}</strong></button>)}</div>{!filtered.length&&<p>No loaded records match this vendor and product category. Clear the filter, change category, or review missing equipment in agency profiles.</p>}<ul>{filtered.slice(0,12).map(({agency,matches,entries})=><li key={agency.id}><strong>{onOpen?<button type="button" onClick={()=>onOpen(agency)}>{agency.name}</button>:agency.name}</strong><span>{agency.city}, {agency.stateCode}</span>{matches.length?matches.filter(m=>!value.vendor||m.vendor===value.vendor).map((m,i)=><p key={`${m.vendor}-${i}`}><b>{m.name}</b> · {m.product}</p>):entries.length?entries.map((entry,i)=><p key={`${entry.family}-${i}`}><b>{entry.label} entry:</b> {entry.value}</p>):<p>No equipment entry is recorded for the selected product category.</p>}</li>)}</ul>{filtered.length>12&&<p>Showing 12 of {filtered.length.toLocaleString()} agency records. Use the map’s geographic controls to narrow the plotted agencies.</p>}</details>{value.presence!=='all'&&<button type="button" className="workspace-text-button" onClick={()=>onChange(DEFAULT_EQUIPMENT_FILTER)}>Clear equipment filter</button>}</div>;
 const presenceLabel={all:'All agencies',zoll:'ZOLL recorded',competitor:'Competitor recorded',mixed:'Both recorded',unknown:'Unknown vendor'}[value.presence];
 const familyLabel={all:'All products',monitors:'Monitors',cpr:'Mechanical CPR',ventilators:'Ventilators',software:'Software'}[value.family];
 return phone ? <details className="equipment-filter-disclosure">
  <summary><HeartPulse size={17} aria-hidden="true"/><span><strong>Equipment filters</strong><small>{presenceLabel} · {familyLabel}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
  {controls}
 </details> : controls;

}
