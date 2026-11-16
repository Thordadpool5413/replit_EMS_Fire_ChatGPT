import React,{useId,useState} from 'react';
import {HeartPulse} from 'lucide-react';
import {DEFAULT_EQUIPMENT_FILTER,parseEquipmentFilter,type EquipmentMapFilter as Filter} from '../utils/equipmentPresence';
const KEY='ems-map-equipment-filter-v1';
export function useEquipmentMapFilter():[Filter,(value:Filter)=>void] {
 const [value,setValue]=useState<Filter>(()=>{try{return parseEquipmentFilter(JSON.parse(sessionStorage.getItem(KEY)||'null'));}catch{return DEFAULT_EQUIPMENT_FILTER;}});
 const update=(next:Filter)=>{setValue(next);try{sessionStorage.setItem(KEY,JSON.stringify(next));}catch{/* Filter remains usable without session storage. */}};
 return [value,update];
}
export function EquipmentMapFilter({value,onChange}:{value:Filter;onChange:(value:Filter)=>void}) {
 const id=useId();
 return <div className="equipment-map-filter"><label htmlFor={`${id}-presence`}><span><HeartPulse size={15} aria-hidden="true"/>Recorded equipment</span><select id={`${id}-presence`} value={value.presence} onChange={e=>onChange({...value,presence:e.target.value as Filter['presence']})}><option value="all">All agencies</option><option value="zoll">ZOLL recorded (includes mixed)</option><option value="competitor">Competitor recorded (includes mixed)</option><option value="mixed">ZOLL + competitor recorded</option><option value="unknown">Unknown / no recognized vendor</option></select></label><label htmlFor={`${id}-family`}><span>Product category</span><select id={`${id}-family`} value={value.family} onChange={e=>onChange({...value,family:e.target.value as Filter['family']})}><option value="all">All product categories</option><option value="monitors">Monitors / defibrillators</option><option value="cpr">Mechanical CPR</option><option value="ventilators">Transport ventilators</option><option value="software">ePCR, CAD & billing</option></select></label><p>Based on recorded installed products, not sales targets. Mixed agencies can appear in both vendor views. Unknown does not mean competitor. Confirm current use with the agency.</p>{value.presence!=='all'&&<button type="button" className="workspace-text-button" onClick={()=>onChange(DEFAULT_EQUIPMENT_FILTER)}>Clear equipment filter</button>}</div>;
}
