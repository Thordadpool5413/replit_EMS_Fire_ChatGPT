import {EQUIPMENT_COVERAGE_STYLES,type Coverage} from './equipmentGeography';
/** Mutually exclusive agency categories, not units, installed base or market share. */
export function equipmentComposition(coverage?:Coverage){
 const total=coverage?.total??0;
 const items=(['zoll','competitor','mixed','unknown','notReported'] as const).map(key=>({
  key,color:EQUIPMENT_COVERAGE_STYLES[key].color,
  label:key==='zoll'?'ZOLL only':key==='competitor'?'Competitor only':key==='mixed'?'Both at same agency':EQUIPMENT_COVERAGE_STYLES[key].label,
  count:coverage?.[key]??0,
 }));
 let offset=0;
 const segments=items.map(item=>{const fraction=total>0?item.count/total:0;const result={...item,fraction,offset};offset+=fraction;return result;});
 return {total,segments,reported:coverage?.reported??0,recognized:(coverage?.zoll??0)+(coverage?.competitor??0)+(coverage?.mixed??0)};
}
/** Geography is neutral; recorded equipment is carried by a separate proportional bar. */
export const EQUIPMENT_STATE_BASE_COLOR='#D3DEE8';
