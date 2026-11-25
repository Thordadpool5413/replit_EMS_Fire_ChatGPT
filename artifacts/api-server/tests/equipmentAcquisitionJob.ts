import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {topics,collectEquipmentScope,reconcileEquipmentCandidates,type Scope} from './equipmentAcquisition';
async function main(){
 const output=process.argv[2];if(!output)throw Error('Review artifact output required');
 const now=Date.now(),scopes:Scope[]=[];
 for(const source of ['nyc-city-record','chicago-contracts'] as const)for(const topic of topics){
  const scope=await collectEquipmentScope(source,topic,now);scopes.push(scope);
  console.log(source,topic,scope.status,scope.candidates.length);
 }
 if(scopes.every(s=>s.status==='unavailable'))throw Error('All official procurement scopes unavailable');
 const {candidates,summary}=reconcileEquipmentCandidates(scopes);
 const report={schemaVersion:1,retrievedAt:new Date(now).toISOString(),sourceScope:'NYC 365 days and Chicago 1095 days; maximum three pages per source and topic. Procurement records only, not installed fleet.',scopes:scopes.map(({candidates,...scope})=>({...scope,candidateCount:candidates.length})),summary,candidates};
 const raw=JSON.stringify(report,null,2)+'\n';
 if(Buffer.byteLength(raw)>4_000_000)throw Error('Candidate output exceeds size bound');
 await mkdir(output,{recursive:true});
 await writeFile(join(output,'equipment-candidates.json'),raw,{flag:'wx'});
 await writeFile(join(output,'summary.json'),JSON.stringify({...summary,sha256:createHash('sha256').update(raw).digest('hex')},null,2)+'\n',{flag:'wx'});
 console.log('Equipment acquisition summary:',JSON.stringify(summary));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Acquisition failed');process.exitCode=1;});
