import {boundedJson} from './publicIntelligenceDiscovery';
import {FEDERAL_ENDPOINT,FEDERAL_PAGE_SIZE,FEDERAL_MAX_PAGE,parseFederalQuery,validateFederalPage,federalAwardUrl,type FederalQuery,type FederalPage,type FederalCandidate} from './federalDiscoveryContract';
const keywords={defibrillator:'defibrillator',resuscitation:'resuscitation',ventilator:'ventilator',ambulance:'ambulance',epcr:'patient care reporting'} as const;
export function federalRequest(q:FederalQuery,now=Date.now()){
 if(!parseFederalQuery(q,now))throw Error('Invalid federal query.');
 const grant=q.topic==='grants';
 const throughDate=new Date(now).toISOString().slice(0,10);
 const filters={award_type_codes:grant?['02','03','04','05']:['A','B','C','D'],time_period:[{start_date:q.fromYear+'-01-01',end_date:throughDate}],recipient_locations:[{country:'USA',state:q.state}],...(q.topic==='grants'?{program_numbers:['97.044']}:{keywords:[keywords[q.topic]]})};
 return {filters,fields:['Award ID','Recipient Name','Recipient Location','Awarding Agency','Description','Start Date','End Date','Award Amount',...(grant?['primary_assistance_listing']:['Contract Award Type'])],page:q.page,limit:FEDERAL_PAGE_SIZE,sort:'Award Amount',order:'desc',spending_level:'awards'};
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v:unknown,n:number):string|null=>str(v,n)?v.trim():null;
const date=(v:unknown):string|null=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:null;
export function normalizeFederalDiscovery(payload:unknown,q:FederalQuery,now=Date.now()):FederalPage{
 if(!parseFederalQuery(q,now)||!obj(payload)||!Array.isArray(payload.results)||payload.results.length>FEDERAL_PAGE_SIZE||payload.limit!==FEDERAL_PAGE_SIZE||!obj(payload.page_metadata)||payload.page_metadata.page!==q.page||typeof payload.page_metadata.hasNext!=='boolean'||(payload.page_metadata.hasNext&&payload.results.length!==FEDERAL_PAGE_SIZE)||(payload.messages!==undefined&&(!Array.isArray(payload.messages)||payload.messages.length>FEDERAL_PAGE_SIZE||payload.messages.some(v=>typeof v!=='string'))))throw Error('USAspending response did not match the expected award page.');
 const kind=q.topic==='grants'?'grant':'contract',byId=new Map<string,FederalCandidate>(),conflicts=new Set<string>();
 let duplicates=0;
 for(const r of payload.results){
  if(!obj(r))continue;
  const id=r.generated_internal_id,awardNumber=r['Award ID'],recipient=r['Recipient Name'],loc=r['Recipient Location'],listing=r.primary_assistance_listing;
  if(!str(id,240)||!/^[A-Za-z0-9_-]+$/.test(id)||!id.startsWith(kind==='grant'?'ASST_NON_':'CONT_AWD_')||!str(awardNumber,240)||!str(recipient,300)||!obj(loc)||loc.location_country_code!=='USA'||loc.state_code!==q.state)continue;
  if(kind==='grant'&&(!obj(listing)||listing.cfda_number!=='97.044'))continue;
  const startDate=date(r['Start Date']),endDate=date(r['End Date']);
  if(startDate&&endDate&&endDate<startDate)continue;
  const amount=r['Award Amount'];
  const candidate:FederalCandidate={id,awardNumber:awardNumber.trim(),recipient:recipient.trim(),state:q.state,kind,city:optional(loc.city_name,160),awardingAgency:optional(r['Awarding Agency'],240),description:optional(r.Description,4000),startDate,endDate,awardAmount:typeof amount==='number'&&Number.isFinite(amount)&&Math.abs(amount)<=1e15?amount:null,sourceUrl:federalAwardUrl(id)};
  const previous=byId.get(id);
  if(previous){if(JSON.stringify(previous)===JSON.stringify(candidate))duplicates++;else conflicts.add(id);}
  else byId.set(id,candidate);
 }
 const candidates=[...byId.values()].filter(c=>!conflicts.has(c.id)),sourceRows=payload.results.length;
 const more=payload.page_metadata.hasNext;
 return validateFederalPage({schemaVersion:1,source:'usaspending',query:q,throughDate:new Date(now).toISOString().slice(0,10),fetchedAt:new Date(now).toISOString(),sourceRows,withheld:sourceRows-candidates.length-duplicates,duplicates,warnings:Array.isArray(payload.messages)?payload.messages.length:0,nextPage:more&&q.page<FEDERAL_MAX_PAGE?q.page+1:null,scopeCapped:more&&q.page===FEDERAL_MAX_PAGE,candidates},q,now);
}
export async function fetchFederalDiscovery(q:FederalQuery,fetcher:typeof fetch=fetch,now=Date.now()):Promise<FederalPage>{
 const body=federalRequest(q,now);
 const response=await fetcher(FEDERAL_ENDPOINT,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15_000)});
 return normalizeFederalDiscovery(await boundedJson(response,'USAspending'),q,now);
}
export function createFederalDiscoveryService(fetcher:typeof fetch=fetch,clock=Date.now){
 const cache=new Map<string,{page:FederalPage;expires:number}>(),inFlight=new Map<string,Promise<FederalPage>>();
 return async(q:FederalQuery):Promise<FederalPage>=>{
  const now=clock();
  if(!parseFederalQuery(q,now))throw Error('Invalid federal query.');
  const key=JSON.stringify([q,new Date(now).toISOString().slice(0,10)]),cached=cache.get(key);
  if(cached&&cached.expires>now)return cached.page;
  if(cached)cache.delete(key);
  const active=inFlight.get(key);if(active)return active;
  if(inFlight.size>=4)throw Error('Federal discovery is busy.');
  const pending=fetchFederalDiscovery(q,fetcher,now).then(page=>{
   if(cache.size>=60){const oldest=cache.keys().next().value;if(oldest!==undefined)cache.delete(oldest);}
   cache.set(key,{page,expires:clock()+15*60_000});return page;
  }).finally(()=>inFlight.delete(key));
  inFlight.set(key,pending);return pending;
 };
}
