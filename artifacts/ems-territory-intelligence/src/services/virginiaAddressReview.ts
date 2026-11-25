import data from '../data/virginiaAddressReview.json';
import type {SnapshotLocation} from './nationalLocationSnapshot';
import {addressKey,type StreetAddress} from './providerLocationContract';
export type AddressReviewCandidate=(typeof data.candidates)[number];
export const VIRGINIA_REVIEW_SOURCE=data.sourceUrl;
export const VIRGINIA_REVIEW_DATE=data.checkedAt;
export function virginiaAddressReviewCandidate(entry:SnapshotLocation|undefined,generatedAt:string|undefined,knownAddress:StreetAddress|undefined,accountCounty:string|undefined):AddressReviewCandidate|undefined{
 if(data.publication!=='review-only'||generatedAt!==data.snapshotGeneratedAt||!entry||entry.state!=='VA'||entry.status!=='no-match'||entry.match!==null||entry.countyFips||!entry.address||!knownAddress)return;
 const candidates=data.candidates.filter(c=>c.sourceKey===entry.key);
 if(candidates.length!==1)return;
 const c=candidates[0];
 if(c.endUserValidationRequired!==true||entry.name!==c.registryName||entry.sourceDate!==c.registrySourceDate||entry.sourceCounty!==c.registryCounty||addressKey(entry.address)!==addressKey(c.registryAddress)||addressKey(knownAddress)!==addressKey(c.registryAddress)||accountCounty&&accountCounty!==c.countyFips||entry.sourceCounty&&entry.sourceCounty!==c.countyFips)return;
 if(!Number.isSafeInteger(c.objectId)||c.objectId<=0||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||c.latitude<36.4||c.latitude>39.6||c.longitude< -83.8||c.longitude> -75||!/^51\d{3}$/.test(c.countyFips))return;
 return c;
}
export function virginiaReviewSourceLink(c:AddressReviewCandidate):string{
 return VIRGINIA_REVIEW_SOURCE+'/query?'+new URLSearchParams({objectIds:String(c.objectId),outFields:'OBJECTID,FULLADDR,PO_NAME,STATE,ZIP_5,FIPS,POINTTYPE,CAPTUREMETH,STATUS,LASTUPDATE',returnGeometry:'true',outSR:'4326',f:'pjson'});
}
