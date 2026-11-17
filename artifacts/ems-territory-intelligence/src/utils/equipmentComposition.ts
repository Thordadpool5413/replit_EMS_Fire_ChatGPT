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
export const EQUIPMENT_STATE_BASE_COLOR='#FFFEFA';

/** Shares of loaded profiles for one product family; overlapping vendors are intentional. */
export function recordedVendorPenetration(coverage:Coverage|undefined,family:string){
 const denominator=coverage?.total??0;
 const ranked=Object.entries(coverage?.vendorCounts??{}).filter(([id,count])=>id!=='zoll'&&count>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const leader=ranked[0];const zoll=coverage?.vendorCounts.zoll??0;
 return {denominator,zoll,topCompetitor:leader?{id:leader[0],count:leader[1],tied:ranked.filter(([,n])=>n===leader[1]).map(([id])=>id)}:null,
  zollPercent:family!=='all'&&denominator>0?zoll/denominator*100:null,
  competitorPercent:family!=='all'&&denominator>0&&leader?leader[1]/denominator*100:null,
  evidenceStatus:!coverage?.reported?'no-equipment-evidence':'partial-recorded-evidence',
  statewideMarketShareEstablished:false as const,
 };
}
