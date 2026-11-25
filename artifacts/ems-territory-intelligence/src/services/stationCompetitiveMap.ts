import type {Facility} from './departmentFacilities';
export type StationEvidence={stationId:string;family:string;maker:string;observedOn:string};
export type StationSample={agencyId:string;parentId:string;facilities:Facility[];observations:StationEvidence[];withheldEvidence:number;checkedAt:string;sourceRetrievedAt:string};
export type StationPresence='zoll'|'competitor'|'mixed'|'unknown';
export const STATION_STYLES={zoll:{color:'#087F75',glyph:'Z',label:'Reviewed ZOLL'},competitor:{color:'#B45309',glyph:'C',label:'Reviewed other named maker'},mixed:{color:'#7950B3',glyph:'M',label:'Both observed'},unknown:{color:'#64748B',glyph:'?',label:'No qualifying named maker'}} satisfies Record<StationPresence,{color:string;glyph:string;label:string}>;
const named=new Set(['stryker','philips','hamilton','weinmann','draeger','medtronic','mindray','schiller','nihon-kohden','eso','imagetrend']);
export function classifyStationSample(samples:StationSample[],family:string,days:number,today:string){
 const seen=new Map<string,number>();
 for(const s of samples)for(const f of s.facilities)if(f.sourceRecordId)seen.set(f.sourceRecordId,(seen.get(f.sourceRecordId)??0)+1);
 const cutoff=new Date(Date.parse(today+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
 const rows=samples.flatMap(s=>s.facilities.flatMap(f=>{
  const id=f.sourceRecordId;if(f.source!=='NERIS'||!id||seen.get(id)!==1)return [];
  const observations=s.observations.filter(o=>o.stationId===id&&(family==='all'||o.family===family)&&o.observedOn<=today);
  const recent=observations.filter(o=>o.observedOn>=cutoff);
  const z=recent.some(o=>o.maker==='zoll'),c=recent.some(o=>named.has(o.maker));
  const presence:StationPresence=z&&c?'mixed':z?'zoll':c?'competitor':'unknown';
  return [{agencyId:s.agencyId,parentId:s.parentId,facility:f,presence,observations:recent.length,older:observations.length-recent.length,latest:recent.reduce<string>((date,o)=>o.observedOn>date?o.observedOn:date,'')}];
 }));
 const counts={zoll:0,competitor:0,mixed:0,unknown:0};for(const r of rows)counts[r.presence]++;
 const departments=new Map<string,{z:boolean;c:boolean}>();
 for(const r of rows){const v=departments.get(r.parentId)??{z:false,c:false};v.z||=r.presence==='zoll'||r.presence==='mixed';v.c||=r.presence==='competitor'||r.presence==='mixed';departments.set(r.parentId,v);}
 return {rows,counts,ambiguous:[...seen.values()].filter(n=>n>1).length,mixedDepartments:[...departments.values()].filter(v=>v.z&&v.c).length,withheldEvidence:samples.reduce((n,s)=>n+s.withheldEvidence,0)};
}
