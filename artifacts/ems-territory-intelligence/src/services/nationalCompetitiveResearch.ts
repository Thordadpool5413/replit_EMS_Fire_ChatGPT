import type {Agency} from '../types';
import {FEDERAL_STATES,FEDERAL_TOPICS,type FederalTopic,type FederalPage} from './federalDiscoveryContract';
import {municipalKind,nycDay,type MunicipalPage,type MunicipalTopic} from './municipalDiscoveryContract';
import {chicagoAmountNote,type ChicagoPage} from './chicagoDiscoveryContract';
import type {DiscoveryPage} from './publicIntelligenceDiscovery';
import {sharedAgencyKey} from './sharedEvidence';
import {registryClaimIndex,canCreateRegistryAccount} from './registryAccountLink';
import {equipmentObservationFacts,definitionFor} from './documentedIntelligence';
import {buildDiscoveryMatches} from './publicIntelligenceDiscovery';
export const NATIONAL_TOPICS={defibrillator:FEDERAL_TOPICS.defibrillator,resuscitation:FEDERAL_TOPICS.resuscitation,ventilator:FEDERAL_TOPICS.ventilator,ambulance:FEDERAL_TOPICS.ambulance,epcr:FEDERAL_TOPICS.epcr} as const;
export type NationalTopic=Exclude<FederalTopic,'grants'>;
export const NYC_TOPIC:Record<NationalTopic,MunicipalTopic>={defibrillator:'cardiac',resuscitation:'cpr',ventilator:'ventilation',ambulance:'ambulance',epcr:'software'};
export const NATIONAL_STATES=FEDERAL_STATES;
export type ResearchSource='fema'|'federal-grants'|'federal-contracts'|'municipal'|'chicago';
export const RESEARCH_SOURCES:Record<ResearchSource,string>={fema:'OpenFEMA assistance', 'federal-grants':'USAspending assistance','federal-contracts':'USAspending supplier awards',municipal:'NYC procurement notices',chicago:'Chicago purchase orders and revisions'};
export type ResearchCandidate={key:string;source:ResearchSource;nativeId:string;number:string|null;organization:string;state:string;role:'grant-recipient'|'supplier'|'notice-issuer'|'contracting-department';title:string;description:string|null;vendor:string|null;amount:number|null;fiscalYear:number|null;publishedDay:string|null;periodStart:string|null;periodEnd:string|null;deadlineLocal:string|null;sourceUrl:string;sourceType:string;contractRevision?:string|null;amountNote?:string};
export type ResearchScope={source:ResearchSource;status:'retrieved'|'partial'|'unavailable'|'not-covered';fetchedAt:string|null;sourceRows:number;withheld:number;duplicates:number;hasMore:boolean;candidates:ResearchCandidate[]};
export type StateResearch={state:string;topic:NationalTopic;fromYear:number;checkedAt:string;scopes:ResearchScope[]};
type Mention={brand:string;family:'monitors'|'cpr'|'ventilators'|'software'|'unspecified';term:string};
type Rule={brand:string;family:Mention['family'];pattern:RegExp};
// Explicit product/name tokens only. No inference from search query, account, award amount or manufacturer-like personal names.
const rules:Rule[]=[
 {brand:'ZOLL',family:'monitors',pattern:/\bzoll\s+(?:x|r|m|e)\s*series(?:\s+advanced)?\b/i},
 {brand:'ZOLL',family:'cpr',pattern:/\bautopulse\b/i},
 {brand:'ZOLL',family:'ventilators',pattern:/\bz[\s-]?vent\b/i},
 {brand:'ZOLL',family:'software',pattern:/\b(?:rescuenet|emscharts)\b/i},
 {brand:'ZOLL',family:'unspecified',pattern:/\bzoll\b/i},
 {brand:'Stryker / Physio-Control',family:'monitors',pattern:/\blifepak(?:[\s-]?(?:12|15|20e?|35|1000|cr2))?\b|\bheartsine\b/i},
 {brand:'Stryker / Physio-Control',family:'cpr',pattern:/\blucas[\s-]?(?:2|3)\b|\blucas\s+(?:device|chest compression|mechanical cpr)\b/i},
 {brand:'Stryker / Physio-Control',family:'software',pattern:/\blifenet\b|\bcode[\s-]stat\b/i},
 {brand:'Stryker / Physio-Control',family:'unspecified',pattern:/\bphysio[\s-]?control\b|\bstryker\b/i},
 {brand:'Philips',family:'monitors',pattern:/\bphilips\s+(?:heartstart|tempus)\b|\bheartstart\b/i},
 {brand:'Philips',family:'unspecified',pattern:/\bphilips\b/i},
 {brand:'Corpuls',family:'monitors',pattern:/\bcorpuls[\s-]?(?:3|1)\b/i},
 {brand:'Corpuls',family:'unspecified',pattern:/\bcorpuls\b/i},
 {brand:'Hamilton Medical',family:'ventilators',pattern:/\bhamilton[\s-]?(?:t1|c1|c3|c6|g5)\b|\bhamilton medical\b/i},
 {brand:'WEINMANN',family:'ventilators',pattern:/\bweinmann\b|\bmedumat\b/i},
 {brand:'Dräger',family:'ventilators',pattern:/\b(?:dr[aä]eger|dräger)\s+oxylog\b|\boxylog\b/i},
 {brand:'Mindray',family:'unspecified',pattern:/\bmindray\b/i},
 {brand:'SCHILLER',family:'monitors',pattern:/\b(?:schiller\s+defi[g]?ard|defi[g]?ard)\b/i},
 {brand:'Nihon Kohden',family:'unspecified',pattern:/\bnihon kohden\b/i},
 {brand:'ImageTrend',family:'software',pattern:/\bimagetrend\b/i},
 {brand:'ESO',family:'software',pattern:/\beso\s+(?:epcr|ehr|solutions|software|patient care)\b/i},
 {brand:'Digitech',family:'software',pattern:/\bdigitech\s+(?:billing|computer)\b/i},
 {brand:'Traumasoft',family:'software',pattern:/\btraumasoft\b/i},
 {brand:'CentralSquare',family:'software',pattern:/\bcentral[\s-]?square\s+(?:technologies|cad|software|dispatch)\b/i},
 {brand:'Motorola Solutions',family:'software',pattern:/\bmotorola\s+solutions\b/i},
 {brand:'Tyler Technologies',family:'software',pattern:/\btyler\s+technologies\b/i},
];
export function productMentions(text:string|null|undefined):Mention[]{
 const value=(text??'').normalize('NFKC').slice(0,5000);
 const hits=rules.flatMap(r=>{const m=value.match(r.pattern);return m?[{brand:r.brand,family:r.family,term:m[0]}]:[];});
 return hits.filter((m,i)=>!(m.family==='unspecified'&&hits.some(x=>x.brand===m.brand&&x.family!=='unspecified'))&&hits.findIndex(x=>x.brand===m.brand&&x.family===m.family)===i);
}
export function researchMentions(c:ResearchCandidate){
 return {document:productMentions([c.title,c.description].filter(Boolean).join(' ')),vendor:productMentions(c.vendor)};
}
const blank={description:null,vendor:null,fiscalYear:null,publishedDay:null,periodStart:null,periodEnd:null,deadlineLocal:null};
const hasMore=(v:number|null,capped:boolean)=>v!==null||capped;
export function unavailableScope(source:ResearchSource,status:'unavailable'|'not-covered'='unavailable'):ResearchScope{
 return {source,status,fetchedAt:null,sourceRows:0,withheld:0,duplicates:0,hasMore:false,candidates:[]};
}
function retrieved(source:ResearchSource,p:{fetchedAt:string;sourceRows:number;withheld:number;duplicates:number},more:boolean,candidates:ResearchCandidate[],warnings=0):ResearchScope{
 return {source,status:more||p.withheld||warnings?'partial':'retrieved',fetchedAt:p.fetchedAt,sourceRows:p.sourceRows,withheld:p.withheld,duplicates:p.duplicates,hasMore:more,candidates:warnings?[]:candidates};
}
export function femaResearch(p:DiscoveryPage):ResearchScope{
 return retrieved('fema',p,hasMore(p.nextOffset,p.scopeCapped),p.candidates.map(c=>({...blank,key:'openfema-afg:'+c.id,source:'fema',nativeId:c.id,number:c.awardNumber,organization:c.recipient,state:c.state,role:'grant-recipient',title:c.program,amount:c.awardAmount,fiscalYear:c.fiscalYear,sourceType:'Assistance grant record',sourceUrl:c.sourceUrl})));
}
export function federalResearch(p:FederalPage):ResearchScope{
 const grant=p.query.topic==='grants',source=grant?'federal-grants':'federal-contracts';
 return retrieved(source,p,hasMore(p.nextPage,p.scopeCapped),p.candidates.map(c=>({...blank,key:'usaspending:'+c.id,source,nativeId:c.id,number:c.awardNumber,organization:c.recipient,state:c.state,role:grant?'grant-recipient':'supplier',title:grant?'Federal assistance award':'Federal contract award',description:c.description,amount:c.awardAmount,periodStart:c.startDate,periodEnd:c.endDate,sourceType:grant?'Grant recipient':'Contract recipient / supplier',sourceUrl:c.sourceUrl})),p.warnings);
}
export function municipalResearch(p:MunicipalPage):ResearchScope{
 return retrieved('municipal',p,hasMore(p.nextPage,p.scopeCapped),p.notices.map(n=>({...blank,key:'nyc-city-record:'+n.id,source:'municipal',nativeId:n.id,number:n.pin,organization:n.issuingAgency,state:'NY',role:'notice-issuer',title:n.title,vendor:n.vendor,amount:n.contractAmount,publishedDay:n.publishedDate,deadlineLocal:n.dueLocal,sourceType:n.noticeType,sourceUrl:n.sourceUrl})));
}
/** Preserve purchase-order revisions; never aggregate them into a total or infer a current agreement. */
export function chicagoResearch(p:ChicagoPage):ResearchScope{
 return retrieved('chicago',p,hasMore(p.nextPage,p.scopeCapped),p.records.map(r=>({...blank,key:'chicago:'+r.key,source:'chicago',nativeId:r.key,number:r.contractNumber,organization:r.department??'Department not reported',state:'IL',role:'contracting-department',title:r.description,vendor:r.vendor,amount:r.amount,publishedDay:r.approvalDay,periodStart:r.startDay,periodEnd:r.endDay,sourceType:'Purchase order / revision',sourceUrl:r.sourceUrl,contractRevision:r.revision,amountNote:chicagoAmountNote(r)})));
}
export const COMMERCIAL_RESEARCH_LABELS={solicitation:'Solicitation · verify status','deadline-elapsed':'Published deadline elapsed','deadline-today':'Published deadline today · verify time','intent':'Intent to award · not final','award':'Award history','supplier':'Supplier award · end user unconfirmed','funding':'Assistance award · balance unknown','contract':'Purchase order / revision · verify terms','other':'Other published notice'} as const;
export type CommercialResearchStatus=keyof typeof COMMERCIAL_RESEARCH_LABELS;
export function commercialResearchStatus(c:ResearchCandidate,now=Date.now()):CommercialResearchStatus{
 if(c.source==='chicago')return 'contract';
 if(c.role==='grant-recipient')return 'funding';
 if(c.role==='supplier')return 'supplier';
 if(c.source==='municipal'){
  const kind=municipalKind(c.sourceType);
  if(kind==='award')return 'award';
  if(kind==='intent-to-award')return 'intent';
  if(kind==='solicitation'){
   const day=c.deadlineLocal?.slice(0,10),today=nycDay(now);
   return day&&day<today?'deadline-elapsed':day===today?'deadline-today':'solicitation';
  }
 }
 return 'other';
}
/** Directory identity counts are not unique agencies, active licenses, or equipment coverage. */
export function loadedResearchCoverage(agencies:Agency[],now=Date.now()){
 const ids=new Map<string,number>(),keys=new Map<string,number>(),claims=registryClaimIndex(agencies);
 for(const a of agencies){if(a.id)ids.set(a.id,(ids.get(a.id)??0)+1);const key=sharedAgencyKey(a);if(key)keys.set(key,(keys.get(key)??0)+1);}
 const states=new Map(NATIONAL_STATES.map(s=>[s,{loaded:0,eligible:0,excluded:0,documented:{monitors:0,cpr:0,ventilators:0,software:0}}]));
 const eligible:Agency[]=[];
 for(const a of agencies){
  const state=states.get(a.stateCode);if(!state)continue;
  state.loaded++;
  const key=sharedAgencyKey(a),identity=a.registryIdentity;
  if(!key||!identity||keys.get(key)!==1||claims.counts.get(key)!==1||claims.byAccount.get(a)?.invalid.length||claims.byAccount.get(a)?.conflicts.length||ids.get(a.id)!==1||!canCreateRegistryAccount(identity)||identity.headquartersState&&identity.headquartersState!==a.stateCode){state.excluded++;continue;}
  state.eligible++;eligible.push(a);
  const families=new Set(equipmentObservationFacts(a,now).map(f=>definitionFor(f.intelligence.kind)?.family));
  for(const family of ['monitors','cpr','ventilators','software'] as const)if(families.has(family))state.documented[family]++;
 }
 return {states,eligible};
}
const normalize=(s:string)=>(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function assessNationalCandidates(agencies:Agency[],research:StateResearch,now=Date.now()){
 const coverage=loadedResearchCoverage(agencies,now),eligible=new Set(coverage.eligible.map(a=>a.id));
 const grouped=new Map<string,ResearchCandidate>(),conflicts=new Set<string>();
 for(const s of research.scopes)if(s.status==='retrieved'||s.status==='partial')for(const c of s.candidates){
  if(c.state!==research.state||c.source!==s.source)continue;
  const prior=grouped.get(c.key);if(prior){if(JSON.stringify(prior)!==JSON.stringify(c))conflicts.add(c.key);}else grouped.set(c.key,c);
 }
 const rows=[...grouped.values()].filter(c=>!conflicts.has(c.key));
 const grants=rows.filter(c=>c.role==='grant-recipient').map(c=>({key:c.key,recipient:c.organization,state:c.state}));
 const matched=new Map(buildDiscoveryMatches(agencies,grants).map(r=>[r.candidate.key,r]));
 const overlap=new Map<string,ResearchCandidate[]>();
 for(const c of rows)if(c.role==='grant-recipient'&&c.number){const key=JSON.stringify([c.state,normalize(c.organization),normalize(c.number)]);const group=overlap.get(key)??[];group.push(c);overlap.set(key,group);}
 const overlapping=new Set([...overlap.values()].filter(g=>new Set(g.map(c=>c.source)).size>1).flatMap(g=>g.map(c=>c.key)));
 return {conflicts:conflicts.size,rows:rows.map(c=>{
  const m=matched.get(c.key),a=m?.account;
  // Name/state is only a lead. A renamed or inconsistent registry identity remains ambiguous.
  const account=a&&eligible.has(a.id)&&normalize(a.registryIdentity?.name??'')===normalize(c.organization)?a:undefined;
  return {candidate:c,account,identityStatus:c.role!=='grant-recipient'?'not-a-recipient-match':account?'possible-name-match':m?.status==='unmatched'?'unmatched':'ambiguous',overlap:overlapping.has(c.key),...researchMentions(c)} as const;
 })};
}
