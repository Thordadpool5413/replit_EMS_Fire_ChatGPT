import {readFile,writeFile,stat} from 'node:fs/promises';
import {FEED_SCOPE_IDS,feedSourceUrl,validateDiscoveryFeed,type FeedCandidate,type FeedScope,type FeedKind,type DiscoveryFeed} from './recurringDiscoveryContract';
import {reconcileDiscoveryFeed,type ScopeResult} from './recurringDiscovery';
import {fetchFemaDiscovery} from './publicIntelligenceDiscovery';
import {fetchFederalDiscovery} from './federalSpendingDiscovery';
import {fetchMunicipalDiscovery} from './municipalSpendingDiscovery';
import type {MunicipalTopic} from './municipalDiscoveryContract';
const maxBytes=2_000_000;
const empty={fiscalYear:null,publishedDay:null,periodStart:null,periodEnd:null,deadlineLocal:null,vendor:null};
const municipalKinds={solicitation:'municipal-solicitation',award:'municipal-award','intent-to-award':'municipal-intent',other:'municipal-other'} as const;
async function collect(id:FeedScope,now:number):Promise<ScopeResult>{
 const year=new Date(now).getUTCFullYear();
 try{
  let candidates:FeedCandidate[],sourceRows:number,withheld:number,hasMore:boolean,warning=false;
  if(id==='fema-fl'){
   const p=await fetchFemaDiscovery({state:'FL',fromYear:Math.max(2010,year-2),offset:0},fetch,now);
   candidates=p.candidates.map(c=>({...empty,source:'openfema-afg',nativeId:c.id,recordNumber:c.awardNumber,organization:c.recipient,state:c.state,kind:'grant',title:c.program,amount:c.awardAmount,fiscalYear:c.fiscalYear,sourceUrl:feedSourceUrl('openfema-afg',c.id)}));
   sourceRows=p.sourceRows;withheld=p.withheld;hasMore=p.nextOffset!==null||p.scopeCapped;
  }else if(id==='federal-fl-grants'||id==='federal-fl-defibrillator'){
   const p=await fetchFederalDiscovery({state:'FL',fromYear:Math.max(2010,year-2),topic:id==='federal-fl-grants'?'grants':'defibrillator',page:1},fetch,now);
   // Do not republish free-form award descriptions. Retain organization and native award identity only.
   candidates=p.candidates.map(c=>({...empty,source:'usaspending',nativeId:c.id,recordNumber:c.awardNumber,organization:c.recipient,state:c.state,kind:c.kind==='grant'?'grant':'federal-contract-award',title:c.kind==='grant'?'Federal assistance award':'Federal contract award',amount:c.awardAmount,periodStart:c.startDate,periodEnd:c.endDate,sourceUrl:feedSourceUrl('usaspending',c.id)}));
   sourceRows=p.sourceRows;withheld=p.withheld;hasMore=p.nextPage!==null||p.scopeCapped;warning=p.warnings>0;
  }else{
   const topic=id.slice(4) as MunicipalTopic;
   const p=await fetchMunicipalDiscovery({source:'nyc-city-record',topic,days:90,page:1},fetch,now);
   candidates=p.notices.map(n=>({...empty,source:'nyc-city-record',nativeId:n.id,recordNumber:n.pin,organization:n.issuingAgency,state:'NY',kind:municipalKinds[n.kind] as FeedKind,title:n.title,amount:n.contractAmount,publishedDay:n.publishedDate,deadlineLocal:n.dueLocal,vendor:n.vendor,sourceUrl:feedSourceUrl('nyc-city-record',n.id)}));
   sourceRows=p.sourceRows;withheld=p.withheld;hasMore=p.nextPage!==null||p.scopeCapped;
  }
  // A warning-bearing federal response is not a reliable discovery baseline.
  if(warning)return {id,status:'unavailable',sourceRows:0,withheld:0,hasMore:false,candidates:[]};
  return {id,status:withheld||hasMore?'partial':'ok',sourceRows,withheld,hasMore,candidates};
 }catch{
  return {id,status:'unavailable',sourceRows:0,withheld:0,hasMore:false,candidates:[]};
 }
}
async function main(){
 const [previousPath,outputPath]=process.argv.slice(2);
 if(!previousPath||!outputPath||previousPath===outputPath||process.env.ATLAS_PUBLIC_DISCOVERY_ENABLED!=='true')throw Error('Explicit discovery enablement and distinct paths required.');
 let previous:DiscoveryFeed|undefined;
 if(previousPath!=='--initial'){
  const size=(await stat(previousPath)).size;
  if(size>maxBytes)throw Error('Prior feed exceeds size limit.');
  previous=validateDiscoveryFeed(JSON.parse(await readFile(previousPath,'utf8')));
 }
 const now=Date.now(),results:ScopeResult[]=[];
 for(const id of FEED_SCOPE_IDS){
  const result=await collect(id,now);results.push(result);
  console.log(id+': '+result.status+'; '+result.candidates.length+' candidates');
 }
 const next=reconcileDiscoveryFeed(previous,results,now);
 const json=JSON.stringify(next)+'\n';
 if(Buffer.byteLength(json)>maxBytes)throw Error('New feed exceeds size limit.');
 await writeFile(outputPath,json,{flag:'wx',mode:0o600});
 console.log('Public feed validated: '+next.items.length+' retained candidates, '+next.conflictingIds+' conflicting identities withheld.');
}
main().catch(()=>{console.error('Discovery run failed validation or storage. Prior published feed remains unchanged.');process.exitCode=1;});
