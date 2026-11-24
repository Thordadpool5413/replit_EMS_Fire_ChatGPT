import {boundedJson} from './publicIntelligenceDiscovery';
import {MUNICIPAL_TERMS} from './municipalDiscoveryContract';
import {CHICAGO_SOURCE,CHICAGO_ENDPOINT,CHICAGO_FIELDS,CHICAGO_LIMIT,CHICAGO_MAX_PAGE,parseChicagoQuery,chicagoWindow,chicagoIdentifier,chicagoKey,chicagoDay,chicagoMatches,chicagoRecordUrl,validateChicagoPage,type ChicagoQuery,type ChicagoPage,type ChicagoRecord} from './chicagoDiscoveryContract';
export function chicagoRequest(q:ChicagoQuery,now=Date.now()){
 if(!parseChicagoQuery(q))throw Error('Invalid Chicago query.');
 const {windowStart,windowEnd}=chicagoWindow(q.days,now);
 const u=new URL(CHICAGO_ENDPOINT),terms=MUNICIPAL_TERMS[q.topic].map(t=>"lower(purchase_order_description) like '%"+t+"%'").join(' OR ');
 u.searchParams.set('$select',CHICAGO_FIELDS.join(','));
 u.searchParams.set('$where',"approval_date >= '"+windowStart+"T00:00:00' AND approval_date <= '"+windowEnd+"T23:59:59.999' AND ("+terms+")");
 u.searchParams.set('$order','approval_date DESC, purchase_order_contract_number ASC, revision_number ASC, vendor_name ASC, :id ASC');
 u.searchParams.set('$limit',String(CHICAGO_LIMIT+1));u.searchParams.set('$offset',String((q.page-1)*CHICAGO_LIMIT));return u;
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const optional=(v:unknown,n:number):string|null=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():null;
function amount(v:unknown):number|null{
 const n=typeof v==='number'?v:typeof v==='string'&&/^-?\d{1,15}(?:\.\d{1,4})?$/.test(v)?Number(v):NaN;
 return Number.isFinite(n)&&Math.abs(n)<=1e15?n:null;
}
export function normalizeChicagoDiscovery(payload:unknown,q:ChicagoQuery,now=Date.now()):ChicagoPage{
 if(!parseChicagoQuery(q)||!Array.isArray(payload)||payload.length>CHICAGO_LIMIT+1)throw Error('Unexpected Chicago response schema.');
 const window=chicagoWindow(q.days,now),rows=new Map<string,ChicagoRecord>(),conflicts=new Set<string>();let duplicates=0;
 for(const r of payload.slice(0,CHICAGO_LIMIT)){
  if(!obj(r))continue;
  const number=r.purchase_order_contract_number,revision=r.revision_number??null,description=optional(r.purchase_order_description,1500),approvalDay=chicagoDay(r.approval_date),startDay=chicagoDay(r.start_date),endDay=chicagoDay(r.end_date);
  if(!chicagoIdentifier(number)||(revision!==null&&!chicagoIdentifier(revision))||!description||!chicagoMatches(description,q.topic)||!approvalDay||approvalDay<window.windowStart||approvalDay>window.windowEnd||startDay&&endDay&&endDay<startDay)continue;
  const key=chicagoKey(number,revision),record:ChicagoRecord={key,contractNumber:number,revision,description,specification:optional(r.specification_number,160),contractType:optional(r.contract_type,160),approvalDay,startDay,endDay,department:optional(r.department,300),vendor:optional(r.vendor_name,300),amount:amount(r.award_amount),sourceUrl:chicagoRecordUrl(number,revision)};
  const previous=rows.get(key);
  if(previous){if(JSON.stringify(previous)===JSON.stringify(record))duplicates++;else conflicts.add(key);}else rows.set(key,record);
 }
 const records=[...rows.values()].filter(r=>!conflicts.has(r.key)),sourceRows=Math.min(payload.length,CHICAGO_LIMIT),more=payload.length>CHICAGO_LIMIT;
 return validateChicagoPage({schemaVersion:1,source:CHICAGO_SOURCE,query:q,...window,fetchedAt:new Date(now).toISOString(),sourceRows,withheld:sourceRows-records.length-duplicates,duplicates,nextPage:more&&q.page<CHICAGO_MAX_PAGE?q.page+1:null,scopeCapped:more&&q.page===CHICAGO_MAX_PAGE,records},q,now);
}
export async function fetchChicagoDiscovery(q:ChicagoQuery,fetcher:typeof fetch=fetch,now=Date.now()){
 const response=await fetcher(chicagoRequest(q,now),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
 return normalizeChicagoDiscovery(await boundedJson(response,'Chicago Contracts'),q,now);
}
export function createChicagoDiscoveryService(fetcher:typeof fetch=fetch,clock=Date.now){
 const cache=new Map<string,{page:ChicagoPage;expires:number}>(),pending=new Map<string,Promise<ChicagoPage>>();
 return async(q:ChicagoQuery):Promise<ChicagoPage>=>{
  if(!parseChicagoQuery(q))throw Error('Invalid Chicago query.');
  const now=clock(),key=JSON.stringify([q,chicagoWindow(q.days,now)]),old=cache.get(key);
  if(old&&old.expires>now)return old.page;
  if(old)cache.delete(key);
  const running=pending.get(key);if(running)return running;
  if(pending.size>=4)throw Error('Chicago discovery is busy.');
  const task=fetchChicagoDiscovery(q,fetcher,now).then(page=>{if(cache.size>=60){const first=cache.keys().next().value;if(first!==undefined)cache.delete(first);}cache.set(key,{page,expires:clock()+15*60_000});return page;}).finally(()=>pending.delete(key));
  pending.set(key,task);return task;
 };
}
