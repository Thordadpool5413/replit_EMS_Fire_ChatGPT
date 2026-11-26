/** Regional source-reported organization evidence; never creates or updates an Agency. */
const source='https://wremsco.org/WREMSCOAgencies/';
const digest=/^[a-f0-9]{64}$/;
const nullable=(x:unknown)=>x===null||typeof x==='string'&&x.length>0&&x.length<=400&&!/[\u0000-\u001f\u007f]/.test(x);
export interface WestchesterReviewRow{
 name:string;headquartersStreetAsReported:string|null;cityAsReported:string|null;stateAsReported:string|null;postalCodeAsReported:string|null;agencyCodeAsReported:string|null;
 sourceRow:number;recordFingerprint:string;reviewKey:string;agencyCodeStatus:'unique-as-reported'|'duplicate'|'missing'|'non-four-digit';endUserValidationRequired:true;publicationEligible:false;
 nationalReviewCandidates:{sourceKey:string;name:string;city:string;postalCode:string;source:'USFA'|'NPPES'}[];
}
export interface WestchesterReviewCatalog{
 schemaVersion:1;publication:'review-only';jurisdiction:'NY';sourceUrl:string;sourceDate:null;retrievedAt:string;artifactId:number;artifactSha256:string;sourceSha256:string;nationalRegistrySha256:string;verifiedStations:0;newMapped:0;records:WestchesterReviewRow[];
}
export function validateWestchesterCatalog(v:unknown):WestchesterReviewCatalog{
 const a=v as WestchesterReviewCatalog;
 if(!a||a.schemaVersion!==1||a.publication!=='review-only'||a.jurisdiction!=='NY'||a.sourceUrl!==source||a.sourceDate!==null||a.retrievedAt!=='2026-11-26T02:43:49.022165+00:00'||a.artifactId!==15082079577||a.artifactSha256!=='217cb18fdb03a3ce8e0b2c4baaaa8e49c08bb04ffb6916cb41c32ab6ca5d4d13'||a.sourceSha256!=='8c4fdf790022ac323685c9ff755130135ae960c83ee034a2d26fdb8dff7e5754'||a.nationalRegistrySha256!=='6d828632d3933a2815e497bfa189ae4af75e9b847911903b94bc4f0966b748ca'||a.verifiedStations!==0||a.newMapped!==0||!Array.isArray(a.records)||a.records.length!==88)throw Error('Invalid Westchester source catalog');
 const codes=new Map<string,number>(),keys=new Set<string>();
 for(const r of a.records){if(r?.agencyCodeAsReported)codes.set(r.agencyCodeAsReported,(codes.get(r.agencyCodeAsReported)??0)+1);}
 let unique=0,matched=0;
 for(const [i,r] of a.records.entries()){
  if(!r||typeof r.name!=='string'||!nullable(r.name)||![r.headquartersStreetAsReported,r.cityAsReported,r.stateAsReported,r.postalCodeAsReported,r.agencyCodeAsReported].every(nullable)||r.sourceRow!==i+1||!digest.test(r.recordFingerprint)||r.reviewKey!=='NY-WREMSCO:row:'+r.sourceRow+':'+r.recordFingerprint.slice(0,16)||keys.has(r.reviewKey)||r.endUserValidationRequired!==true||r.publicationEligible!==false||!Array.isArray(r.nationalReviewCandidates)||r.nationalReviewCandidates.length>1||Object.hasOwn(r,'latitude')||Object.hasOwn(r,'longitude')||Object.hasOwn(r,'countyFips'))throw Error('Invalid Westchester organization evidence');
  const code=r.agencyCodeAsReported;if(code&&!/^\d{1,12}$/.test(code))throw Error('Invalid literal agency code');
  const status=!code?'missing':(codes.get(code)??0)>1?'duplicate':code.length!==4?'non-four-digit':'unique-as-reported';
  if(r.agencyCodeStatus!==status||status!=='unique-as-reported'&&r.nationalReviewCandidates.length)throw Error('Unreviewed code association');
  if(r.nationalReviewCandidates.some(c=>!c||typeof c.name!=='string'||!nullable(c.name)||typeof c.city!=='string'||!nullable(c.city)||typeof c.postalCode!=='string'||!nullable(c.postalCode)||!(c.source==='USFA'&&/^FDID:NY:[-A-Z0-9.]+$/.test(c.sourceKey)||c.source==='NPPES'&&/^NPI:\d{10}$/.test(c.sourceKey))))throw Error('Invalid comparison identity');
  keys.add(r.reviewKey);if(status==='unique-as-reported')unique++;if(r.nationalReviewCandidates.length)matched++;
 }
 if(unique!==82||matched!==20)throw Error('Unexpected Westchester source counts');
 return a;
}
let pending:Promise<WestchesterReviewCatalog>|undefined;
export function loadWestchesterCatalog():Promise<WestchesterReviewCatalog>{
 if(!pending)pending=(async()=>{
  const base=(import.meta.env?.BASE_URL??'/')+'registry/state-ems-review/';
  const idx=await fetch(base+'NY-westchester-index.json',{cache:'no-cache',signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Westchester source index unavailable');return r.json()});
  if(idx.schemaVersion!==1||idx.publication!=='review-only'||idx.file!=='NY-westchester-review.json'||idx.count!==88||!digest.test(idx.sha256))throw Error('Invalid source index');
  const raw=await fetch(base+idx.file,{cache:'no-cache',signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Westchester source catalog unavailable');return r.text()});
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(h!==idx.sha256)throw Error('Westchester evidence checksum mismatch');
  return validateWestchesterCatalog(JSON.parse(raw));
 })().catch(e=>{pending=undefined;throw e});
 return pending;
}
