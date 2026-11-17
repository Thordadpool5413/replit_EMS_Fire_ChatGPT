import {EQUIPMENT_VENDORS,type EquipmentFamily} from '../utils/equipmentPresence';
import React from 'react';
import type {Coverage} from '../utils/equipmentGeography';
import {EQUIPMENT_COVERAGE_STYLES} from '../utils/equipmentGeography';
import {equipmentComposition,recordedVendorPenetration} from '../utils/equipmentComposition';
export function EquipmentRecordBar({coverage,x=0,y=0,width=26,height=5}:{coverage?:Coverage;x?:number;y?:number;width?:number;height?:number}){
 const {total,segments}=equipmentComposition(coverage);
 return <g data-testid="equipment-record-bar" pointerEvents="none" aria-hidden="true">
  <rect x={x} y={y} width={width} height={height} fill={EQUIPMENT_COVERAGE_STYLES.noRecords.color}/>
  {total>0&&segments.filter(s=>s.count>0).map(s=><rect key={s.key} data-equipment-category={s.key} x={x+s.offset*width} y={y} width={s.fraction*width} height={height} fill={s.color}/>)}
  {!total&&<path d={`M${x},${y+height}L${x+width},${y}`} stroke="#8D6E55" strokeWidth="0.8"/>}
  <rect x={x} y={y} width={width} height={height} rx="1" fill="none" stroke="#9A7658" strokeWidth="0.6"/>
 </g>;
}
export function EquipmentRecordSummary({coverage,family='all'}:{coverage?:Coverage;family?:EquipmentFamily}){
 const {total,segments,reported}=equipmentComposition(coverage);
 const penetration=recordedVendorPenetration(coverage,family);
 const vendorName=(id:string)=>EQUIPMENT_VENDORS.find(v=>v.id===id)?.name??id;
 return <section className="equipment-record-composition" aria-label="Recorded agency equipment mix">
  <strong>Recorded agency mix · {total.toLocaleString()} profiles</strong>
  <p>Equipment reported for {reported.toLocaleString()} of {total.toLocaleString()} loaded profiles. Statewide market share is not established.</p>
  {total>0&&<><svg viewBox="0 0 100 8" role="img" aria-label="Equipment mix among loaded agency profiles" style={{display:'block',width:'100%',height:16}}><EquipmentRecordBar coverage={coverage} width={100} height={8}/></svg>
   <dl>{segments.filter(s=>s.count>0).map(s=><div key={s.key}><dt><i style={{backgroundColor:s.color}} aria-hidden="true"/>{s.label}</dt><dd>{s.count.toLocaleString()} · {(s.fraction*100).toFixed(1)}% of profiles</dd></div>)}</dl></>}
  {!total&&<p>No eligible agency profiles assigned here. This does not establish the absence of agencies or equipment.</p>}
  <div className="equipment-penetration-summary" data-testid="state-vendor-penetration">
   <strong>{penetration.evidenceStatus==='no-equipment-evidence'?'Equipment evidence unavailable':'Partial equipment evidence'}</strong>
   {family==='all'?<p>Choose one product category for ZOLL versus competitor percentages.</p>:total>0?<>
    <p>ZOLL recorded: {penetration.zoll} / {total} profiles · {penetration.zollPercent?.toFixed(1)}%</p>
    {penetration.topCompetitor?<p>Leading recorded competitor: {vendorName(penetration.topCompetitor.id)} · {penetration.topCompetitor.count} / {total} profiles · {penetration.competitorPercent?.toFixed(1)}%{penetration.topCompetitor.tied.length>1?` · tied with ${penetration.topCompetitor.tied.slice(1).map(vendorName).join(', ')}`:''}</p>:<p>Leading competitor not established from these records.</p>}
    <p>Percentages use all loaded county-assigned profiles, including missing equipment. Mixed agencies may appear under both vendors; these percentages need not total 100%.</p>
   </>:<p>No percentage is available without eligible agency profiles.</p>}
   <p>Complete statewide equipment denominator: not established. Registry listings do not establish equipment ownership.</p>
  </div>
  <small>One directory ID counts once. Mixed agencies have their own segment. This is not unit share, agency census coverage, or geographic vendor territory.</small>
 </section>;
}
