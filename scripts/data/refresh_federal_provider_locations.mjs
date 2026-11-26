/** Scheduled, bounded NPPES source refresh for unresolved national provider addresses. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {fetchNppesPracticeEvidence} from '../../artifacts/api-server/src/lib/nppesPracticeEvidence.ts';
import {fetchCensusLocation} from '../../artifacts/api-server/src/lib/providerLocation.ts';
import {validNpi,parseStreetAddress,addressKey,isPhysicalStreet} from '../../artifacts/api-server/src/lib/providerLocationContract.ts';
const root=new URL('../../artifacts/ems-territory-intelligence/public/registry/',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const norm=s=>s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const eligible=e=>e.source==='NPPES'&&['no-match','unavailable','source-missing'].includes(e.status);
export async function readTargets(){
 const manifestRaw=await readFile(new URL('locations/index.json',root)),nationalRaw=await readFile(new URL('national/index.json',root));
 const manifest=JSON.parse(manifestRaw),national=JSON.parse(nationalRaw);
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.chunks)||!Array.isArray(national.chunks))throw Error('Invalid source manifest');
 const seen=new Set(),targets=[];let nppesCount=0;
 for(const c of manifest.chunks){
  if(!/^[A-Z]{2}$/.test(c.state)||c.file!==c.state+'.json')throw Error('Unexpected location shard');
  const n=national.chunks.find(n=>n.state===c.state);
  if(!n||n.file!==c.file||n.sha256!==c.registrySha256)throw Error('Source manifest disagreement');
  const [locRaw,regRaw]=await Promise.all([readFile(new URL('locations/'+c.file,root)),readFile(new URL('national/'+n.file,root))]);
  if(digest(locRaw)!==c.sha256||digest(regRaw)!==n.sha256)throw Error('Source shard digest mismatch');
  const rows=JSON.parse(locRaw),registry=JSON.parse(regRaw);
  if(!Array.isArray(rows)||rows.length!==c.count||!Array.isArray(registry)||registry.length!==n.count)throw Error('Source count mismatch');
  const parents=new Map(registry.filter(r=>r[1]==='NPPES'&&/^nppes:\d{10}$/.test(r[0])).map(r=>[r[0].slice(6),r]));
  for(const e of rows){
   if(e.source!=='NPPES')continue;
   nppesCount++;
   const npi=e.key?.slice(4),p=parents.get(npi);
   if(!validNpi(npi)||e.key!=='NPI:'+npi||seen.has(npi)||!p||e.state!==c.state||p[3]!==c.state||p[2]!==e.name)throw Error('Unexpected NPPES snapshot identity');
   seen.add(npi);
   if(!eligible(e))continue;
   if(p[9]||e.address!==null&&!parseStreetAddress(e.address))throw Error('Invalid unresolved organization address');
   targets.push({npi,name:e.name,registryState:e.state,sourceDate:e.sourceDate,snapshotAddress:e.address,snapshotStatus:e.status});
  }
 }
 if(nppesCount!==manifest.coverage.NPPES.total)throw Error('Incomplete NPPES snapshot');
 const expected=['no-match','unavailable','source-missing'].reduce((n,k)=>n+(manifest.coverage.NPPES.statuses[k]??0),0);
 if(targets.length!==expected)throw Error('Unresolved NPPES coverage mismatch');
 return {targets,locationManifestSha256:digest(manifestRaw),nationalRegistrySha256:digest(nationalRaw),snapshotGeneratedAt:manifest.generatedAt};
}
export function selectBatch(targets,limit,slot,offset){
 if(!Number.isSafeInteger(limit)||limit<1||limit>128||!Number.isSafeInteger(slot)||slot<0||!targets.length)throw Error('Invalid refresh batch');
 const sorted=[...targets].sort((a,b)=>a.npi.localeCompare(b.npi));
 const groups=Math.ceil(sorted.length/limit);
 const start=offset===undefined?(slot%groups)*limit:offset;
 if(!Number.isSafeInteger(start)||start<0||start>=sorted.length)throw Error('Invalid refresh offset');
 return {offset:start,limit,total:sorted.length,nextOffset:start+limit<sorted.length?start+limit:0,targets:sorted.slice(start,start+limit)};
}
export function compareSource(target,evidence){
 if(evidence.npi!==target.npi)throw Error('Wrong NPI evidence');
 if(evidence.status!=='source-reported')return {status:evidence.status,primaryAddress:null,nameMatches:false};
 const nameMatches=norm(evidence.organizationName)===norm(target.name);
 const primary=evidence.rows.find(r=>r.kind==='primary-practice')??null;
 if(!nameMatches)return {status:'name-difference-review',primaryAddress:primary?.address??null,nameMatches};
 if(!primary)return {status:'primary-not-returned',primaryAddress:null,nameMatches};
 const a=primary.address;
 const status=target.snapshotAddress?addressKey(target.snapshotAddress)===addressKey(a)?'primary-unchanged':'primary-changed-review':'primary-recovered-review';
 return {status,primaryAddress:a,nameMatches};
}
export async function refresh(batch,{load=fetchNppesPracticeEvidence,geocode=fetchCensusLocation,delay=pause,geocodeLimit=24}={}){
 if(!Number.isSafeInteger(geocodeLimit)||geocodeLimit<0||geocodeLimit>32)throw Error('Invalid geocode budget');
 const rows=[];let attempts=0;
 for(const target of batch.targets){
  let row;
  try{
   const evidence=await load(target.npi);
   const comparison=compareSource(target,evidence);
   const a=comparison.primaryAddress;
   row={target,status:comparison.status,evidence,primaryAddress:a,sourceNameMatches:comparison.nameMatches,geocodeStatus:'not-requested',geocode:null,endUserValidationRequired:true,publicationEligible:false};
   if(comparison.nameMatches&&a&&a.zip&&isPhysicalStreet(a.street)&&attempts<geocodeLimit){
    attempts++;
    try{
     const m=await geocode(a);
     if(m&&m.method!=='census-address-range')throw Error('Unexpected geocode method');
     row.geocodeStatus=m?'approximate-street-range':'no-unique-match';row.geocode=m;
    }catch{row.geocodeStatus='source-unavailable';}
   }
  }catch{row={target,status:'source-unavailable',evidence:null,primaryAddress:null,sourceNameMatches:false,geocodeStatus:'not-requested',geocode:null,endUserValidationRequired:true,publicationEligible:false};}
  rows.push(row);
  await delay(350);
 }
 const counts={};for(const r of rows)counts[r.status]=(counts[r.status]??0)+1;
 return {counts,rows,geocodeAttempts:attempts,approximateMatches:rows.filter(r=>r.geocodeStatus==='approximate-street-range').length,secondaryAddressRows:rows.reduce((n,r)=>n+(r.evidence?.rows.filter(x=>x.kind==='secondary-practice').length??0),0),newMapped:0};
}
async function main(){
 const argv=process.argv.slice(2),options={};
 for(let i=0;i<argv.length;i+=2){const k=argv[i];if(!['--output','--limit','--offset','--geocode-limit'].includes(k)||argv[i+1]===undefined||Object.hasOwn(options,k))throw Error('Invalid command arguments');options[k]=argv[i+1];}
 if(!options['--output'])throw Error('--output required');
 const {targets,...provenance}=await readTargets();
 const slot=Math.floor(Date.now()/43_200_000);
 const batch=selectBatch(targets,Number(options['--limit']??96),slot,options['--offset']===undefined?undefined:Number(options['--offset']));
 const result=await refresh(batch,{geocodeLimit:Number(options['--geocode-limit']??24)});
 const report={schemaVersion:1,publication:'review-only',...provenance,checkedAt:new Date().toISOString(),sourceUrl:'https://npiregistry.cms.hhs.gov/api/?version=2.1',slot,offset:batch.offset,limit:batch.limit,totalUnresolvedNpis:batch.total,nextOffset:batch.nextOffset,...result,limitations:'Exact NPI federal evidence; source name changes require review. Census address-range coordinates are approximate and never verified stations or published national pins. No state licensing lookup. Source errors are not zero records.'};
 await mkdir(options['--output'],{recursive:true});await writeFile(options['--output']+'/federal-provider-refresh.json',JSON.stringify(report,null,2)+'\n');
 console.log('Federal address refresh:',JSON.stringify({totalUnresolvedNpis:batch.total,offset:batch.offset,processed:result.rows.length,counts:result.counts,geocodeAttempts:result.geocodeAttempts,approximateMatches:result.approximateMatches,secondaryAddressRows:result.secondaryAddressRows,newMapped:0}));
 if(result.counts['source-unavailable']===result.rows.length)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
