/** Nationwide CMS public-use Medicare Part B ambulance service evidence. No state lookup required. */
import {boundedJson} from './publicIntelligenceDiscovery';
import {validNpi} from './providerLocationContract';
export const CMS_AMBULANCE_DATASET='335e5f35-eca6-482d-87b3-f99883e213e3';
export const CMS_AMBULANCE_YEAR=2024;
export const CMS_AMBULANCE_SOURCE='https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners/medicare-physician-other-practitioners-by-provider-and-service';
const API='https://data.cms.gov/data-api/v1/dataset/'+CMS_AMBULANCE_DATASET+'/data';
const CODES=new Set(['A0422','A0424','A0425','A0426','A0427','A0428','A0429','A0430','A0431','A0432','A0433','A0434','A0435','A0436','A0888','A0998','A0999']);
const FIELDS=['Rndrng_NPI','Rndrng_Prvdr_Last_Org_Name','Rndrng_Prvdr_Ent_Cd','Rndrng_Prvdr_City','Rndrng_Prvdr_State_Abrvtn','Rndrng_Prvdr_Type','HCPCS_Cd','HCPCS_Desc','Place_Of_Srvc','Tot_Benes','Tot_Srvcs','Tot_Bene_Day_Srvcs','Avg_Sbmtd_Chrg','Avg_Mdcr_Alowd_Amt','Avg_Mdcr_Pymt_Amt'];
const PAGE=250,MAX_PAGES=4;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function txt(v:unknown,max=400):string|null{
 if(v===null||v==='')return null;
 if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Unexpected CMS text field');
 return v.trim()||null;
}
function amount(v:unknown):number|null{
 if(v===null||v==='')return null;
 if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v)))throw Error('Unexpected CMS numeric field');
 const n=Number(v);
 if(!Number.isFinite(n)||n<0||n>Number.MAX_SAFE_INTEGER)throw Error('Invalid CMS numeric field');
 return n;
}
export function cmsAmbulanceUrl(npi:string,offset=0){
 if(!validNpi(npi)||!Number.isInteger(offset)||offset<0||offset>=PAGE*MAX_PAGES||offset%PAGE)throw Error('Invalid CMS query');
 const u=new URL(API);u.searchParams.set('filter[Rndrng_NPI]',npi);
 u.searchParams.set('size',String(PAGE));u.searchParams.set('offset',String(offset));
 u.searchParams.set('sort','Rndrng_NPI,HCPCS_Cd,Place_Of_Srvc');
 u.searchParams.set('column',FIELDS.join(','));
 return u;
}
export type CmsAmbulanceRow={
 rowKey:string;npi:string;organizationName:string;city:string|null;state:string|null;providerType:string|null;hcpcs:string;description:string|null;placeOfService:'F'|'O';beneficiaries:number|null;services:number|null;beneficiaryDayServices:number|null;averageSubmittedCharge:number|null;averageAllowedAmount:number|null;averageMedicarePayment:number|null;
};
export type CmsAmbulanceEvidence={schemaVersion:1;npi:string;datasetVersion:string;reportingYear:number;sourceUrl:string;queryUrl:string;retrievedAt:string;status:'published-rows'|'no-published-rows';rows:CmsAmbulanceRow[];endUserValidationRequired:true;operatingRelationshipEstablished:false;denialRateAvailable:false;totalClaimCountAvailable:false};
export async function fetchCmsAmbulanceEvidence(npi:string,fetcher:typeof fetch=fetch,clock=Date.now):Promise<CmsAmbulanceEvidence>{
 if(!validNpi(npi))throw Error('Invalid NPI');
 const rows:CmsAmbulanceRow[]=[],seen=new Set<string>();let complete=false;
 for(let page=0;page<MAX_PAGES;page++){
  const response=await fetcher(cmsAmbulanceUrl(npi,page*PAGE),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10_000)});
  const data=await boundedJson(response,'CMS Medicare Part B');
  if(!Array.isArray(data)||data.length>PAGE)throw Error('Unexpected CMS response shape');
  for(const raw of data){
   if(!obj(raw)||FIELDS.some(k=>!Object.hasOwn(raw,k))||raw.Rndrng_NPI!==npi)throw Error('CMS response identity or schema mismatch');
   const hcpcs=txt(raw.HCPCS_Cd,5),place=txt(raw.Place_Of_Srvc,1);
   if(!hcpcs||!/^[A-Z0-9]{5}$/.test(hcpcs)||!(place==='F'||place==='O'))throw Error('Invalid CMS service identity');
   const rowKey=npi+':'+hcpcs+':'+place;
   if(seen.has(rowKey))throw Error('Duplicate CMS service row');seen.add(rowKey);
   if(!CODES.has(hcpcs))continue;
   if(raw.Rndrng_Prvdr_Ent_Cd!=='O')continue; // Do not expose individual clinician names.
   const organizationName=txt(raw.Rndrng_Prvdr_Last_Org_Name);
   if(!organizationName)throw Error('Missing CMS organization name');
   const state=txt(raw.Rndrng_Prvdr_State_Abrvtn,2);
   if(state&&!/^[A-Z]{2}$/.test(state))throw Error('Invalid CMS reported state');
   const beneficiaries=amount(raw.Tot_Benes);
   if(beneficiaries!==null&&!Number.isSafeInteger(beneficiaries))throw Error('Invalid beneficiary count');
   rows.push({rowKey,npi,organizationName,city:txt(raw.Rndrng_Prvdr_City,100),state,providerType:txt(raw.Rndrng_Prvdr_Type,150),hcpcs,description:txt(raw.HCPCS_Desc),placeOfService:place,beneficiaries,services:amount(raw.Tot_Srvcs),beneficiaryDayServices:amount(raw.Tot_Bene_Day_Srvcs),averageSubmittedCharge:amount(raw.Avg_Sbmtd_Chrg),averageAllowedAmount:amount(raw.Avg_Mdcr_Alowd_Amt),averageMedicarePayment:amount(raw.Avg_Mdcr_Pymt_Amt)});
  }
  if(data.length<PAGE){complete=true;break;}
 }
 if(!complete)throw Error('CMS result exceeds bounded page budget; incomplete evidence withheld');
 return {schemaVersion:1,npi,datasetVersion:CMS_AMBULANCE_DATASET,reportingYear:CMS_AMBULANCE_YEAR,sourceUrl:CMS_AMBULANCE_SOURCE,queryUrl:cmsAmbulanceUrl(npi).href,retrievedAt:new Date(clock()).toISOString(),status:rows.length?'published-rows':'no-published-rows',rows,endUserValidationRequired:true,operatingRelationshipEstablished:false,denialRateAvailable:false,totalClaimCountAvailable:false};
}
