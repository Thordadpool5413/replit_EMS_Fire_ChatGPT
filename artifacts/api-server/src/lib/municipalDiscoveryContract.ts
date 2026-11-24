/** Municipal notice contract: NYC City Record Online only. No live-bid or award inference. */
export const MUNICIPAL_SOURCE='nyc-city-record' as const;
export const MUNICIPAL_ENDPOINT='https://data.cityofnewyork.us/resource/dg92-zbpx.json';
export const MUNICIPAL_DOCS='https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx';
export const MUNICIPAL_PORTAL='https://a856-cityrecord.nyc.gov/';
export const MUNICIPAL_TOPICS={
  cardiac:'Cardiac monitors / defibrillators',
  cpr:'Mechanical CPR / resuscitation',
  ventilation:'Ventilators',
  ambulance:'Ambulances / EMS',
  software:'ePCR / dispatch / billing',
  brands:'ZOLL / competitor names',
} as const;
export type MunicipalTopic=keyof typeof MUNICIPAL_TOPICS;
export const MUNICIPAL_TERMS:Record<MunicipalTopic,readonly string[]>={
 cardiac:['defibrillator','cardiac monitor','aed','automated external defibrillator'],
 cpr:['resuscitation','mechanical cpr','chest compression','autopulse','lucas device'],
 ventilation:['ventilator','ventilation equipment'],
 ambulance:['ambulance','emergency medical services','emergency medical equipment'],
 software:['patient care report','epcr','computer aided dispatch','ambulance billing','ems billing'],
 brands:['zoll','lifepak','stryker','physio-control','autopulse','corpuls','philips heartstart','lucas device'],
};
export const MUNICIPAL_PAGE_SIZE=25,MUNICIPAL_MAX_PAGE=20;
export const MUNICIPAL_FIELDS=['request_id','start_date','agency_name','type_of_notice_description','short_title','section_name','pin','due_date','contract_amount','vendor_name','selection_method_description'] as const;
export type MunicipalQuery={source:typeof MUNICIPAL_SOURCE;topic:MunicipalTopic;days:30|90|365;page:number};
export type MunicipalNoticeKind='solicitation'|'award'|'intent-to-award'|'other';
export type MunicipalNotice={id:string;title:string;issuingAgency:string;noticeType:string;kind:MunicipalNoticeKind;publishedDate:string;dueLocal:string|null;pin:string|null;vendor:string|null;contractAmount:number|null;selectionMethod:string|null;sourceUrl:string};
export type MunicipalPage={schemaVersion:1;source:typeof MUNICIPAL_SOURCE;query:MunicipalQuery;windowStart:string;windowEnd:string;fetchedAt:string;sourceRows:number;withheld:number;duplicates:number;nextPage:number|null;scopeCapped:boolean;notices:MunicipalNotice[]};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const optText=(v:unknown,max:number):boolean=>v===null||text(v,max);
const integer=(v:unknown):number|undefined=>typeof v==='number'&&Number.isInteger(v)?v:typeof v==='string'&&/^\d{1,3}$/.test(v)?Number(v):undefined;
export const municipalDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
/** CROL timestamps are floating local wall-clock values, not UTC instants. */
export function validLocalTimestamp(v:unknown):v is string{
 return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(v)&&municipalDay(v.slice(0,10));
}
export function nycDay(now=Date.now()):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 return part('year')+'-'+part('month')+'-'+part('day');
}
export function municipalWindow(days:MunicipalQuery['days'],now=Date.now()){
 const windowEnd=nycDay(now);
 return {windowEnd,windowStart:new Date(Date.parse(windowEnd)-(days-1)*86_400_000).toISOString().slice(0,10)};
}
export function parseMunicipalQuery(input:unknown):MunicipalQuery|undefined{
 if(!obj(input)||Object.keys(input).some(k=>!['source','topic','days','page'].includes(k))||input.source!==MUNICIPAL_SOURCE||typeof input.topic!=='string'||!Object.hasOwn(MUNICIPAL_TOPICS,input.topic))return undefined;
 const days=integer(input.days),page=input.page===undefined?1:integer(input.page);
 if((days!==30&&days!==90&&days!==365)||page===undefined||page<1||page>MUNICIPAL_MAX_PAGE)return undefined;
 return {source:MUNICIPAL_SOURCE,topic:input.topic as MunicipalTopic,days,page};
}
export function municipalKind(value:string):MunicipalNoticeKind{
 switch(value.trim().toLowerCase()){
  case 'solicitation':return 'solicitation';
  case 'award':return 'award';
  case 'intent to award':return 'intent-to-award';
  default:return 'other';
 }
}
export function municipalNoticeUrl(id:string):string{
 if(!/^[1-9]\d{0,14}$/.test(id))throw Error('Invalid municipal notice identifier.');
 const u=new URL(MUNICIPAL_ENDPOINT);
 u.searchParams.set('$select',MUNICIPAL_FIELDS.join(','));
 u.searchParams.set('$where','request_id = '+id);
 return u.toString();
}
export function titleMatches(title:string,topic:MunicipalTopic):boolean{
 const value=title.toLowerCase();
 return MUNICIPAL_TERMS[topic].some(term=>value.includes(term));
}
export function municipalDeadline(notice:MunicipalNotice,now=Date.now()):'not-applicable'|'not-stated'|'elapsed'|'today'|'future-unconfirmed'{
 if(notice.kind!=='solicitation')return 'not-applicable';
 if(!notice.dueLocal)return 'not-stated';
 const date=notice.dueLocal.slice(0,10),today=nycDay(now);
 return date<today?'elapsed':date===today?'today':'future-unconfirmed';
}
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=MUNICIPAL_PAGE_SIZE;
export function validateMunicipalPage(input:unknown,q:MunicipalQuery,now=Date.now()):MunicipalPage{
 if(!parseMunicipalQuery(q)||!obj(input)||input.schemaVersion!==1||input.source!==MUNICIPAL_SOURCE||!obj(input.query)||input.query.source!==q.source||input.query.topic!==q.topic||input.query.days!==q.days||input.query.page!==q.page||typeof input.fetchedAt!=='string'||!Number.isFinite(Date.parse(input.fetchedAt))||Date.parse(input.fetchedAt)>now+60_000||now-Date.parse(input.fetchedAt)>16*60_000)throw Error('Municipal discovery response is invalid, stale or out of scope.');
 const window=municipalWindow(q.days,Date.parse(input.fetchedAt));
 if(input.windowStart!==window.windowStart||input.windowEnd!==window.windowEnd||!count(input.sourceRows)||!count(input.withheld)||!count(input.duplicates)||!Array.isArray(input.notices)||input.notices.length+input.withheld+input.duplicates!==input.sourceRows||typeof input.scopeCapped!=='boolean'||(input.nextPage!==null&&(q.page>=MUNICIPAL_MAX_PAGE||input.nextPage!==q.page+1||input.sourceRows!==MUNICIPAL_PAGE_SIZE))||(input.scopeCapped&&(q.page!==MUNICIPAL_MAX_PAGE||input.nextPage!==null||input.sourceRows!==MUNICIPAL_PAGE_SIZE)))throw Error('Municipal discovery window or counts are invalid.');
 const ids=new Set<string>(),notices:MunicipalNotice[]=[];
 for(const r of input.notices){
  if(!obj(r)||typeof r.id!=='string'||!/^[1-9]\d{0,14}$/.test(r.id)||ids.has(r.id)||!text(r.title,500)||!titleMatches(r.title,q.topic)||!text(r.issuingAgency,240)||!text(r.noticeType,120)||r.kind!==municipalKind(r.noticeType)||!municipalDay(r.publishedDate)||r.publishedDate<window.windowStart||r.publishedDate>window.windowEnd||(r.dueLocal!==null&&!validLocalTimestamp(r.dueLocal))||!optText(r.pin,160)||!optText(r.vendor,300)||!optText(r.selectionMethod,240)||(r.contractAmount!==null&&(typeof r.contractAmount!=='number'||!Number.isFinite(r.contractAmount)||r.contractAmount<0||r.contractAmount>1e15))||r.sourceUrl!==municipalNoticeUrl(r.id))throw Error('Municipal notice is invalid, duplicated or outside the query.');
  ids.add(r.id);
  notices.push({id:r.id,title:r.title,issuingAgency:r.issuingAgency,noticeType:r.noticeType,kind:municipalKind(r.noticeType),publishedDate:r.publishedDate,dueLocal:r.dueLocal as string|null,pin:r.pin as string|null,vendor:r.vendor as string|null,contractAmount:r.contractAmount as number|null,selectionMethod:r.selectionMethod as string|null,sourceUrl:r.sourceUrl as string});
 }
 return {schemaVersion:1,source:MUNICIPAL_SOURCE,query:q,...window,fetchedAt:input.fetchedAt,sourceRows:input.sourceRows,withheld:input.withheld,duplicates:input.duplicates,nextPage:input.nextPage as number|null,scopeCapped:input.scopeCapped,notices};
}
