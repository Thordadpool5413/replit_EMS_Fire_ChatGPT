import {timingSafeEqual} from 'node:crypto';
import {boundedJson} from './publicIntelligenceDiscovery';
import {SAM_ENDPOINT,SAM_LIMIT,SAM_MAX_OFFSET,SAM_STATES,SAM_TOPICS,parseSamQuery,samWindow,samType,samPostedDay,samDeadlineValue,samTitleMatches,samNoticeId,samNoticeUrl,validateSamPage,type SamQuery,type SamPage,type SamNotice} from './samDiscoveryContract';
export type SamConfig={apiKey:string;gatewayToken:string;dailyLimit:number};
const secret=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{16,256}$/.test(s);
export function readSamConfig(env:NodeJS.ProcessEnv):SamConfig|undefined{
 const apiKey=env.ATLAS_SAM_API_KEY,gatewayToken=env.ATLAS_SAM_GATEWAY_TOKEN;
 const dailyLimit=Number(env.ATLAS_SAM_DAILY_LIMIT??8);
 if(env.ATLAS_SAM_DISCOVERY_ENABLED!=='true'||!secret(apiKey)||!secret(gatewayToken)||gatewayToken.length<32||apiKey===gatewayToken||!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>1000)return undefined;
 return {apiKey,gatewayToken,dailyLimit};
}
/** Gateway injects this header only after authenticating a user; never publish the token in client code. */
export function authorizedSamGateway(config:SamConfig|undefined,header:unknown,fetchSite?:unknown):boolean{
 if(!config||typeof header!=='string'||header.length!==config.gatewayToken.length||fetchSite==='cross-site')return false;
 const expected=Buffer.from(config.gatewayToken),received=Buffer.from(header);
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
function mmdd(v:string){return v.slice(5,7)+'/'+v.slice(8,10)+'/'+v.slice(0,4);}
export function samRequest(q:SamQuery,apiKey:string,now=Date.now()):URL{
 if(!parseSamQuery(q)||!secret(apiKey))throw Error('Invalid SAM.gov query or server configuration.');
 const w=samWindow(q.days,now),u=new URL(SAM_ENDPOINT);
 u.searchParams.set('api_key',apiKey);
 u.searchParams.set('postedFrom',mmdd(w.windowStart));u.searchParams.set('postedTo',mmdd(w.windowEnd));
 u.searchParams.set('title',SAM_TOPICS[q.topic]);u.searchParams.set('ptype',q.noticeType);
 if(q.state!=='all')u.searchParams.set('state',q.state);
 u.searchParams.set('limit',String(SAM_LIMIT));u.searchParams.set('offset',String(q.offset));
 return u;
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const opt=(v:unknown,n:number):string|null=>str(v,n)?v.trim():null;
export function normalizeSamDiscovery(payload:unknown,q:SamQuery,now=Date.now()):SamPage{
 if(!parseSamQuery(q)||!obj(payload)||!Array.isArray(payload.opportunitiesData)||payload.opportunitiesData.length>SAM_LIMIT||payload.limit!==SAM_LIMIT||payload.offset!==q.offset||typeof payload.totalRecords!=='number'||!Number.isSafeInteger(payload.totalRecords)||payload.totalRecords<0)throw Error('SAM.gov returned an invalid bounded page.');
 const window=samWindow(q.days,now);
 const byId=new Map<string,SamNotice>(),conflicts=new Set<string>();let duplicates=0;
 for(const r of payload.opportunitiesData){
  if(!obj(r)||!samNoticeId(r.noticeId)||!str(r.title,500)||!samTitleMatches(r.title,q)||!str(r.solicitationNumber,240)||samType(r.type)!==q.noticeType)continue;
  const postedDate=samPostedDay(r.postedDate);
  if(!postedDate||postedDate<window.windowStart||postedDate>window.windowEnd)continue;
  const place=obj(r.placeOfPerformance)?r.placeOfPerformance:undefined;
  const country=place&&obj(place.country)?place.country.code:undefined;
  const state=place&&obj(place.state)?place.state.code:undefined;
  const performanceCountry=typeof country==='string'&&/^[A-Z]{3}$/.test(country)?country:null;
  const performanceState=performanceCountry==='USA'&&typeof state==='string'&&SAM_STATES.includes(state)?state:null;
  if(q.state!=='all'&&(performanceState!==q.state||performanceCountry!=='USA'))continue;
  const id=r.noticeId.toLowerCase();
  const notice:SamNotice={id,title:r.title.trim(),solicitationNumber:r.solicitationNumber.trim(),organization:opt(r.fullParentPathName,500)??opt(r.department,500),noticeType:q.noticeType,postedDate,deadline:samDeadlineValue(r.responseDeadLine),active:r.active==='Yes'||r.active==='No'?r.active:null,performanceState,performanceCountry,setAside:opt(r.typeOfSetAsideDescription,240),naics:typeof r.naicsCode==='string'&&/^\d{2,6}$/.test(r.naicsCode)?r.naicsCode:null,classification:typeof r.classificationCode==='string'&&/^[A-Z0-9]{1,8}$/.test(r.classificationCode)?r.classificationCode:null,sourceUrl:samNoticeUrl(id)};
  const prior=byId.get(id);
  if(prior){if(JSON.stringify(prior)===JSON.stringify(notice))duplicates++;else conflicts.add(id);}
  else byId.set(id,notice);
 }
 const notices=[...byId.values()].filter(n=>!conflicts.has(n.id)),sourceRows=payload.opportunitiesData.length,more=payload.totalRecords>(q.offset+1)*SAM_LIMIT;
 return validateSamPage({schemaVersion:1,source:'sam-gov',query:q,...window,fetchedAt:new Date(now).toISOString(),sourceRows,totalReported:payload.totalRecords,withheld:sourceRows-notices.length-duplicates,duplicates,nextOffset:more&&q.offset<SAM_MAX_OFFSET?q.offset+1:null,scopeCapped:more&&q.offset===SAM_MAX_OFFSET,notices},q,now);
}
export class SamDiscoveryError extends Error{
 constructor(readonly category:'quota'|'unavailable'){super(category==='quota'?'SAM.gov request budget reached.':'SAM.gov discovery unavailable.');}
}
export async function fetchSamDiscovery(q:SamQuery,key:string,fetcher:typeof fetch=fetch,now=Date.now()):Promise<SamPage>{
 try{
  const response=await fetcher(samRequest(q,key,now),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
  if(response.status===429)throw new SamDiscoveryError('quota');
  const page=normalizeSamDiscovery(await boundedJson(response,'SAM.gov'),q,now);
  if(JSON.stringify(page).includes(key))throw new Error('Sensitive upstream data.');
  return page;
 }catch(error){
  // Neither fetch errors nor upstream response bodies/URLs may reach logs or the browser.
  throw error instanceof SamDiscoveryError?error:new SamDiscoveryError('unavailable');
 }
}
export function createSamDiscoveryService(config:SamConfig,fetcher:typeof fetch=fetch,clock=Date.now){
 const cache=new Map<string,{page:SamPage;expires:number}>(),inFlight=new Map<string,Promise<SamPage>>();
 let day='',used=0,blockedDay='';
 return async(q:SamQuery):Promise<SamPage>=>{
  if(!parseSamQuery(q))throw new SamDiscoveryError('unavailable');
  const now=clock(),today=new Date(now).toISOString().slice(0,10);
  if(day!==today){day=today;used=0;cache.clear();}
  const key=JSON.stringify([q,today]),cached=cache.get(key);
  if(cached&&cached.expires>now)return cached.page;
  if(cached)cache.delete(key);
  const existing=inFlight.get(key);if(existing)return existing;
  if(blockedDay===today||used>=config.dailyLimit||inFlight.size>=2)throw new SamDiscoveryError('quota');
  used++;
  const pending=fetchSamDiscovery(q,config.apiKey,fetcher,now).then(page=>{
   if(cache.size>=60){const oldest=cache.keys().next().value;if(oldest!==undefined)cache.delete(oldest);}
   cache.set(key,{page,expires:clock()+15*60_000});return page;
  }).catch(error=>{if(error instanceof SamDiscoveryError&&error.category==='quota')blockedDay=today;throw error;}).finally(()=>inFlight.delete(key));
  inFlight.set(key,pending);return pending;
 };
}
