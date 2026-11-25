import type {ProfileAddressReview} from './multiStateAddressReview';
import {fieldValidationState,type FactReviewEntry,type FieldReviewSource} from './factReviewStore';
export const ADDRESS_CANDIDATE_FIELD='identity.address.gis-candidate';
/** Separate from the registry address; never participates in an address correction or map overlay. */
export function candidateReviewSource(candidate:ProfileAddressReview):FieldReviewSource{
 return {sourceName:candidate.sourceLabel,sourceUrl:candidate.sourceUrl,sourceKind:'dataset',reportingPeriod:candidate.checkedAt,sourceRecordId:JSON.stringify([candidate.sourceIdentityKey,candidate.snapshotGeneratedAt,candidate.objectId,candidate.recordUpdatedAt,candidate.placementAsReported,candidate.countyVerified,candidate.sharedSourcePoint])};
}
export function candidateValidationState(candidate:ProfileAddressReview,entries:FactReviewEntry[]){
 return fieldValidationState(candidate.matchedAddress,candidate.matchedAddress,entries.filter(e=>e.fieldId===ADDRESS_CANDIDATE_FIELD),candidateReviewSource(candidate));
}
export function candidateReviewLabel(candidate:ProfileAddressReview,entries:FactReviewEntry[]):string{
 const status=candidateValidationState(candidate,entries);
 return status==='User confirmed this value'?'User confirmed address evidence · not a verified pin':status==='Discrepancy flagged'?'Address evidence discrepancy flagged · no pin':status==='Source or value changed; review required'?'Evidence changed · review again':'End-user address evidence review required';
}
