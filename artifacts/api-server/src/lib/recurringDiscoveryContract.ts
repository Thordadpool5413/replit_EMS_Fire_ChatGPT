/** Versioned, public-only recurring discovery feed. Not a reviewed evidence store. */
import {titleMatches,type MunicipalTopic} from './municipalDiscoveryContract';
import {chicagoIdentifier,chicagoKey,chicagoMatches,chicagoRecordUrl} from './chicagoDiscoveryContract';
export const FEED_SOURCE_URL='https://raw.githubusercontent.com/Thordadpool5413/replit_EMS_Fire_ChatGPT/refs/heads/atlas/public-discovery-feed/feed.json';
export const FEED_LIMIT=400, FEED_RETAIN_DAYS=90, FEED_STALE_MS=48*60*60_000;
export const FEED_SCOPES={
 'fema-fl':{source:'openfema-afg',state:'FL',label:'OpenFEMA · Florida assistance grants',limit:50},
 'federal-fl-grants':{source:'usaspending',state:'FL',label:'USAspending · Florida assistance grants',limit:25},
 'federal-fl-defibrillator':{source:'usaspending',state:'FL',label:'USAspending · Florida supplier defibrillator awards',limit:25},
 'nyc-cardiac':{source:'nyc-city-record',state:'NY',label:'NYC · cardiac procurement titles',limit:25},
 'nyc-cpr':{source:'nyc-city-record',state:'NY',label:'NYC · resuscitation procurement titles',limit:25},
 'nyc-ventilation':{source:'nyc-city-record',state:'NY',label:'NYC · ventilation procurement titles',limit:25},
 'nyc-ambulance':{source:'nyc-city-record',state:'NY',label:'NYC · ambulance / EMS procurement titles',limit:25},
 'nyc-brands':{source:'nyc-city-record',state:'NY',label:'NYC · equipment brand procurement titles',limit:25},
 'nyc-software':{source:'nyc-city-record',state:'NY',label:'NYC · EMS software procurement titles',limit:25},
 'chicago-cardiac':{source:'chicago-contracts',state:'IL',label:'Chicago · cardiac contract revisions',limit:25},
 'chicago-cpr':{source:'chicago-contracts',state:'IL',label:'Chicago · cpr contract revisions',limit:25},
 'chicago-ventilation':{source:'chicago-contracts',state:'IL',label:'Chicago · ventilation contract revisions',limit:25},
 'chicago-ambulance':{source:'chicago-contracts',state:'IL',label:'Chicago · ambulance contract revisions',limit:25},
 'chicago-software':{source:'chicago-contracts',state:'IL',label:'Chicago · software contract revisions',limit:25},
 'chicago-brands':{source:'chicago-contracts',state:'IL',label:'Chicago · brands contract revisions',limit:25},
} as const;
export type FeedScope=keyof typeof FEED_SCOPES;
export const FEED_SCOPE_IDS=Object.keys(FEED_SCOPES) as FeedScope[];
const LEGACY_SCOPE_IDS=FEED_SCOPE_IDS.filter(id=>!id.startsWith('chicago-')&&id!=='nyc-software');
const MAX_SOURCE_ROWS=FEED_SCOPE_IDS.reduce((n,id)=>n+FEED_SCOPES[id].limit,0);
function chicagoIdentity(id:string):[string,string|null]{
 const v:unknown=JSON.parse(id);
 if(!Array.isArray(v)||v.length!==2||!chicagoIdentifier(v[0])||(v[1]!==null&&!chicagoIdentifier(v[1]))||chicagoKey(v[0],v[1])!==id)throw Error('Invalid Chicago contract revision identity.');
 return [v[0],v[1]];
}
export type FeedSource=(typeof FEED_SCOPES)[FeedScope]['source'];
export type FeedKind='grant'|'federal-contract-award'|'municipal-solicitation'|'municipal-award'|'municipal-intent'|'municipal-other'|'chicago-contract-revision';
export type FeedCandidate={source:FeedSource;nativeId:string;recordNumber:string|null;organization:string;state:string;kind:FeedKind;title:string;amount:number|null;fiscalYear:number|null;publishedDay:string|null;periodStart:string|null;periodEnd:string|null;deadlineLocal:string|null;vendor:string|null;sourceUrl:string};
export type FeedItem={candidate:FeedCandidate;scopes:FeedScope[];firstSeen:string;lastSeen:string;lastChanged:string;event:'baseline'|'new-to-sample'|'changed'};
export type FeedScopeStatus={id:FeedScope;status:'ok'|'partial'|'unavailable';sourceRows:number;withheld:number;hasMore:boolean;lastSuccess:string|null};
export type DiscoveryFeed={schemaVersion:2;runAt:string;scopes:FeedScopeStatus[];items:FeedItem[];evicted:number;conflictingIds:number};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
const str=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v:unknown,n:number)=>v===null||str(v,n);
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const iso=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const bounded=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const local=(v:unknown):boolean=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(v)&&day(v.slice(0,10));
export function feedKey(c:FeedCandidate){return c.source+':'+c.nativeId;}
export function feedSourceUrl(source:FeedSource,id:string):string{
 if(source==='openfema-afg'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)){
  const u=new URL('https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants');
  u.searchParams.set('$filter',"id eq '"+id+"'");return u.toString();
 }
 if(source==='usaspending'&&/^(?:ASST_NON_|CONT_AWD_)[A-Za-z0-9_-]{1,230}$/.test(id))return 'https://www.usaspending.gov/award/'+encodeURIComponent(id);
 if(source==='nyc-city-record'&&/^[1-9]\d{0,14}$/.test(id)){
  const u=new URL('https://data.cityofnewyork.us/resource/dg92-zbpx.json');
  u.searchParams.set('$select','request_id,start_date,agency_name,type_of_notice_description,short_title,section_name,pin,due_date,contract_amount,vendor_name,selection_method_description');
  u.searchParams.set('$where','request_id = '+id);return u.toString();
 }
 if(source==='chicago-contracts'){const [number,revision]=chicagoIdentity(id);return chicagoRecordUrl(number,revision);}
 throw Error('Invalid public source identity.');
}
export function validateFeedCandidate(v:unknown):FeedCandidate{
 if(!obj(v)||!keys(v,['source','nativeId','recordNumber','organization','state','kind','title','amount','fiscalYear','publishedDay','periodStart','periodEnd','deadlineLocal','vendor','sourceUrl'])||!['openfema-afg','usaspending','nyc-city-record','chicago-contracts'].includes(String(v.source))||!str(v.nativeId,v.source==='chicago-contracts'?260:240)||!optional(v.recordNumber,240)||!str(v.organization,300)||!str(v.title,500)||(v.amount!==null&&(typeof v.amount!=='number'||!Number.isFinite(v.amount)||Math.abs(v.amount)>1e15))||!(v.fiscalYear===null||typeof v.fiscalYear==='number'&&Number.isInteger(v.fiscalYear)&&v.fiscalYear>=2010&&v.fiscalYear<=2100)||!(v.publishedDay===null||day(v.publishedDay))||!(v.periodStart===null||day(v.periodStart))||!(v.periodEnd===null||day(v.periodEnd))||(typeof v.periodStart==='string'&&typeof v.periodEnd==='string'&&v.periodEnd<v.periodStart)||!(v.deadlineLocal===null||local(v.deadlineLocal))||!optional(v.vendor,300)||v.sourceUrl!==feedSourceUrl(v.source as FeedSource,v.nativeId))throw Error('Invalid public feed candidate.');
 if(v.source==='openfema-afg'&&(v.kind!=='grant'||v.state!=='FL'||v.fiscalYear===null||!v.recordNumber||v.publishedDay!==null||v.periodStart!==null||v.periodEnd!==null||v.deadlineLocal!==null||v.vendor!==null))throw Error('Invalid FEMA candidate scope.');
 if(v.source==='usaspending'&&(v.state!=='FL'||!v.recordNumber||!['grant','federal-contract-award'].includes(String(v.kind))||(v.kind==='grant'?!v.nativeId.startsWith('ASST_NON_'):!v.nativeId.startsWith('CONT_AWD_'))||v.fiscalYear!==null||v.publishedDay!==null||v.deadlineLocal!==null||v.vendor!==null))throw Error('Invalid federal candidate scope.');
 if(v.source==='nyc-city-record'&&(v.state!=='NY'||!['municipal-solicitation','municipal-award','municipal-intent','municipal-other'].includes(String(v.kind))||v.publishedDay===null||v.fiscalYear!==null||v.periodStart!==null||v.periodEnd!==null||(typeof v.amount==='number'&&v.amount<0)))throw Error('Invalid municipal candidate scope.');
 if(v.source==='chicago-contracts'&&(v.kind!=='chicago-contract-revision'||v.state!=='IL'||v.recordNumber!==chicagoIdentity(v.nativeId)[0]||v.publishedDay===null||v.fiscalYear!==null||v.deadlineLocal!==null))throw Error('Invalid Chicago candidate scope.');
 const c=v as unknown as FeedCandidate;
 return {source:c.source,nativeId:c.nativeId,recordNumber:c.recordNumber,organization:c.organization,state:c.state,kind:c.kind,title:c.title,amount:c.amount,fiscalYear:c.fiscalYear,publishedDay:c.publishedDay,periodStart:c.periodStart,periodEnd:c.periodEnd,deadlineLocal:c.deadlineLocal,vendor:c.vendor,sourceUrl:c.sourceUrl};
}
export function scopeMatches(id:FeedScope,c:FeedCandidate){
 const s=FEED_SCOPES[id];
 return s.source===c.source&&s.state===c.state&&(id==='federal-fl-grants'?c.kind==='grant':id==='federal-fl-defibrillator'?c.kind==='federal-contract-award':id.startsWith('nyc-')?titleMatches(c.title,id.slice(4) as MunicipalTopic):id.startsWith('chicago-')?chicagoMatches(c.title,id.slice(8) as MunicipalTopic):true);
}
export function validateDiscoveryFeed(v:unknown,now=Date.now()):DiscoveryFeed{
 if(!obj(v)||!keys(v,['schemaVersion','runAt','scopes','items','evicted','conflictingIds'])||(v.schemaVersion!==1&&v.schemaVersion!==2)||!iso(v.runAt)||Date.parse(v.runAt)>now+60_000||!Array.isArray(v.scopes)||v.scopes.length!==(v.schemaVersion===1?LEGACY_SCOPE_IDS.length:FEED_SCOPE_IDS.length)||!Array.isArray(v.items)||v.items.length>FEED_LIMIT||!bounded(v.evicted,FEED_LIMIT+(v.schemaVersion===1?225:MAX_SOURCE_ROWS))||!bounded(v.conflictingIds,v.schemaVersion===1?225:MAX_SOURCE_ROWS))throw Error('Invalid public discovery feed.');
 const runAt=v.runAt,scopes:FeedScopeStatus[]=[],scopeIds=new Set<FeedScope>();
 const allowedScopes=v.schemaVersion===1?LEGACY_SCOPE_IDS:FEED_SCOPE_IDS;
 for(const s of v.scopes){
  if(!obj(s)||!keys(s,['id','status','sourceRows','withheld','hasMore','lastSuccess'])||typeof s.id!=='string'||!allowedScopes.includes(s.id as FeedScope)||scopeIds.has(s.id as FeedScope)||!['ok','partial','unavailable'].includes(String(s.status))||!bounded(s.sourceRows,FEED_SCOPES[s.id as FeedScope].limit)||!bounded(s.withheld,s.sourceRows)||typeof s.hasMore!=='boolean'||!(s.lastSuccess===null||iso(s.lastSuccess)&&s.lastSuccess<=runAt))throw Error('Invalid feed scope status.');
  if(s.status==='unavailable'?(s.sourceRows!==0||s.withheld!==0||s.hasMore||s.lastSuccess===runAt):(s.lastSuccess!==runAt||s.status==='ok'&&(s.withheld>0||s.hasMore)))throw Error('Inconsistent feed scope status.');
  scopeIds.add(s.id as FeedScope);scopes.push(s as unknown as FeedScopeStatus);
 }
 const items:FeedItem[]=[],ids=new Set<string>();
 for(const r of v.items){
  if(!obj(r)||!keys(r,['candidate','scopes','firstSeen','lastSeen','lastChanged','event'])||!Array.isArray(r.scopes)||!r.scopes.length||r.scopes.length>FEED_SCOPE_IDS.length||!iso(r.firstSeen)||!iso(r.lastSeen)||!iso(r.lastChanged)||r.firstSeen>r.lastChanged||r.lastChanged>r.lastSeen||r.lastSeen>runAt||Date.parse(runAt)-Date.parse(r.lastSeen)>FEED_RETAIN_DAYS*86_400_000||!['baseline','new-to-sample','changed'].includes(String(r.event))||(r.event!=='changed'&&r.lastChanged!==r.firstSeen))throw Error('Invalid discovery history.');
  const c=validateFeedCandidate(r.candidate),id=feedKey(c);
  if(ids.has(id)||new Set(r.scopes).size!==r.scopes.length||r.scopes.some(s=>typeof s!=='string'||!allowedScopes.includes(s as FeedScope)||!scopeMatches(s as FeedScope,c)))throw Error('Invalid discovery identity or scope.');
  if(r.lastSeen===runAt&&!r.scopes.some(s=>scopes.some(x=>x.id===s&&x.status!=='unavailable')))throw Error('Observation has no successful scope.');
  ids.add(id);items.push({candidate:c,scopes:r.scopes as FeedScope[],firstSeen:r.firstSeen,lastSeen:r.lastSeen,lastChanged:r.lastChanged,event:r.event as FeedItem['event']});
 }
 // Legacy feeds migrate in memory; a new scope has no successful baseline yet.
 for(const id of FEED_SCOPE_IDS)if(!scopeIds.has(id))scopes.push({id,status:'unavailable',sourceRows:0,withheld:0,hasMore:false,lastSuccess:null});
 return {schemaVersion:2,runAt,scopes,items,evicted:v.evicted,conflictingIds:v.conflictingIds};
}
const normalize=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const awardKey=(c:FeedCandidate)=>c.kind==='grant'&&c.recordNumber?JSON.stringify([c.state,normalize(c.recordNumber),normalize(c.organization)]):'';
/** Exact normalized number/name/state overlap across sources is a review hint, never a merged award. */
export function possibleGrantOverlap(items:FeedItem[]):Set<string>{
 const groups=new Map<string,FeedCandidate[]>();
 for(const {candidate:c} of items){const key=awardKey(c);if(key){const a=groups.get(key)??[];a.push(c);groups.set(key,a);}}
 const overlap=new Set<string>();
 for(const group of groups.values())if(new Set(group.map(c=>c.source)).size>1)for(const c of group)overlap.add(feedKey(c));
 return overlap;
}
export function feedIsStale(feed:DiscoveryFeed,now=Date.now()){return now-Date.parse(feed.runAt)>FEED_STALE_MS;}
