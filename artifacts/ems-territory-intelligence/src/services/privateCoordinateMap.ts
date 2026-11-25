import type {ProfileAddressReview} from './multiStateAddressReview';
export type PrivateCoordinatePreview={agencyId:string;revision:number;decisionId:string;sourceKey:string;matchedAddress:string;latitude:number;longitude:number;snapshotGeneratedAt:string;publicationEligible:false};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function validatePrivateCoordinatePreview(x:unknown,agencyId:string,c:ProfileAddressReview):PrivateCoordinatePreview{
 if(!obj(x)||x.agencyId!==agencyId||typeof x.revision!=='number'||!Number.isSafeInteger(x.revision)||x.revision<1||typeof x.decisionId!=='string'||!x.decisionId.trim()||x.decisionId.length>100||x.sourceKey!==c.sourceIdentityKey||x.matchedAddress!==c.matchedAddress||x.snapshotGeneratedAt!==c.snapshotGeneratedAt||x.publicationEligible!==false||typeof x.latitude!=='number'||typeof x.longitude!=='number'||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude)||Math.abs(x.latitude)>90||Math.abs(x.longitude)>180||x.latitude===0&&x.longitude===0||!c.countyVerified||c.sharedSourcePoint)throw Error('Current private map evidence could not be established.');
 return x as PrivateCoordinatePreview;
}
/** The link contains no coordinates; the server revalidates on every navigation. */
export function privateCoordinateMapLink(p:PrivateCoordinatePreview){
 return '/api/agencies/'+encodeURIComponent(p.agencyId)+'/coordinate-map?'+new URLSearchParams({open:'1',decisionId:p.decisionId,sourceKey:p.sourceKey});
}
