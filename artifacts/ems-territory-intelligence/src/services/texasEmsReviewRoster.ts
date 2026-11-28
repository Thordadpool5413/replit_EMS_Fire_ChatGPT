import { hasProviderServiceName, unrelatedProviderName } from './providerServiceName';
/** Review-only DSHS evidence. Never produces a saved Agency or map location. */
export type TexasRosterKind='provider'|'first-responder';
export interface TexasReviewRecord {
 sourceKey:string; rosterKind:TexasRosterKind; identifier:string; name:string; dbaName:string|null;
 licenseType:string; licenseRankAsReported:string|null; status:string; secondaryStatus:string|null;
 issuedOn:string|null; expiresOn:string|null; rankDateAsReported:string|null; licenseDateConflict:boolean;
 addressAsReported:string|null; mailingAddress2:string|null; city:string|null; state:string; zip:string; mailingCounty:string|null;
 stationCountAsReported:number; endUserValidationRequired:true;
 nationalReviewCandidates:{sourceKey:string;name:string;source:'USFA'|'NPPES';city:string;postalCode:string;basis:string[]}[];
}
export function texasServiceName(row:TexasReviewRecord) {
 // The hospital operates Cuero EMS. Its EMS department names the service in its published EMT role.
 // https://www.cueroregionalhospital.org/jobs/job-categories/ems/emt-ft/
 if(row.sourceKey==='TX-DSHS:license:062007' && row.city==='CUERO' && row.dbaName==='CUERO REGIONAL HOSPITAL') return 'Cuero EMS';
 if(hasProviderServiceName(row.dbaName ?? '')) return row.dbaName!;
 if(hasProviderServiceName(row.name)) return row.name;
 if(row.rosterKind==='provider' && !unrelatedProviderName(row.name) && !unrelatedProviderName(row.dbaName ?? '')) return row.dbaName || row.name;
 return undefined;
}
export interface TexasReviewCatalog {
 schemaVersion:1; publication:'review-only'; jurisdiction:'TX'; retrievedAt:string; referenceUrl:string;
 sources:Record<TexasRosterKind,{sourceUrl:string;artifactId:number;artifactSha256:string;sourceSha256:string;identifierKind:string;count:number;conflicts:number}>;
 records:TexasReviewRecord[];
}
const prefix='https://www.dshs.texas.gov/sites/default/files/CP-EMSTraumaSystems/compliance/docs/';
const reference='https://www.dshs.texas.gov/dshs-ems-trauma-systems/open-records-requests';
const digestPattern=/^[a-f0-9]{64}$/;
export function validateTexasReviewCatalog(value:unknown):TexasReviewCatalog {
 const a=value as TexasReviewCatalog;
 if(!a||a.schemaVersion!==1||a.publication!=='review-only'||a.jurisdiction!=='TX'||a.referenceUrl!==reference||!/^\d{4}-\d{2}-\d{2}$/.test(a.retrievedAt)||!Array.isArray(a.records)||a.records.length!==1386)throw Error('Invalid Texas roster review catalog');
 for(const kind of ['provider','first-responder'] as const){
  const s=a.sources?.[kind];
  if(!s||s.sourceUrl!==prefix+(kind==='provider'?'emsproviderroster.xlsx':'emsfirstresponderroster.xlsx')||s.count!==(kind==='provider'?743:643)||s.conflicts!==(kind==='provider'?1:0)||s.identifierKind!==(kind==='provider'?'license':'registration')||!digestPattern.test(s.artifactSha256)||!digestPattern.test(s.sourceSha256)||!Number.isSafeInteger(s.artifactId))throw Error('Invalid Texas roster source evidence');
  const records=a.records.filter(r=>r.rosterKind===kind);
  if(records.length!==s.count||records.filter(r=>r.licenseDateConflict===true).length!==s.conflicts)throw Error('Texas roster counts do not match');
 }
 const keys=new Set<string>();
 for(const r of a.records){
  if(!r||!['provider','first-responder'].includes(r.rosterKind)||typeof r.identifier!=='string'||!/^\d{6,7}$/.test(r.identifier)||r.sourceKey!=='TX-DSHS:'+(r.rosterKind==='provider'?'license':'registration')+':'+r.identifier||keys.has(r.sourceKey)||typeof r.name!=='string'||!r.name.trim()||r.endUserValidationRequired!==true||typeof r.licenseDateConflict!=='boolean'||!Number.isInteger(r.stationCountAsReported)||r.stationCountAsReported<0||!Array.isArray(r.nationalReviewCandidates)||Object.hasOwn(r,'latitude')||Object.hasOwn(r,'longitude')||Object.hasOwn(r,'countyFips'))throw Error('Invalid Texas source record');
  if(r.nationalReviewCandidates.some(c=>!c||!(/^(?:FDID:TX:[-A-Z0-9.]+|NPI:\d{10})$/.test(c.sourceKey))||!['USFA','NPPES'].includes(c.source)||typeof c.name!=='string'||!Array.isArray(c.basis)||!c.basis.length||c.basis.some(b=>!['primary-name','dba-name'].includes(b))))throw Error('Invalid Texas comparison evidence');
  keys.add(r.sourceKey);
 }
 return a;
}
let pending:Promise<TexasReviewCatalog>|undefined;
export function loadRawTexasReviewRoster():Promise<TexasReviewCatalog>{
 if(!pending)pending=(async()=>{
  const base=(import.meta.env?.BASE_URL??'/')+'registry/state-ems-review/';
  const idx=await fetch(base+'TX-index.json',{cache:'no-cache',signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Texas source index unavailable');return r.json()});
  if(idx.schemaVersion!==1||idx.publication!=='review-only'||idx.file!=='TX-review.json'||idx.count!==1386||!digestPattern.test(idx.sha256))throw Error('Invalid Texas source index');
  const data=await fetch(base+idx.file,{cache:'no-cache',signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Texas source roster unavailable');return r.text()});
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==idx.sha256)throw Error('Texas source roster integrity check failed');
  return validateTexasReviewCatalog(JSON.parse(data));
 })().catch(e=>{pending=undefined;throw e});
 return pending;
}

export async function loadTexasReviewRoster(): Promise<TexasReviewCatalog> {
 const roster = await loadRawTexasReviewRoster();
 return { ...roster, records: roster.records.filter((row) => !!texasServiceName(row)) };
}
