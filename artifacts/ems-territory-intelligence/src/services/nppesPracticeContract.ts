/** Federal organization location evidence; address rows are not station identities. */
import {validNpi,parseStreetAddress,isPhysicalStreet,addressKey,type StreetAddress} from './providerLocationContract';
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export type NppesPracticeRow={key:string;kind:'primary-practice'|'secondary-practice'|'mailing';address:StreetAddress;physicalStreet:boolean;stationIdentityEstablished:false;endUserValidationRequired:true};
export type NppesPracticeEvidence={schemaVersion:1;npi:string;organizationName:string|null;sourceUrl:string;sourceDate:string|null;retrievedAt:string;status:'source-reported'|'no-record'|'not-eligible';secondaryCollection:'reported'|'not-returned';withheldAddressCount:number;rows:NppesPracticeRow[];operatingRelationshipEstablished:false;publicationEligible:false;endUserValidationRequired:true};
const kinds=['primary-practice','secondary-practice','mailing'] as const;
export const practiceRowKey=(kind:NppesPracticeRow['kind'],address:StreetAddress)=>kind+':'+addressKey(address);
export const sourceLink=(npi:string)=>'https://npiregistry.cms.hhs.gov/provider-view/'+npi;
export const cleanSourceText=(x:unknown,max:number)=>typeof x==='string'&&x.trim()&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x)?x.trim():null;
export function sourceDay(x:unknown):string|null{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x)return null;
 return x;
}
export function validateNppesPracticeEvidence(v:unknown,npi:string):NppesPracticeEvidence{
 if(!validNpi(npi)||!obj(v)||v.schemaVersion!==1||v.npi!==npi||v.sourceUrl!==sourceLink(npi)||typeof v.retrievedAt!=='string'||!Number.isFinite(Date.parse(v.retrievedAt))||!(v.sourceDate===null||sourceDay(v.sourceDate)===v.sourceDate)||!['source-reported','no-record','not-eligible'].includes(String(v.status))||!['reported','not-returned'].includes(String(v.secondaryCollection))||typeof v.withheldAddressCount!=='number'||!Number.isSafeInteger(v.withheldAddressCount)||v.withheldAddressCount<0||v.withheldAddressCount>1000||v.operatingRelationshipEstablished!==false||v.publicationEligible!==false||v.endUserValidationRequired!==true||!Array.isArray(v.rows)||v.rows.length>1000)throw Error('Invalid NPPES organization location evidence');
 if(v.status==='source-reported'?typeof v.organizationName!=='string'||cleanSourceText(v.organizationName,300)!==v.organizationName:v.organizationName!==null||v.rows.length||v.sourceDate!==null||v.secondaryCollection!=='not-returned'||v.withheldAddressCount!==0)throw Error('Invalid NPPES organization identity');
 const seen=new Set<string>();let primary=0;
 for(const r of v.rows){
  if(!obj(r)||!kinds.includes(r.kind as NppesPracticeRow['kind'])||!obj(r.address)||r.stationIdentityEstablished!==false||r.endUserValidationRequired!==true)throw Error('Invalid NPPES address row');
  const a=parseStreetAddress(r.address);if(!a||JSON.stringify(a)!==JSON.stringify({street:r.address.street,city:r.address.city,state:r.address.state,zip:r.address.zip})||r.key!==practiceRowKey(r.kind as NppesPracticeRow['kind'],a)||typeof r.key!=='string'||seen.has(r.key)||r.physicalStreet!==(r.kind!=='mailing'&&isPhysicalStreet(a.street)))throw Error('Invalid NPPES address evidence');
  seen.add(r.key);if(r.kind==='primary-practice')primary++;
  if(r.kind==='secondary-practice'&&v.secondaryCollection!=='reported')throw Error('Unreported secondary collection');
 }
 if(primary>1)throw Error('Conflicting primary location');
 return v as unknown as NppesPracticeEvidence;
}
