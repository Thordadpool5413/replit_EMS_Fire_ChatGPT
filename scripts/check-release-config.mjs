import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function releaseConfigIssues(env){
 const issues=[];
 for(const name of ['DATABASE_URL','REPL_ID','AI_INTEGRATIONS_GEMINI_BASE_URL','AI_INTEGRATIONS_GEMINI_API_KEY']){
  if(typeof env[name]!=='string'||!env[name].trim())issues.push(name+' missing');
 }
 try{
  const origin=new URL(env.ATLAS_PUBLIC_ORIGIN);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.origin!==env.ATLAS_PUBLIC_ORIGIN)throw Error();
 }catch{issues.push('ATLAS_PUBLIC_ORIGIN must be an exact HTTPS origin without a trailing slash or path');}
 const editors=(env.ATLAS_AGENCY_EDITOR_IDS??'').split(',').map(x=>x.trim()).filter(Boolean);
 const viewers=(env.ATLAS_AGENCY_VIEWER_IDS??'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!editors.length)issues.push('ATLAS_AGENCY_EDITOR_IDS must include an authorized editor for rollout');
 if(new Set(editors).size!==editors.length||new Set(viewers).size!==viewers.length||editors.some(x=>viewers.includes(x)))issues.push('Workspace role lists contain duplicate or overlapping IDs');
 return issues;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const issues=releaseConfigIssues(process.env);
 if(issues.length){for(const issue of issues)console.error('BLOCKED: '+issue);process.exitCode=1;}
 else console.log('PASS: required release configuration is present. Verify actual role identities and credentials separately.');
}
