/** Federal award discovery contract. These are research candidates, not agency evidence. */
export const FEDERAL_ENDPOINT='https://api.usaspending.gov/api/v2/search/spending_by_award/';
export const FEDERAL_DOCS='https://api.usaspending.gov/docs/endpoints';
export const FEDERAL_TOPICS={grants:'Firefighter assistance (97.044)',defibrillator:'Defibrillators',resuscitation:'Resuscitation equipment',ventilator:'Ventilators',ambulance:'Ambulances',epcr:'Electronic patient care reporting'} as const;
export type FederalTopic=keyof typeof FEDERAL_TOPICS;
export type FederalQuery={state:string;fromYear:number;topic:FederalTopic;page:number};
export type FederalCandidate={id:string;awardNumber:string;recipient:string;state:string;city:string|null;kind:'grant'|'contract';awardingAgency:string|null;description:string|null;startDate:string|null;endDate:string|null;awardAmount:number|null;sourceUrl:string};
export type FederalPage={schemaVersion:1;source:'usaspending';query:FederalQuery;throughDate:string;fetchedAt:string;sourceRows:number;withheld:number;duplicates:number;warnings:number;nextPage:number|null;scopeCapped:boolean;candidates:FederalCandidate[]};
export const FEDERAL_PAGE_SIZE=25, FEDERAL_MAX_PAGE=20;
export const FEDERAL_STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const nullableText=(v:unknown,n:number):string|null=>text(v,n)?v.trim():null;
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const dateOrNull=(v:unknown):string|null=>day(v)?v:null;
const amount=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e15?v:null;
const integer=(v:unknown):number|undefined=>typeof v==='number'&&Number.isInteger(v)?v:typeof v==='string'&&/^\d{1,4}$/.test(v)?Number(v):undefined;
const boundedCount=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=FEDERAL_PAGE_SIZE;
const idOk=(v:unknown,kind:'grant'|'contract'):v is string=>typeof v==='string'&&v.length<=240&&/^[A-Za-z0-9_-]+$/.test(v)&&v.startsWith(kind==='grant'?'ASST_NON_':'CONT_AWD_');
export function federalAwardUrl(id:string){return 'https://www.usaspending.gov/award/'+encodeURIComponent(id);}
export function parseFederalQuery(input:unknown,now=Date.now()):FederalQuery|undefined{
 if(!object(input)||Object.keys(input).some(k=>!['state','fromYear','topic','page'].includes(k)))return undefined;
 const {state,topic}=input,fromYear=integer(input.fromYear),page=input.page===undefined?1:integer(input.page);
 if(typeof state!=='string'||!FEDERAL_STATES.includes(state)||typeof topic!=='string'||!Object.hasOwn(FEDERAL_TOPICS,topic)||fromYear===undefined||fromYear<2010||fromYear>new Date(now).getUTCFullYear()||page===undefined||page<1||page>FEDERAL_MAX_PAGE)return undefined;
 return {state,fromYear,topic:topic as FederalTopic,page};
}
/** Verify the entire bounded response before rendering any candidate. */
export function validateFederalPage(input:unknown,q:FederalQuery,now=Date.now()):FederalPage{
 if(!parseFederalQuery(q,now)||!object(input)||input.schemaVersion!==1||input.source!=='usaspending'||!object(input.query)||input.query.state!==q.state||input.query.fromYear!==q.fromYear||input.query.topic!==q.topic||input.query.page!==q.page||!day(input.throughDate)||input.throughDate<q.fromYear+'-01-01'||input.throughDate>new Date(now+60_000).toISOString().slice(0,10)||typeof input.fetchedAt!=='string'||!Number.isFinite(Date.parse(input.fetchedAt))||Date.parse(input.fetchedAt)>now+60_000||now-Date.parse(input.fetchedAt)>16*60_000||input.throughDate!==new Date(input.fetchedAt).toISOString().slice(0,10)||!boundedCount(input.sourceRows)||!boundedCount(input.withheld)||!boundedCount(input.duplicates)||!Array.isArray(input.candidates)||input.candidates.length+input.withheld+input.duplicates!==input.sourceRows||!boundedCount(input.warnings)||typeof input.scopeCapped!=='boolean'||(input.nextPage!==null&&(q.page>=FEDERAL_MAX_PAGE||input.nextPage!==q.page+1))||(input.scopeCapped&&(q.page!==FEDERAL_MAX_PAGE||input.nextPage!==null)))throw Error('Federal discovery response is invalid, stale or out of scope.');
 const ids=new Set<string>(),candidates:FederalCandidate[]=[];
 const kind=q.topic==='grants'?'grant':'contract';
 for(const r of input.candidates){
  if(!object(r)||r.kind!==kind||!idOk(r.id,kind)||ids.has(r.id)||!text(r.awardNumber,240)||!text(r.recipient,300)||r.state!==q.state||(r.city!==null&&!text(r.city,160))||(r.awardingAgency!==null&&!text(r.awardingAgency,240))||(r.description!==null&&!text(r.description,4000))||(r.startDate!==null&&!day(r.startDate))||(r.endDate!==null&&!day(r.endDate))||(typeof r.startDate==='string'&&typeof r.endDate==='string'&&r.endDate<r.startDate)||(r.awardAmount!==null&&amount(r.awardAmount)===null)||r.sourceUrl!==federalAwardUrl(r.id))throw Error('Federal award candidate is invalid or duplicated.');
  ids.add(r.id);candidates.push({id:r.id,awardNumber:r.awardNumber,recipient:r.recipient,state:q.state,kind,city:r.city as string|null,awardingAgency:r.awardingAgency as string|null,description:r.description as string|null,startDate:r.startDate as string|null,endDate:r.endDate as string|null,awardAmount:r.awardAmount as number|null,sourceUrl:r.sourceUrl as string});
 }
 return {schemaVersion:1,source:'usaspending',query:q,throughDate:input.throughDate,fetchedAt:input.fetchedAt,sourceRows:input.sourceRows,withheld:input.withheld,duplicates:input.duplicates,warnings:input.warnings,nextPage:input.nextPage as number|null,scopeCapped:input.scopeCapped,candidates};
}
