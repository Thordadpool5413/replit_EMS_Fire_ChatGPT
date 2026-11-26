/** National discovery only: separate approximate secondary address evidence, not agencies or stations. */
import {addressKey,addressText,type AddressMatch} from './providerLocationContract';
import {loadAllMonthlySecondaryRows,type MonthlySecondaryRow} from './nppesMonthlySecondary';
import {loadAllMonthlyGeocodeRows,type MonthlyGeocodeRow} from './nppesMonthlyGeocode';
import {loadSourceDirectoryManifest} from './nationalSourceDirectory';
export type SecondaryDiscoveryRow={source:MonthlySecondaryRow;point:AddressMatch;countyFips:string;sharedApproximatePoint:boolean};
export type SecondaryDiscovery={rows:SecondaryDiscoveryRow[];countyNames:Record<string,string>};
export type SecondaryDiscoveryScope={state:string;county:string;city:string;category:'all'|'ems'|'fire';query:string};
export type SecondaryPointGroup={key:string;lat:number;lng:number;rows:SecondaryDiscoveryRow[]};
const norm=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
const countyNorm=(s:string)=>norm(s).replace(/ (county|parish|borough|planning region|census area|municipality)$/,'');
export function buildSecondaryDiscovery(sources:MonthlySecondaryRow[],geocodes:MonthlyGeocodeRow[],countyNames:Record<string,string>):SecondaryDiscovery{
 const by=new Map(sources.map(s=>[s.sourceKey,s]));
 if(sources.length!==844||by.size!==844||geocodes.length!==844||new Set(geocodes.map(g=>g.sourceKey)).size!==844)throw Error('Secondary national source membership mismatch');
 const rows:SecondaryDiscoveryRow[]=[];
 for(const g of geocodes){
  const s=by.get(g.sourceKey);
  if(!s||s.parentNpi!==g.parentNpi||addressKey(s.address)!==addressKey(g.address)||s.parentMappingStatus!==g.parentMappingStatus)throw Error('Secondary national source lineage mismatch');
  if(g.geocodeStatus==='approximate-street-range'){
   if(!g.sourceGeometry||g.sourceGeometry.method!=='census-address-range'||!g.censusCountyAsReported||!Object.hasOwn(countyNames,g.censusCountyAsReported))throw Error('Invalid secondary discovery geography');
   rows.push({source:s,point:g.sourceGeometry,countyFips:g.censusCountyAsReported,sharedApproximatePoint:g.sharedApproximatePoint});
  }else if(g.geocodeStatus!=='no-unique-match'||g.sourceGeometry!==null)throw Error('Unexpected secondary discovery outcome');
 }
 const counts=new Map<string,number>();
 for(const r of rows){const k=coordinateKey(r);counts.set(k,(counts.get(k)??0)+1);}
 if(rows.length!==580||counts.size!==559||new Set(rows.filter(r=>r.source.parentMappingStatus!=='mapped').map(r=>r.source.parentNpi)).size!==64||rows.some(r=>r.sharedApproximatePoint!==((counts.get(coordinateKey(r))??0)>1)))throw Error('Secondary discovery coverage mismatch');
 return {rows:rows.sort((a,b)=>a.source.sourceKey.localeCompare(b.source.sourceKey)),countyNames};
}
export function filterSecondaryDiscovery(data:SecondaryDiscovery,scope:SecondaryDiscoveryScope):SecondaryDiscoveryRow[]{
 if(scope.category==='fire'||!(/^[A-Z]{2}$/.test(scope.state)))return [];
 const query=norm(scope.query).split(' ').filter(Boolean);
 return data.rows.filter(r=>{
  const a=r.source.address;
  if(a.state!==scope.state)return false; // actual address state, not parent registry state
  if(scope.county!=='all'&&scope.county!==r.countyFips&&countyNorm(data.countyNames[r.countyFips]??'')!==countyNorm(scope.county))return false;
  if(scope.city!=='all'&&norm(a.city)!==norm(scope.city))return false;
  const haystack=norm([r.source.parentName,r.source.parentNpi,addressText(a)].join(' '));
  return query.every(q=>haystack.includes(q));
 });
}
const coordinateKey=(r:SecondaryDiscoveryRow)=>r.point.latitude+','+r.point.longitude;
export function groupSecondaryDiscovery(rows:SecondaryDiscoveryRow[]):SecondaryPointGroup[]{
 const groups=new Map<string,SecondaryPointGroup>();
 for(const r of rows){
  const key=coordinateKey(r);
  const group=groups.get(key)??{key,lat:r.point.latitude,lng:r.point.longitude,rows:[]};
  group.rows.push(r);groups.set(key,group);
 }
 return [...groups.values()];
}
let pending:Promise<SecondaryDiscovery>|undefined;
export function loadSecondaryDiscovery(){
 if(!pending)pending=Promise.all([loadAllMonthlySecondaryRows(),loadAllMonthlyGeocodeRows(),loadSourceDirectoryManifest()]).then(([s,g,m])=>buildSecondaryDiscovery(s,g,m.countyNames)).catch(e=>{pending=undefined;throw e});
 return pending;
}
