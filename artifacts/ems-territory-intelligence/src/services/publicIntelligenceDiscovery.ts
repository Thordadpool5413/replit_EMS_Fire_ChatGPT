import type { Agency } from '../types';
import { shareableAgencies,sharedAgencyKey } from './sharedEvidence';
export const DISCOVERY_STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export type DiscoveryQuery={state:string;fromYear:number;offset:number};
export type DiscoveryCandidate={id:string;awardNumber:string;recipient:string;state:string;program:string;fiscalYear:number;awardAmount:number|null;documentDate:null;sourceUrl:string};
export type DiscoveryPage={schemaVersion:1;source:'openfema-afg';query:DiscoveryQuery;sourceUrl:string;documentationUrl:string;fetchedAt:string;sourceRows:number;withheld:number;duplicates:number;nextOffset:number|null;scopeCapped:boolean;candidates:DiscoveryCandidate[]};
const endpoint='https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants';
const documentation='https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=50;
function expectedSource(q:DiscoveryQuery):string{
 const u=new URL(endpoint);
 u.searchParams.set('$filter',"vendorState eq '"+q.state+"' and fiscalYear ge "+q.fromYear+" and startswith(programName,'Assistance to Firefighters')");
 u.searchParams.set('$orderby','fiscalYear desc,awardNumber asc,id asc');
 u.searchParams.set('$select','id,awardNumber,vendorName,vendorState,programName,fiscalYear,awardAmount');
 u.searchParams.set('$top','51');u.searchParams.set('$skip',String(q.offset));return u.toString();
}
export function validateDiscoveryPage(input:unknown,q:DiscoveryQuery,now=Date.now()):DiscoveryPage{
 if(!DISCOVERY_STATES.includes(q.state)||!Number.isInteger(q.fromYear)||q.fromYear<2010||q.fromYear>new Date(now).getUTCFullYear()+1||!Number.isInteger(q.offset)||q.offset<0||q.offset>950||q.offset%50!==0)throw Error('Invalid discovery query.');
 const url=expectedSource(q);
 if(!object(input)||input.schemaVersion!==1||input.source!=='openfema-afg'||!object(input.query)||input.query.state!==q.state||input.query.fromYear!==q.fromYear||input.query.offset!==q.offset||input.sourceUrl!==url||input.documentationUrl!==documentation||typeof input.fetchedAt!=='string'||!Number.isFinite(Date.parse(input.fetchedAt))||Date.parse(input.fetchedAt)>now+60_000||now-Date.parse(input.fetchedAt)>16*60_000||!count(input.sourceRows)||!count(input.withheld)||!count(input.duplicates)||!Array.isArray(input.candidates)||input.candidates.length>50||input.candidates.length+input.withheld+input.duplicates!==input.sourceRows||typeof input.scopeCapped!=='boolean'||(input.nextOffset!==null&&(input.nextOffset!==q.offset+50||q.offset>=950||input.sourceRows!==50))||(input.scopeCapped&&(q.offset!==950||input.nextOffset!==null||input.sourceRows!==50)))throw Error('Discovery response is invalid, stale or outside the requested scope.');
 const candidates:DiscoveryCandidate[]=[],ids=new Set<string>();
 for(const c of input.candidates){
  if(!object(c)||!text(c.id,100)||!/^[A-Za-z0-9_-]+$/.test(c.id)||ids.has(c.id)||!text(c.awardNumber,160)||!text(c.recipient,240)||!text(c.program,240)||!/^Assistance to Firefighters\b/i.test(c.program)||c.state!==q.state||typeof c.fiscalYear!=='number'||!Number.isInteger(c.fiscalYear)||c.fiscalYear<q.fromYear||c.fiscalYear>new Date(now).getUTCFullYear()+1||c.documentDate!==null||c.sourceUrl!==url||(c.awardAmount!==null&&(typeof c.awardAmount!=='number'||!Number.isFinite(c.awardAmount)||Math.abs(c.awardAmount)>1e12)))throw Error('A discovery candidate is invalid or duplicated.');
  ids.add(c.id);candidates.push({id:c.id,awardNumber:c.awardNumber,recipient:c.recipient,state:q.state,program:c.program,fiscalYear:c.fiscalYear,awardAmount:c.awardAmount,documentDate:null,sourceUrl:url});
 }
 return {schemaVersion:1,source:'openfema-afg',query:q,sourceUrl:url,documentationUrl:documentation,fetchedAt:input.fetchedAt,sourceRows:input.sourceRows,withheld:input.withheld,duplicates:input.duplicates,nextOffset:input.nextOffset as number|null,scopeCapped:input.scopeCapped,candidates};
}
export async function loadDiscoveryPage(q:DiscoveryQuery,signal?:AbortSignal):Promise<DiscoveryPage>{
 const params=new URLSearchParams({state:q.state,fromYear:String(q.fromYear),offset:String(q.offset)});
 const response=await fetch('/api/discovery/fema?'+params,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000)});
 if(!response.ok)throw Error('Public discovery is unavailable (HTTP '+response.status+'). Try again later.');
 return validateDiscoveryPage(await response.json(),q);
}
const nameKey=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Name and state only suggest a human review. Never assign grants, dates, IDs or equipment. */
export function buildDiscoveryMatches(agencies:Agency[],candidates:DiscoveryCandidate[]){
 const eligible=new Set(shareableAgencies(agencies).map(a=>a.id));
 const byName=new Map<string,Agency[]>(),idCounts=new Map<string,number>();
 for(const a of agencies){
  if(!a.id)continue;
  idCounts.set(a.id,(idCounts.get(a.id)??0)+1);
  const name=nameKey(a.name??'');if(!name)continue;
  const key=a.stateCode+':'+name;const list=byName.get(key)??[];list.push(a);byName.set(key,list);
 }
 return candidates.map(candidate=>{
  const matches=byName.get(candidate.state+':'+nameKey(candidate.recipient))??[];
  const account=matches.length===1&&eligible.has(matches[0].id)&&idCounts.get(matches[0].id)===1&&sharedAgencyKey(matches[0])?matches[0]:undefined;
  return {candidate,account,status:(account?'name-match':matches.length?'ambiguous':'unmatched') as 'name-match'|'ambiguous'|'unmatched'};
 });
}
