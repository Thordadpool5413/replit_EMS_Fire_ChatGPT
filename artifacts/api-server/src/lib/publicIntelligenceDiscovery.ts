/** Read-only public-source discovery. The OpenFEMA source has fiscal years,
 * not exact award dates or equipment inventory; candidates never become facts. */
export const FEMA_DISCOVERY_ENDPOINT='https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants';
export const FEMA_DISCOVERY_DOCS='https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1';
export const DISCOVERY_STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const DISCOVERY_PAGE_SIZE=50;
const MAX_OFFSET=950;
const MAX_BYTES=2_000_000;
const CACHE_TTL=15*60_000;
export type DiscoveryQuery={state:string;fromYear:number;offset:number};
export type DiscoveryCandidate={id:string;awardNumber:string;recipient:string;state:string;program:string;fiscalYear:number;awardAmount:number|null;documentDate:null;sourceUrl:string};
export type DiscoveryPage={schemaVersion:1;source:'openfema-afg';query:DiscoveryQuery;sourceUrl:string;documentationUrl:string;fetchedAt:string;sourceRows:number;withheld:number;duplicates:number;nextOffset:number|null;scopeCapped:boolean;candidates:DiscoveryCandidate[]};
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const safeText=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v:unknown):number|undefined=>{
 if(typeof v==='number'&&Number.isInteger(v))return v;
 if(typeof v==='string'&&/^\d{1,4}$/.test(v))return Number(v);
};
export function parseDiscoveryQuery(input:unknown,now=Date.now()):DiscoveryQuery|undefined{
 if(!isRecord(input)||Object.keys(input).some(k=>!['state','fromYear','offset'].includes(k)))return;
 const state=input.state,year=integer(input.fromYear),offset=input.offset===undefined?0:integer(input.offset);
 if(typeof state!=='string'||!DISCOVERY_STATES.includes(state)||year===undefined||year<2010||year>new Date(now).getUTCFullYear()+1||offset===undefined||offset<0||offset>MAX_OFFSET||offset%DISCOVERY_PAGE_SIZE!==0)return;
 return {state,fromYear:year,offset};
}
export function femaDiscoveryUrl(q:DiscoveryQuery):URL{
 const url=new URL(FEMA_DISCOVERY_ENDPOINT);
 url.searchParams.set('$filter',"vendorState eq '"+q.state+"' and fiscalYear ge "+q.fromYear+" and startswith(programName,'Assistance to Firefighters')");
 url.searchParams.set('$orderby','fiscalYear desc,awardNumber asc,id asc');
 url.searchParams.set('$select','id,awardNumber,vendorName,vendorState,programName,fiscalYear,awardAmount');
 url.searchParams.set('$top',String(DISCOVERY_PAGE_SIZE+1));
 url.searchParams.set('$skip',String(q.offset));
 return url;
}
function parseAmount(v:unknown):number|null{
 if(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12)return v;
 if(typeof v==='string'&&/^-?\d{1,12}(\.\d{1,2})?$/.test(v))return Number(v);
 return null;
}
export function normalizeFemaDiscovery(payload:unknown,q:DiscoveryQuery,now=Date.now()):DiscoveryPage{
 const sourceUrl=femaDiscoveryUrl(q).toString();
 if(!isRecord(payload)||!Array.isArray(payload.NonDisasterAssistanceFirefighterGrants))throw Error('OpenFEMA response schema did not match the documented dataset.');
 const raw:unknown[]=payload.NonDisasterAssistanceFirefighterGrants;
 if(raw.length>DISCOVERY_PAGE_SIZE+1)throw Error('OpenFEMA exceeded the bounded page size.');
 const byId=new Map<string,DiscoveryCandidate>(),conflicts=new Set<string>();
 let invalid=0,duplicates=0;
 for(const r of raw.slice(0,DISCOVERY_PAGE_SIZE)){
  if(!isRecord(r)||!safeText(r.id,100)||!/^[A-Za-z0-9_-]+$/.test(r.id)||!safeText(r.awardNumber,160)||!safeText(r.vendorName,240)||r.vendorState!==q.state||!safeText(r.programName,240)||!/^Assistance to Firefighters\b/i.test(r.programName)){invalid++;continue;}
  const year=integer(r.fiscalYear);
  if(year===undefined||year<q.fromYear||year>new Date(now).getUTCFullYear()+1){invalid++;continue;}
  const candidate:DiscoveryCandidate={id:r.id,awardNumber:r.awardNumber.trim(),recipient:r.vendorName.trim(),state:q.state,program:r.programName.trim(),fiscalYear:year,awardAmount:parseAmount(r.awardAmount),documentDate:null,sourceUrl};
  const previous=byId.get(candidate.id);
  if(previous){
   if(JSON.stringify(previous)===JSON.stringify(candidate))duplicates++;
   else conflicts.add(candidate.id);
  }else byId.set(candidate.id,candidate);
 }
 // Conflicting IDs are withheld in full; no invented ID or replacement.
 const candidates=[...byId.values()].filter(c=>!conflicts.has(c.id));
 const sourceRows=Math.min(raw.length,DISCOVERY_PAGE_SIZE);
 // Count every row not returned as either a withheld row or exact duplicate.
 const withheld=sourceRows-candidates.length-duplicates;
 const more=raw.length>DISCOVERY_PAGE_SIZE;
 return {schemaVersion:1,source:'openfema-afg',query:q,sourceUrl,documentationUrl:FEMA_DISCOVERY_DOCS,fetchedAt:new Date(now).toISOString(),sourceRows,withheld:Math.max(invalid,withheld),duplicates,nextOffset:more&&q.offset<MAX_OFFSET?q.offset+DISCOVERY_PAGE_SIZE:null,scopeCapped:more&&q.offset===MAX_OFFSET,candidates};
}
async function boundedJson(response:Response):Promise<unknown>{
 if(!response.ok)throw Error('OpenFEMA returned HTTP '+response.status+'.');
 if(!/application\/(?:[\w.+-]*\+)?json/i.test(response.headers.get('content-type')??''))throw Error('OpenFEMA did not return JSON.');
 if(Number(response.headers.get('content-length')??0)>MAX_BYTES||!response.body)throw Error('OpenFEMA response exceeds the size limit or is missing.');
 const reader=response.body.getReader();const decoder=new TextDecoder();let bytes=0,text='';
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error('OpenFEMA response exceeded the size limit.');}text+=decoder.decode(value,{stream:true});}
  return JSON.parse(text+decoder.decode());
 }finally{reader.releaseLock();}
}
export async function fetchFemaDiscovery(q:DiscoveryQuery,fetcher:typeof fetch=fetch,now=Date.now()):Promise<DiscoveryPage>{
 if(!parseDiscoveryQuery(q,now))throw Error('Invalid discovery query.');
 const response=await fetcher(femaDiscoveryUrl(q),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
 return normalizeFemaDiscovery(await boundedJson(response),q,now);
}
/** Bounded process-local caching and request coalescing; never serve old data as a fresh fetch. */
export function createFemaDiscoveryService(fetcher:typeof fetch=fetch,clock=Date.now){
 const cache=new Map<string,{page:DiscoveryPage;expires:number}>();
 const inFlight=new Map<string,Promise<DiscoveryPage>>();
 return async(q:DiscoveryQuery):Promise<DiscoveryPage>=>{
  const now=clock(),key=JSON.stringify(q),cached=cache.get(key);
  if(cached&&cached.expires>now)return cached.page;
  if(cached)cache.delete(key);
  const active=inFlight.get(key);if(active)return active;
  if(inFlight.size>=4)throw Error('Discovery is busy. Retry shortly.');
  const pending=fetchFemaDiscovery(q,fetcher,now).then(page=>{
   if(cache.size>=60){const oldest=cache.keys().next().value;if(oldest!==undefined)cache.delete(oldest);}
   cache.set(key,{page,expires:clock()+CACHE_TTL});return page;
  }).finally(()=>inFlight.delete(key));
  inFlight.set(key,pending);return pending;
 };
}
