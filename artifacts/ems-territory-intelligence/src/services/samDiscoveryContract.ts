/** SAM.gov public opportunities: bounded title searches, never a verified sales pipeline. */
export const SAM_ENDPOINT='https://api.sam.gov/opportunities/v2/search';
export const SAM_DOCS='https://open.gsa.gov/api/get-opportunities-public-api/';
export const SAM_PORTAL='https://sam.gov/content/opportunities';
export const SAM_STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const SAM_TOPICS={defibrillator:'defibrillator',monitor:'cardiac monitor',resuscitation:'resuscitation',ventilator:'ventilator',ambulance:'ambulance',epcr:'patient care reporting',zoll:'ZOLL',lifepak:'LIFEPAK',lucas:'LUCAS',autopulse:'AutoPulse'} as const;
export const SAM_TYPES={o:'Solicitation',k:'Combined synopsis / solicitation',p:'Presolicitation',r:'Sources sought'} as const;
export const SAM_LIMIT=20,SAM_MAX_OFFSET=9;
export type SamTopic=keyof typeof SAM_TOPICS;
export type SamType=keyof typeof SAM_TYPES;
export type SamQuery={state:string;topic:SamTopic;noticeType:SamType;days:30|90|365;offset:number};
export type SamNotice={id:string;title:string;solicitationNumber:string;organization:string|null;noticeType:SamType;postedDate:string;deadline:string|null;active:'Yes'|'No'|null;performanceState:string|null;performanceCountry:string|null;setAside:string|null;naics:string|null;classification:string|null;sourceUrl:string};
export type SamPage={schemaVersion:1;source:'sam-gov';query:SamQuery;windowStart:string;windowEnd:string;fetchedAt:string;sourceRows:number;totalReported:number;withheld:number;duplicates:number;nextOffset:number|null;scopeCapped:boolean;notices:SamNotice[]};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v:unknown,n:number)=>v===null||text(v,n);
const integer=(v:unknown):number|undefined=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'&&/^\d{1,3}$/.test(v)?Number(v):undefined;
export const samDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function samPostedDay(v:unknown):string|null{
 // Test the date guard before narrowing to string; a failed calendar check does not mean a timestamp is not a string.
 if(samDay(v))return v;
 if(typeof v!=='string')return null;
 if(/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(v)&&samDay(v.slice(0,10)))return v.slice(0,10);
 return null;
}
export function samDeadlineValue(v:unknown):string|null{
 // Test the date guard before narrowing to string; a failed calendar check does not mean a timestamp is not a string.
 if(samDay(v))return v;
 if(typeof v!=='string')return null;
 if(!/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):?[0-5]\d)?$/.test(v)||!samDay(v.slice(0,10)))return null;
 return v;
}
export function samDeadlineStatus(n:SamNotice,now=Date.now()){
 if(n.active==='No')return 'Archived / inactive reported';
 if(!n.deadline)return 'Response deadline not stated';
 if(!/(?:Z|[+-]\d{2}:?\d{2})$/.test(n.deadline)||!n.deadline.includes('T'))return 'Deadline timezone or time not confirmed';
 const t=Date.parse(n.deadline);
 if(!Number.isFinite(t))return 'Deadline timezone or time not confirmed';
 if(t<=now)return 'Published response deadline elapsed';
 return n.active==='Yes'?'Active reported · future response deadline':'Future response deadline · activity unconfirmed';
}
export function parseSamQuery(input:unknown):SamQuery|undefined{
 if(!obj(input)||Object.keys(input).some(k=>!['state','topic','noticeType','days','offset'].includes(k)))return undefined;
 const {state,topic,noticeType}=input,days=integer(input.days),offset=input.offset===undefined?0:integer(input.offset);
 if(typeof state!=='string'||(state!=='all'&&!SAM_STATES.includes(state))||typeof topic!=='string'||!Object.hasOwn(SAM_TOPICS,topic)||typeof noticeType!=='string'||!Object.hasOwn(SAM_TYPES,noticeType)||(days!==30&&days!==90&&days!==365)||offset===undefined||offset<0||offset>SAM_MAX_OFFSET)return undefined;
 return {state,topic:topic as SamTopic,noticeType:noticeType as SamType,days,offset};
}
export function samWindow(days:SamQuery['days'],now=Date.now()){
 const windowEnd=new Date(now).toISOString().slice(0,10);
 const windowStart=new Date(Date.parse(windowEnd)-(days-1)*86_400_000).toISOString().slice(0,10);
 return {windowStart,windowEnd};
}
export function samType(v:unknown):SamType|undefined{
 if(typeof v!=='string')return undefined;
 const type=v.toLowerCase().replace(/[^a-z]/g,'');
 switch(type){
  case 'solicitation':return 'o';
  case 'combinedsynopsissolicitation':return 'k';
  case 'presolicitation':return 'p';
  case 'sourcessought':return 'r';
  default:return undefined;
 }
}
export const samNoticeId=(v:unknown):v is string=>typeof v==='string'&&/^[a-fA-F0-9]{32}$/.test(v);
export function samNoticeUrl(id:string):string{
 if(!samNoticeId(id))throw Error('Invalid notice identifier.');
 return 'https://sam.gov/opp/'+id+'/view';
}
export function samTitleMatches(v:string,q:SamQuery){
 return v.toLowerCase().includes(SAM_TOPICS[q.topic].toLowerCase());
}
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=SAM_LIMIT;
export function validateSamPage(input:unknown,q:SamQuery,now=Date.now()):SamPage{
 if(!parseSamQuery(q)||!obj(input)||input.schemaVersion!==1||input.source!=='sam-gov'||!obj(input.query)||input.query.state!==q.state||input.query.topic!==q.topic||input.query.noticeType!==q.noticeType||input.query.days!==q.days||input.query.offset!==q.offset||typeof input.fetchedAt!=='string'||!Number.isFinite(Date.parse(input.fetchedAt))||Date.parse(input.fetchedAt)>now+60_000||now-Date.parse(input.fetchedAt)>16*60_000)throw Error('SAM.gov response is invalid, stale or out of scope.');
 const window=samWindow(q.days,Date.parse(input.fetchedAt));
 if(input.windowStart!==window.windowStart||input.windowEnd!==window.windowEnd||!count(input.sourceRows)||!count(input.withheld)||!count(input.duplicates)||typeof input.totalReported!=='number'||!Number.isSafeInteger(input.totalReported)||input.totalReported<0||!Array.isArray(input.notices)||input.notices.length+input.withheld+input.duplicates!==input.sourceRows||typeof input.scopeCapped!=='boolean')throw Error('SAM.gov page counts are invalid.');
 const more=input.totalReported>(q.offset+1)*SAM_LIMIT;
 if((input.sourceRows>0&&input.totalReported<q.offset*SAM_LIMIT+input.sourceRows)||(more&&input.sourceRows!==SAM_LIMIT)||input.nextOffset!==(more&&q.offset<SAM_MAX_OFFSET?q.offset+1:null)||input.scopeCapped!==(more&&q.offset===SAM_MAX_OFFSET))throw Error('SAM.gov pagination is inconsistent.');
 const ids=new Set<string>(),notices:SamNotice[]=[];
 for(const r of input.notices){
  if(!obj(r)||!samNoticeId(r.id)||ids.has(r.id.toLowerCase())||!text(r.title,500)||!samTitleMatches(r.title,q)||!text(r.solicitationNumber,240)||!optional(r.organization,500)||r.noticeType!==q.noticeType||!samDay(r.postedDate)||r.postedDate<window.windowStart||r.postedDate>window.windowEnd||(r.deadline!==null&&samDeadlineValue(r.deadline)!==r.deadline)||(r.active!==null&&r.active!=='Yes'&&r.active!=='No')||(r.performanceState!==null&&(typeof r.performanceState!=='string'||!SAM_STATES.includes(r.performanceState)||r.performanceCountry!=='USA'))||(r.performanceCountry!==null&&(typeof r.performanceCountry!=='string'||!/^[A-Z]{3}$/.test(r.performanceCountry)))||(q.state!=='all'&&(r.performanceCountry!=='USA'||r.performanceState!==q.state))||!optional(r.setAside,240)||(r.naics!==null&&(typeof r.naics!=='string'||!/^\d{2,6}$/.test(r.naics)))||(r.classification!==null&&(typeof r.classification!=='string'||!/^[A-Z0-9]{1,8}$/.test(r.classification)))||r.sourceUrl!==samNoticeUrl(r.id))throw Error('Invalid or duplicate SAM.gov notice.');
  ids.add(r.id.toLowerCase());notices.push({id:r.id,title:r.title,solicitationNumber:r.solicitationNumber,organization:r.organization as string|null,noticeType:q.noticeType,postedDate:r.postedDate,deadline:r.deadline as string|null,active:r.active as SamNotice['active'],performanceState:r.performanceState as string|null,performanceCountry:r.performanceCountry as string|null,setAside:r.setAside as string|null,naics:r.naics as string|null,classification:r.classification as string|null,sourceUrl:r.sourceUrl as string});
 }
 return {schemaVersion:1,source:'sam-gov',query:q,...window,fetchedAt:input.fetchedAt,sourceRows:input.sourceRows,totalReported:input.totalReported,withheld:input.withheld,duplicates:input.duplicates,nextOffset:input.nextOffset as number|null,scopeCapped:input.scopeCapped,notices};
}
