import {boundedJson} from './publicIntelligenceDiscovery';
import {MUNICIPAL_SOURCE,MUNICIPAL_ENDPOINT,MUNICIPAL_TERMS,MUNICIPAL_FIELDS,MUNICIPAL_PAGE_SIZE,MUNICIPAL_MAX_PAGE,parseMunicipalQuery,municipalWindow,municipalKind,municipalNoticeUrl,municipalDay,validLocalTimestamp,titleMatches,validateMunicipalPage,type MunicipalQuery,type MunicipalNotice,type MunicipalPage} from './municipalDiscoveryContract';
export function municipalRequest(q:MunicipalQuery,now=Date.now()):URL{
 if(!parseMunicipalQuery(q))throw Error('Invalid municipal query.');
 const {windowStart,windowEnd}=municipalWindow(q.days,now);
 const terms=MUNICIPAL_TERMS[q.topic].map(term=>"lower(short_title) like '%"+term+"%'").join(' OR ');
 const u=new URL(MUNICIPAL_ENDPOINT);
 u.searchParams.set('$select',MUNICIPAL_FIELDS.join(','));
 u.searchParams.set('$where',"lower(section_name) = 'procurement' AND start_date >= '"+windowStart+"T00:00:00' AND start_date <= '"+windowEnd+"T23:59:59.999' AND ("+terms+")");
 u.searchParams.set('$order','start_date DESC, request_id DESC');
 u.searchParams.set('$limit',String(MUNICIPAL_PAGE_SIZE+1));
 u.searchParams.set('$offset',String((q.page-1)*MUNICIPAL_PAGE_SIZE));
 return u;
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v:unknown,max:number):string|null=>str(v,max)?v.trim():null;
function amount(v:unknown):number|null{
 const n=typeof v==='number'?v:typeof v==='string'&&/^\d{1,15}(?:\.\d{1,4})?$/.test(v)?Number(v):NaN;
 return Number.isFinite(n)&&n>=0&&n<=1e15?n:null;
}
export function normalizeMunicipalDiscovery(payload:unknown,q:MunicipalQuery,now=Date.now()):MunicipalPage{
 if(!parseMunicipalQuery(q)||!Array.isArray(payload)||payload.length>MUNICIPAL_PAGE_SIZE+1)throw Error('City Record response did not match the expected bounded notice page.');
 const window=municipalWindow(q.days,now);
 const byId=new Map<string,MunicipalNotice>(),conflicts=new Set<string>();let duplicates=0;
 for(const r of payload.slice(0,MUNICIPAL_PAGE_SIZE)){
  if(!obj(r)||!str(r.section_name,120)||r.section_name.trim().toLowerCase()!=='procurement'||!str(r.short_title,500)||!titleMatches(r.short_title,q.topic)||!str(r.agency_name,240)||!str(r.type_of_notice_description,120))continue;
  const id=typeof r.request_id==='number'&&Number.isSafeInteger(r.request_id)?String(r.request_id):r.request_id;
  if(typeof id!=='string'||!/^[1-9]\d{0,14}$/.test(id))continue;
  const publishedDate=validLocalTimestamp(r.start_date)?r.start_date.slice(0,10):r.start_date;
  if(!municipalDay(publishedDate)||publishedDate<window.windowStart||publishedDate>window.windowEnd)continue;
  const notice:MunicipalNotice={id,title:r.short_title.trim(),issuingAgency:r.agency_name.trim(),noticeType:r.type_of_notice_description.trim(),kind:municipalKind(r.type_of_notice_description),publishedDate,dueLocal:validLocalTimestamp(r.due_date)?r.due_date:null,pin:optional(r.pin,160),vendor:optional(r.vendor_name,300),contractAmount:amount(r.contract_amount),selectionMethod:optional(r.selection_method_description,240),sourceUrl:municipalNoticeUrl(id)};
  const previous=byId.get(id);
  if(previous){if(JSON.stringify(previous)===JSON.stringify(notice))duplicates++;else conflicts.add(id);}
  else byId.set(id,notice);
 }
 const notices=[...byId.values()].filter(n=>!conflicts.has(n.id)),sourceRows=Math.min(payload.length,MUNICIPAL_PAGE_SIZE),more=payload.length>MUNICIPAL_PAGE_SIZE;
 return validateMunicipalPage({schemaVersion:1,source:MUNICIPAL_SOURCE,query:q,...window,fetchedAt:new Date(now).toISOString(),sourceRows,withheld:sourceRows-notices.length-duplicates,duplicates,nextPage:more&&q.page<MUNICIPAL_MAX_PAGE?q.page+1:null,scopeCapped:more&&q.page===MUNICIPAL_MAX_PAGE,notices},q,now);
}
export async function fetchMunicipalDiscovery(q:MunicipalQuery,fetcher:typeof fetch=fetch,now=Date.now()):Promise<MunicipalPage>{
 const response=await fetcher(municipalRequest(q,now),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
 return normalizeMunicipalDiscovery(await boundedJson(response,'NYC City Record'),q,now);
}
export function createMunicipalDiscoveryService(fetcher:typeof fetch=fetch,clock=Date.now){
 const cache=new Map<string,{page:MunicipalPage;expires:number}>(),inFlight=new Map<string,Promise<MunicipalPage>>();
 return async(q:MunicipalQuery):Promise<MunicipalPage>=>{
  if(!parseMunicipalQuery(q))throw Error('Invalid municipal query.');
  const now=clock(),key=JSON.stringify([q,municipalWindow(q.days,now)]),cached=cache.get(key);
  if(cached&&cached.expires>now)return cached.page;
  if(cached)cache.delete(key);
  const active=inFlight.get(key);if(active)return active;
  if(inFlight.size>=4)throw Error('Municipal discovery is busy.');
  const pending=fetchMunicipalDiscovery(q,fetcher,now).then(page=>{
   if(cache.size>=60){const oldest=cache.keys().next().value;if(oldest!==undefined)cache.delete(oldest);}
   cache.set(key,{page,expires:clock()+15*60_000});return page;
  }).finally(()=>inFlight.delete(key));
  inFlight.set(key,pending);return pending;
 };
}
