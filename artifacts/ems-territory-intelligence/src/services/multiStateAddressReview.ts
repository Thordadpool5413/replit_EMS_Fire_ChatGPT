import data from '../data/multiStateAddressReview.json';
import {virginiaAddressReviewCandidate,virginiaReviewSourceLink,VIRGINIA_REVIEW_DATE} from './virginiaAddressReview';
import type {SnapshotLocation} from './nationalLocationSnapshot';
import {addressKey,type StreetAddress} from './providerLocationContract';
export type ProfileAddressReview={sourceIdentityKey:string;snapshotGeneratedAt:string;objectId:number;matchedAddress:string;sourceLabel:string;sourceUrl:string;checkedAt:string;placementAsReported:string|null;recordUpdatedAt:string|null;countyVerified:boolean;sharedSourcePoint:boolean;endUserValidationRequired:true};
type State=keyof typeof data.sources;
const fields:Record<State,string>={MN:'objectid,anumber,st_name,postcomm,zip,co_code,place_loc,status,edit_date',WI:'OBJECTID,Add_Number,FullStNm,Post_Comm,Post_Code,County,Placement,DateUpdate',MI:'OBJECTID,STNUM,ADDRESS,CITY,State,ZIP,Status'};
const stateKey=(s:string):s is State=>Object.hasOwn(data.sources,s);
export function multiStateAddressReviewCandidate(entry:SnapshotLocation|undefined,generatedAt:string|undefined,knownAddress:StreetAddress|undefined,accountCounty:string|undefined):ProfileAddressReview|undefined{
 if(entry?.state==='VA'){
  const v=virginiaAddressReviewCandidate(entry,generatedAt,knownAddress,accountCounty);
  return v&&generatedAt?{sourceIdentityKey:entry.key,snapshotGeneratedAt:generatedAt,objectId:v.objectId,matchedAddress:v.matchedAddress,sourceLabel:'Virginia VGIN',sourceUrl:virginiaReviewSourceLink(v),checkedAt:VIRGINIA_REVIEW_DATE,placementAsReported:v.pointType,recordUpdatedAt:v.recordUpdatedAt,countyVerified:true,sharedSourcePoint:false,endUserValidationRequired:true}:undefined;
 }
 if(data.publication!=='review-only'||generatedAt!==data.snapshotGeneratedAt||!entry||!stateKey(entry.state)||!['no-match','unavailable'].includes(entry.status)||entry.match!==null||entry.countyFips||!entry.address||!knownAddress)return;
 const state=entry.state,source=data.sources[state],matches=data.candidates.filter(c=>c.state===state&&c.sourceKey===entry.key);
 if(matches.length!==1)return;
 const c=matches[0];
 if(c.endUserValidationRequired!==true||entry.status!==c.registryStatus||entry.name!==c.registryName||entry.sourceDate!==c.registrySourceDate||entry.sourceCounty!==c.registryCounty||addressKey(entry.address)!==addressKey(c.registryAddress)||addressKey(knownAddress)!==addressKey(c.registryAddress))return;
 if(c.countyFips&&(entry.sourceCounty&&entry.sourceCounty!==c.countyFips||accountCounty&&accountCounty!==c.countyFips))return;
 if(!c.countyFips&&state!=='MI'||state==='MI'&&accountCounty&&accountCounty!==entry.sourceCounty||!Number.isSafeInteger(c.objectId)||c.objectId<=0)return;
 const query=new URLSearchParams({objectIds:String(c.objectId),outFields:fields[state],returnGeometry:'true',outSR:'4326',f:'pjson'});
 return {sourceIdentityKey:entry.key,snapshotGeneratedAt:data.snapshotGeneratedAt,objectId:c.objectId,matchedAddress:c.matchedAddress,sourceLabel:source.label,sourceUrl:source.url+'/query?'+query,checkedAt:source.checkedAt,placementAsReported:c.placementAsReported,recordUpdatedAt:c.recordUpdatedAt,countyVerified:!!c.countyFips,sharedSourcePoint:data.candidates.some(other=>other.state===state&&other.objectId===c.objectId&&other.sourceKey!==c.sourceKey),endUserValidationRequired:true};
}
