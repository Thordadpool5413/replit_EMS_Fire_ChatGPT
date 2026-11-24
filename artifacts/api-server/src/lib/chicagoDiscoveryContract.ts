/** Chicago awarded purchase orders and modifications. Not open bids, payments or fleet observations. */
import {MUNICIPAL_TOPICS,MUNICIPAL_TERMS,municipalDay,validLocalTimestamp,type MunicipalTopic} from './municipalDiscoveryContract';
export {MUNICIPAL_TOPICS};
export type {MunicipalTopic};
export const CHICAGO_SOURCE='chicago-contracts' as const;
export const CHICAGO_ENDPOINT='https://data.cityofchicago.org/resource/rsxa-ify5.json';
export const CHICAGO_DOCS='https://data.cityofchicago.org/Administration-Finance/Contracts/rsxa-ify5/about_data';
export const CHICAGO_PORTAL='https://webapps1.chicago.gov/vcsearch/home';
export const CHICAGO_FIELDS=['purchase_order_contract_number','revision_number','purchase_order_description','specification_number','contract_type','approval_date','start_date','end_date','department','vendor_name','award_amount'] as const;
export const CHICAGO_LIMIT=25,CHICAGO_MAX_PAGE=20;
export type ChicagoQuery={topic:MunicipalTopic;days:90|365|1095;page:number};
export type ChicagoRecord={key:string;contractNumber:string;revision:string|null;description:string;specification:string|null;contractType:string|null;approvalDay:string;startDay:string|null;endDay:string|null;department:string|null;vendor:string|null;amount:number|null;sourceUrl:string};
export type ChicagoPage={schemaVersion:1;source:typeof CHICAGO_SOURCE;query:ChicagoQuery;windowStart:string;windowEnd:string;fetchedAt:string;sourceRows:number;withheld:number;duplicates:number;nextPage:number|null;scopeCapped:boolean;records:ChicagoRecord[]};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&v.length<=n&&!!v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v:unknown,n:number)=>v===null||text(v,n);
const integer=(v:unknown):number|undefined=>typeof v==='number'&&Number.isInteger(v)?v:typeof v==='string'&&/^\d{1,4}$/.test(v)?Number(v):undefined;
export const chicagoIdentifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9 ._()/\-]{0,119}$/.test(v)&&v===v.trim();
export function chicagoWindow(days:ChicagoQuery['days'],now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(k:string)=>parts.find(p=>p.type===k)?.value??'';
 const windowEnd=part('year')+'-'+part('month')+'-'+part('day');
 return {windowEnd,windowStart:new Date(Date.parse(windowEnd)-(days-1)*86_400_000).toISOString().slice(0,10)};
}
export function parseChicagoQuery(v:unknown):ChicagoQuery|undefined{
 if(!obj(v)||Object.keys(v).some(k=>!['topic','days','page'].includes(k))||typeof v.topic!=='string'||!Object.hasOwn(MUNICIPAL_TOPICS,v.topic))return undefined;
 const days=integer(v.days),page=v.page===undefined?1:integer(v.page);
 if((days!==90&&days!==365&&days!==1095)||page===undefined||page<1||page>CHICAGO_MAX_PAGE)return undefined;
 return {topic:v.topic as MunicipalTopic,days,page};
}
export function chicagoMatches(description:string,topic:MunicipalTopic):boolean{
 const value=' '+description.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
 return MUNICIPAL_TERMS[topic].some(term=>value.includes(' '+term.replace(/[^a-z0-9]+/g,' ').trim()+' ')||value.includes(' '+term.replace(/[^a-z0-9]+/g,' ').trim()+'s '));
}
export function chicagoKey(number:string,revision:string|null){return JSON.stringify([number,revision]);}
export function chicagoRecordUrl(number:string,revision:string|null){
 if(!chicagoIdentifier(number)||(revision!==null&&!chicagoIdentifier(revision)))throw Error('Invalid purchase order identity.');
 const u=new URL(CHICAGO_ENDPOINT);
 u.searchParams.set('$select',CHICAGO_FIELDS.join(','));
 u.searchParams.set('$where',"purchase_order_contract_number = '"+number+"' AND "+(revision===null?'revision_number IS NULL':"revision_number = '"+revision+"'"));
 return u.toString();
}
export function chicagoDay(v:unknown):string|null{
 if(municipalDay(v))return v;
 return validLocalTimestamp(v)?v.slice(0,10):null;
}
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=CHICAGO_LIMIT;
export function validateChicagoPage(v:unknown,q:ChicagoQuery,now=Date.now()):ChicagoPage{
 if(!parseChicagoQuery(q)||!obj(v)||v.schemaVersion!==1||v.source!==CHICAGO_SOURCE||!obj(v.query)||v.query.topic!==q.topic||v.query.days!==q.days||v.query.page!==q.page||typeof v.fetchedAt!=='string'||!Number.isFinite(Date.parse(v.fetchedAt))||Date.parse(v.fetchedAt)>now+60_000||now-Date.parse(v.fetchedAt)>16*60_000)throw Error('Chicago response invalid, stale or out of scope.');
 const window=chicagoWindow(q.days,Date.parse(v.fetchedAt));
 if(v.windowStart!==window.windowStart||v.windowEnd!==window.windowEnd||!count(v.sourceRows)||!count(v.withheld)||!count(v.duplicates)||!Array.isArray(v.records)||v.records.length+v.withheld+v.duplicates!==v.sourceRows||typeof v.scopeCapped!=='boolean'||(v.nextPage!==null&&(q.page>=CHICAGO_MAX_PAGE||v.nextPage!==q.page+1||v.sourceRows!==CHICAGO_LIMIT))||(v.scopeCapped&&(q.page!==CHICAGO_MAX_PAGE||v.nextPage!==null||v.sourceRows!==CHICAGO_LIMIT)))throw Error('Chicago page counts are invalid.');
 const records:ChicagoRecord[]=[],keys=new Set<string>();
 for(const r of v.records){
  if(!obj(r)||!chicagoIdentifier(r.contractNumber)||(r.revision!==null&&!chicagoIdentifier(r.revision))||typeof r.key!=='string'||r.key!==chicagoKey(r.contractNumber,r.revision)||keys.has(r.key)||!text(r.description,1500)||!chicagoMatches(r.description,q.topic)||!optional(r.specification,160)||!optional(r.contractType,160)||!municipalDay(r.approvalDay)||r.approvalDay<window.windowStart||r.approvalDay>window.windowEnd||(r.startDay!==null&&!municipalDay(r.startDay))||(r.endDay!==null&&!municipalDay(r.endDay))||(typeof r.startDay==='string'&&typeof r.endDay==='string'&&r.endDay<r.startDay)||!optional(r.department,300)||!optional(r.vendor,300)||(r.amount!==null&&(typeof r.amount!=='number'||!Number.isFinite(r.amount)||Math.abs(r.amount)>1e15))||r.sourceUrl!==chicagoRecordUrl(r.contractNumber,r.revision))throw Error('Invalid or duplicate Chicago purchase order revision.');
  keys.add(r.key);records.push({key:r.key,contractNumber:r.contractNumber,revision:r.revision,description:r.description,specification:r.specification as string|null,contractType:r.contractType as string|null,approvalDay:r.approvalDay,startDay:r.startDay as string|null,endDay:r.endDay as string|null,department:r.department as string|null,vendor:r.vendor as string|null,amount:r.amount as number|null,sourceUrl:r.sourceUrl as string});
 }
 return {schemaVersion:1,source:CHICAGO_SOURCE,query:q,...window,fetchedAt:v.fetchedAt,sourceRows:v.sourceRows,withheld:v.withheld,duplicates:v.duplicates,nextPage:v.nextPage as number|null,scopeCapped:v.scopeCapped,records};
}
export function chicagoAmountNote(r:ChicagoRecord):string{
 if(r.amount===null)return 'Amount not reported.';
 if(r.amount<0)return 'Negative modification; not negative sales or a new award.';
 if(r.amount===0)return 'Zero reported. A blanket contract can be requirements-based; verify cancellation and terms.';
 return 'Reported row amount, not total contract value, spending or remaining funds.';
}
