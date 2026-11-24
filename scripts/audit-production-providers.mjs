/**
 * Explicitly scoped, GET-only production audit. Never run inside the app.
 * Requires separately authorized Google ADC with read-only Firestore IAM.
 * No list/query, write, listener, credentials in output, or raw document export.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const MAX_AGENCIES=100;
const masks=['stateCode','countyFips','fdid','isFdidVerified','verificationSource','dataProvenanceTier','npiNumber','stateLicenseNumber','registryIdentity.sourceName','registryIdentity.identifier','registryIdentity.stateCode','registryIdentity.identifierKind','competitorContract.contractEndDate','factEvidence.maintenanceContracts.sourceKind','factEvidence.maintenanceContracts.sourceName','factEvidence.maintenanceContracts.sourceRecordId','factEvidence.maintenanceContracts.geographicLevel'];
const validText=(v)=>typeof v==='string'&&v.trim().length>0;
const stateCode=(v)=>typeof v==='string'&&/^[A-Z]{2}$/.test(v);
const date=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function validateAuditScope(scope){
 if(!scope||typeof scope!=='object'||!/^[-a-z0-9]{6,63}$/.test(scope.projectId??'')||!(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(scope.databaseId??'')||scope.databaseId==='(default)')||!stateCode(scope.stateCode)||!validText(scope.authorizationReference)||!Array.isArray(scope.agencyIds)||scope.agencyIds.length<1||scope.agencyIds.length>MAX_AGENCIES)throw Error('Provide an approved project, database, state, authorization reference and 1–100 exact agency document IDs.');
 if(scope.agencyIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(id)||id==='.'||id==='..')||new Set(scope.agencyIds).size!==scope.agencyIds.length)throw Error('Scope contains invalid or duplicate document IDs.');
 return {projectId:scope.projectId,databaseId:scope.databaseId,stateCode:scope.stateCode,agencyIds:[...scope.agencyIds]};
}
function field(fields,key){return fields?.[key]?.stringValue;}
function nested(fields,key){return fields?.[key]?.mapValue?.fields??{};}
function inspect(id,fields,scope){
 const state=field(fields,'stateCode');if(state!==scope.stateCode)return {id,outcome:'scope-mismatch'};
 const flags=[],identifiers=[];
 const fdid=field(fields,'fdid')??'';
 const generated=field(fields,'dataProvenanceTier')==='generated_prospect'||/geographic prospect generator|generated geography-based prospect/i.test(field(fields,'verificationSource')??'')||/^(ems|fire)-[a-z]{2}-\d{5}(?:-|$)|^territory-[a-z]{2}-(ems|fire)-/i.test(id);
 const synthetic=/^[A-Z]{2}-(FD|EMS)-\d{5}(?:-[A-Z0-9]{1,3})?$/i.test(fdid)||/^location-[a-f0-9]+$/i.test(fdid)||(/^territory-/i.test(id)&&/^[A-Z]{2}-\d{1,5}$/i.test(fdid));
 if(generated)flags.push('geographic-prospect');if(synthetic)flags.push('synthetic-fdid');
 if(fdid&&!synthetic&&fields.isFdidVerified?.booleanValue===true)identifiers.push('FDID:'+state+':'+fdid.toUpperCase());
 const npi=field(fields,'npiNumber');if(npi){if(!/^\d{10}$/.test(npi)||[...('80840'+npi)].reverse().reduce((sum,d,i)=>{const n=Number(d)*(i%2?2:1);return sum+(n>9?n-9:n)},0)%10!==0)flags.push('invalid-npi-format');else identifiers.push('NPI:'+npi);}
 const native=nested(fields,'registryIdentity'),source=field(native,'sourceName'),nativeId=field(native,'identifier'),nativeState=field(native,'stateCode'),kind=field(native,'identifierKind');
 if(fields.registryIdentity){
  let key;
  if(nativeId&&/^[-A-Z0-9.]{1,80}$/i.test(nativeId)&&!/^location-/i.test(nativeId)&&nativeState===state){
   if(source==='USFA NFDR'&&!/^[A-Z]{2}-(FD|EMS)-\d{5}/i.test(nativeId))key='FDID:'+state+':'+nativeId.toUpperCase();
   else if(source==='NERIS')key='NERIS:'+nativeId.toUpperCase();
   else if(source==='NPPES'&&/^\d{10}$/.test(nativeId))key='NPI:'+nativeId;
   else if(source==='State EMS'&&['agency-code','license'].includes(kind))key='STATE-EMS:'+state+':'+kind+':'+nativeId.toUpperCase();
  }
  if(!key)flags.push('invalid-native-identity');else{identifiers.push(key);if(id!=='registry-'+key.replaceAll(':','-'))flags.push('noncanonical-native-account-id');}
 }
 const county=field(fields,'countyFips');if(county&&!/^\d{5}$/.test(county))flags.push('invalid-county-fips-format');
 const contract=field(nested(fields,'competitorContract'),'contractEndDate');
 if(contract){
  const evidence=nested(nested(fields,'factEvidence'),'maintenanceContracts');
  if(!date(contract))flags.push('invalid-contract-date');
  else if(field(evidence,'sourceKind')==='logic'||!validText(field(evidence,'sourceName'))||!validText(field(evidence,'sourceRecordId'))||field(evidence,'geographicLevel')!=='agency')flags.push('contract-date-needs-agency-evidence');
  else flags.push('contract-date-mapped-exact-value-not-verified');
 }
 if(!identifiers.length)flags.push('no-indexable-identifier');
 return {id,outcome:'inspected',flags,identifiers:[...new Set(identifiers)]};
}

export async function runScopedAudit(scope,token,{fetchImpl=globalThis.fetch,now=()=>new Date().toISOString()}={}){
 const s=validateAuditScope(scope);
 if(!validText(token))throw Error('No authorized Google access token available.');
 const rows=[];
 for(const id of s.agencyIds){
  const url=new URL('https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(s.projectId)+'/databases/'+encodeURIComponent(s.databaseId)+'/documents/agencies/'+encodeURIComponent(id));
  for(const mask of masks)url.searchParams.append('mask.fieldPaths',mask);
  const res=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(res.status===404){rows.push({id,outcome:'not-found'});continue;}
  if(!res.ok)throw Error('Audit stopped at HTTP '+res.status+'; no report produced.');
  const doc=await res.json();
  if(!doc||doc.name!=='projects/'+s.projectId+'/databases/'+s.databaseId+'/documents/agencies/'+id||!doc.fields||typeof doc.fields!=='object')throw Error('Unexpected Firestore document response; audit stopped.');
  rows.push(inspect(id,doc.fields,s));
 }
 const flags={},owners=new Map();
 for(const row of rows){
  for(const f of row.flags??[])flags[f]=(flags[f]??0)+1;
  for(const key of row.identifiers??[]){const ids=owners.get(key)??[];ids.push(row.id);owners.set(key,ids);}
 }
 return {schemaVersion:1,generatedAt:now(),scope:{projectId:s.projectId,databaseId:s.databaseId,stateCode:s.stateCode,requested:s.agencyIds.length,method:'Explicit document GETs only; no collection listing. Authorized selection, not full database coverage.'},inspected:rows.filter(r=>r.outcome==='inspected').length,notFound:rows.filter(r=>r.outcome==='not-found').length,scopeMismatch:rows.filter(r=>r.outcome==='scope-mismatch').length,flags,duplicateIdentifierCandidates:[...owners].filter(([,ids])=>ids.length>1).map(([identifier,accountIds])=>({identifier,accountIds})),rows,limitations:['No active-service, source authenticity or field-level verification performed.','A source mapping is not proof of a contract value.','Only the explicitly listed document IDs were requested. No database or app writes performed.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==5||args[0]!=='--scope'||args[2]!=='--out'||args[4]!=='--confirm-read-only')throw Error('Usage: node scripts/audit-production-providers.mjs --scope approved-scope.json --out new-audit.json --confirm-read-only');
 const scope=JSON.parse(await readFile(args[1],'utf8'));validateAuditScope(scope);
 let token;
 try{token=execFileSync('gcloud',['auth','application-default','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:20000}).trim();}
 catch{throw Error('Authorized Google ADC is not available. Configure an approved read-only principal outside the application.');}
 const report=await runScopedAudit(scope,token);
 await writeFile(args[3],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Read-only scoped audit saved. Inspected '+report.inspected+' of '+report.scope.requested+' requested IDs. No database writes.');
}
