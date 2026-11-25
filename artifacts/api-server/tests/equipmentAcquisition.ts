import {fetchChicagoDiscovery} from '../src/lib/chicagoDiscovery';
import {fetchMunicipalDiscovery} from '../src/lib/municipalSpendingDiscovery';
import type {MunicipalTopic} from '../src/lib/municipalDiscoveryContract';

export const topics=['cardiac','cpr','ventilation','software','brands'] as const;
type Topic=typeof topics[number];
type Source='nyc-city-record'|'chicago-contracts';
export type Candidate={source:Source;nativeId:string;organization:string|null;title:string;vendor:string|null;date:string;kind:string;sourceUrl:string;recordNumber:string|null;revision:string|null};
export type Scope={source:Source;topic:Topic;pages:number;sourceRows:number;withheld:number;duplicates:number;status:'complete-window'|'bounded-partial'|'unavailable';candidates:Candidate[]};
const rules:Record<string,RegExp>={
 'ZOLL':/\bzoll\b|\bautopulse\b|\bz[ -]?vent\b|\brescuenet\b|\bemscharts\b/i,
 'Stryker / Physio-Control':/\bstryker\b|\bphysio[ -]?control\b|\blifepak\b|\blucas[ -]?[23]\b|\blucas device\b|\bheartsine\b/i,
 'Philips':/\bphilips\b|\bheartstart\b/i,
 'Hamilton Medical':/\bhamilton medical\b|\bhamilton[ -]?(?:t1|c1|c3|c6|g5)\b/i,
 'Corpuls':/\bcorpuls\b/i,
 'Dräger':/\b(?:dr[aä]eger|dräger|oxylog)\b/i,
 'WEINMANN':/\b(?:weinmann|medumat)\b/i,
 'Mindray':/\bmindray\b/i,
 'ImageTrend':/\bimagetrend\b/i,
 'ESO':/\beso\s+(?:epcr|software|solutions|ehr)\b/i,
 'CentralSquare':/\bcentral[ -]?square\b/i,
 'Motorola Solutions':/\bmotorola solutions\b/i,
 'Tyler Technologies':/\btyler technologies\b/i,
 'Traumasoft':/\btraumasoft\b/i
};
export function mentions(value:string|null){
 return Object.entries(rules).flatMap(([manufacturer,pattern])=>{const m=value?.match(pattern);return m?[{manufacturer,matchedText:m[0]}]:[];});
}
export function reconcileEquipmentCandidates(scopes:Scope[]){
 const records=new Map<string,{record:Candidate;topics:Set<Topic>}>(),conflicts=new Set<string>();let repeated=0;
 for(const scope of scopes)for(const c of scope.candidates){
  if(c.source!==scope.source)throw Error('Source mismatch');
  const key=JSON.stringify([c.source,c.nativeId]),old=records.get(key);
  if(old){if(JSON.stringify(old.record)!==JSON.stringify(c))conflicts.add(key);else{old.topics.add(scope.topic);repeated++;}}
  else records.set(key,{record:c,topics:new Set([scope.topic])});
 }
 const candidates=[...records].flatMap(([key,{record,topics}])=>{
  if(conflicts.has(key))return [];
  const documentMentions=mentions(record.title),vendorMentions=mentions(record.vendor);
  return [{...record,matchedTopics:[...topics].sort(),documentMentions,vendorMentions,interpretation:'Public procurement research candidate; installation and end user unconfirmed',endUserValidationRequired:true as const}];
 });
 return {candidates,summary:{distinctProcurementRecords:candidates.length,documentProductMentions:candidates.filter(c=>c.documentMentions.length).length,vendorNameMentions:candidates.filter(c=>c.vendorMentions.length).length,repeatSourceRows:repeated,conflictingIdentitiesWithheld:conflicts.size,unavailableScopes:scopes.filter(s=>s.status==='unavailable').length,partialScopes:scopes.filter(s=>s.status==='bounded-partial').length}};
}
export async function collectEquipmentScope(source:Source,topic:Topic,now:number,fetcher:typeof fetch=fetch):Promise<Scope>{
 const result:Scope={source,topic,pages:0,sourceRows:0,withheld:0,duplicates:0,status:'complete-window',candidates:[]};
 try{
  for(let page=1;page<=3;page++){
   if(source==='nyc-city-record'){
    const p=await fetchMunicipalDiscovery({source,topic,days:365,page},fetcher,now);
    result.pages++;result.sourceRows+=p.sourceRows;result.withheld+=p.withheld;result.duplicates+=p.duplicates;
    result.candidates.push(...p.notices.map(n=>({source,nativeId:n.id,organization:n.issuingAgency,title:n.title,vendor:n.vendor,date:n.publishedDate,kind:n.kind,sourceUrl:n.sourceUrl,recordNumber:n.pin,revision:null})));
    if(p.withheld||p.scopeCapped)result.status='bounded-partial';
    if(p.nextPage===null)break;
    if(page===3)result.status='bounded-partial';
   }else{
    const p=await fetchChicagoDiscovery({topic,days:1095,page},fetcher,now);
    result.pages++;result.sourceRows+=p.sourceRows;result.withheld+=p.withheld;result.duplicates+=p.duplicates;
    result.candidates.push(...p.records.map(n=>({source,nativeId:n.key,organization:n.department,title:n.description,vendor:n.vendor,date:n.approvalDay,kind:'purchase-order-revision',sourceUrl:n.sourceUrl,recordNumber:n.contractNumber,revision:n.revision})));
    if(p.withheld||p.scopeCapped)result.status='bounded-partial';
    if(p.nextPage===null)break;
    if(page===3)result.status='bounded-partial';
   }
  }
 }catch{result.status=result.pages?'bounded-partial':'unavailable';}
 return result;
}
