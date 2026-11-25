import {loadMunicipalDiscovery} from './municipalSpendingDiscovery';
import {loadChicagoDiscovery} from './chicagoDiscovery';
import {MUNICIPAL_TOPICS,type MunicipalTopic} from './municipalDiscoveryContract';
import {chicagoAmountNote} from './chicagoDiscoveryContract';
export const STATE_PORTALS=[
 {state:'AL',name:'STAARS vendor public access',url:'https://vendors.alabama.gov/',scope:'State business opportunities and award records',access:'Public research; registration required for transactions'},
 {state:'FL',name:'FACTS / Florida transparency',url:'https://myfloridacfo.com/transparency',scope:'State contracts, spending and financial reports',access:'Public research'},
 {state:'FL',name:'Vendor Information Portal guidance',url:'https://www.myfloridacfo.com/division/administration/home/procurement-postings',scope:'State solicitations and formal procurement notices',access:'Follow official Vendor Information Portal link'},
 {state:'IL',name:'BidBuy',url:'https://cpo-general.illinois.gov/bidbuy.html',scope:'General services solicitations and contract awards',access:'Official access instructions; registration may be required'},
 {state:'NC',name:'NC eProcurement',url:'https://eprocurement.nc.gov/',scope:'State and participating local entity solicitations',access:'Public solicitation viewing; vendor registration to respond'},
 {state:'NY',name:'Open Book New York',url:'https://www.osc.ny.gov/open-book-new-york',scope:'State contracts and local government financial reports',access:'Public research'},
 {state:'NY',name:'NYS Contract Reporter',url:'https://www.nyscr.ny.gov/home/contracts',scope:'State and participating local entity bid advertisements',access:'Free registration required for full resources'},
 {state:'OH',name:'OhioBuys',url:'https://ohiobuys.ohio.gov/',scope:'Public solicitations and contracts',access:'Public research; portal security checks may apply'},
 {state:'PA',name:'Pennsylvania DGS opportunity directory',url:'https://www.pa.gov/agencies/dgs/doing-business-with-the-commonwealth/business-inclusion-and-supplier-development/finding-opportunities',scope:'State solicitations through eMarketplace',access:'Follow official eMarketplace link'},
 {state:'TX',name:'Electronic State Business Daily',url:'https://comptroller.texas.gov/purchasing/contracts/bid-opportunities.php',scope:'State bid notices',access:'Follow official ESBD search link'},
 {state:'TX',name:'Statewide contracts',url:'https://comptroller.texas.gov/purchasing/contracts/',scope:'State managed commodity and service contracts',access:'Public research; access to purchasing subject to eligibility'},
] as const;
export type LocalSource='nyc-city-record'|'chicago-contracts';
export type LocalRow={source:LocalSource;id:string;organization:string|null;title:string;kind:string;date:string;deadline:string|null;vendor:string|null;amount:number|null;amountNote:string;url:string;recordNumber:string|null};
export type LocalScope={source:LocalSource;status:'retrieved'|'partial'|'unavailable';pages:number;sourceRows:number;withheld:number;rows:LocalRow[]};
export type LocalSample={started:number;scopes:LocalScope[]};
export async function sampleLocalProcurement(topic:MunicipalTopic,days:90|365,sources:LocalSource[],signal:AbortSignal,progress:(s:string)=>void,load={nyc:loadMunicipalDiscovery,chicago:loadChicagoDiscovery}):Promise<LocalSample>{
 if(!Object.hasOwn(MUNICIPAL_TOPICS,topic)||![90,365].includes(days)||!sources.length||sources.length>2||new Set(sources).size!==sources.length||sources.some(s=>s!=='nyc-city-record'&&s!=='chicago-contracts'))throw Error('Invalid procurement scope.');
 const started=Date.now(),scopes:LocalScope[]=[];
 for(const source of sources){
  signal.throwIfAborted();progress('Checking '+source);
  const rows:LocalRow[]=[];let pages=0,sourceRows=0,withheld=0,more=false,failed=false;
  for(let page=1;page<=2;page++){
   signal.throwIfAborted();
   try{
    if(source==='nyc-city-record'){
     const r=await load.nyc({source,topic,days,page},signal);
     rows.push(...r.notices.map(n=>({source,id:n.id,organization:n.issuingAgency,title:n.title,kind:n.kind,date:n.publishedDate,deadline:n.kind==='solicitation'?n.dueLocal:null,vendor:n.vendor,amount:n.contractAmount,amountNote:'Reported notice amount, not expenditure or remaining funds.',url:n.sourceUrl,recordNumber:n.pin})));
     sourceRows+=r.sourceRows;withheld+=r.withheld+r.duplicates;more=r.nextPage!==null||r.scopeCapped;
    }else{
     const r=await load.chicago({topic,days,page},signal);
     rows.push(...r.records.map(n=>({source,id:n.key,organization:n.department,title:n.description,kind:'contract-row',date:n.approvalDay,deadline:null,vendor:n.vendor,amount:n.amount,amountNote:chicagoAmountNote(n),url:n.sourceUrl,recordNumber:n.contractNumber+' / revision '+(n.revision??'not reported')})));
     sourceRows+=r.sourceRows;withheld+=r.withheld+r.duplicates;more=r.nextPage!==null||r.scopeCapped;
    }
    pages++;if(!more)break;
   }catch{signal.throwIfAborted();failed=true;break;}
  }
  scopes.push({source,status:!pages?'unavailable':failed||more||withheld?'partial':'retrieved',pages,sourceRows,withheld,rows});
 }
 signal.throwIfAborted();if(Date.now()-started>=300000)throw Error('Sample expired.');
 return {started,scopes};
}
export function reconcileLocalProcurement(sample:LocalSample){
 const unique=new Map<string,LocalRow>(),conflicts=new Set<string>();
 for(const s of sample.scopes)for(const r of s.rows){
  const key=r.source+':'+r.id,previous=unique.get(key);
  if(r.source!==s.source){conflicts.add(key);continue;}
  if(previous&&JSON.stringify(previous)!==JSON.stringify(r))conflicts.add(key);
  else if(!previous)unique.set(key,r);
 }
 const rows=[...unique].filter(([key])=>!conflicts.has(key)).map(([,r])=>r).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return {rows,conflicts:conflicts.size};
}
