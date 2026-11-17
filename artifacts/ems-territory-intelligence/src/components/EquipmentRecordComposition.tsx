import React from 'react';
import type {Coverage} from '../utils/equipmentGeography';
import {EQUIPMENT_COVERAGE_STYLES} from '../utils/equipmentGeography';
import {equipmentComposition} from '../utils/equipmentComposition';
export function EquipmentRecordBar({coverage,x=0,y=0,width=26,height=5}:{coverage?:Coverage;x?:number;y?:number;width?:number;height?:number}){
 const {total,segments}=equipmentComposition(coverage);
 return <g data-testid="equipment-record-bar" pointerEvents="none" aria-hidden="true">
  <rect x={x} y={y} width={width} height={height} fill={EQUIPMENT_COVERAGE_STYLES.noRecords.color}/>
  {total>0&&segments.filter(s=>s.count>0).map(s=><rect key={s.key} data-equipment-category={s.key} x={x+s.offset*width} y={y} width={s.fraction*width} height={height} fill={s.color}/>)}
  {!total&&<path d={`M${x},${y+height}L${x+width},${y}`} stroke="#A5B5C5" strokeWidth="0.8"/>}
  <rect x={x} y={y} width={width} height={height} rx="1" fill="none" stroke="#183047" strokeWidth="0.6"/>
 </g>;
}
export function EquipmentRecordSummary({coverage}:{coverage?:Coverage}){
 const {total,segments,reported}=equipmentComposition(coverage);
 return <section className="equipment-record-composition" aria-label="Recorded agency equipment mix">
  <strong>Recorded agency mix · {total.toLocaleString()} profiles</strong>
  <p>Equipment reported for {reported.toLocaleString()} of {total.toLocaleString()} loaded profiles. Statewide market share is not established.</p>
  {total>0&&<><svg viewBox="0 0 100 8" role="img" aria-label="Equipment mix among loaded agency profiles" style={{display:'block',width:'100%',height:16}}><EquipmentRecordBar coverage={coverage} width={100} height={8}/></svg>
   <dl>{segments.filter(s=>s.count>0).map(s=><div key={s.key}><dt><i style={{backgroundColor:s.color}} aria-hidden="true"/>{s.label}</dt><dd>{s.count.toLocaleString()} · {(s.fraction*100).toFixed(1)}% of profiles</dd></div>)}</dl></>}
  {!total&&<p>No eligible agency profiles assigned here. This does not establish the absence of agencies or equipment.</p>}
  <small>One directory ID counts once. Mixed agencies have their own segment. This is not unit share, agency census coverage, or geographic vendor territory.</small>
 </section>;
}
