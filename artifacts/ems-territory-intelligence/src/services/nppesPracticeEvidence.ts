import {validateNppesPracticeEvidence} from './nppesPracticeContract';
import {validateAddressMatch,type StreetAddress} from './providerLocationContract';
import {validateNpiCheckDigit} from './npiVerificationService';
export async function loadNppesPracticeEvidence(npi:string,signal?:AbortSignal){
 if(!validateNpiCheckDigit(npi).isValid)throw Error('Invalid NPI');
 const r=await fetch('/api/discovery/nppes-practice-locations?'+new URLSearchParams({npi}),{credentials:'include',cache:'no-store',signal});
 if(!r.ok)throw Error('NPPES practice location evidence unavailable');
 return validateNppesPracticeEvidence(await r.json(),npi);
}
export async function loadNppesPracticeMap(a:StreetAddress,signal?:AbortSignal){
 const r=await fetch('/api/discovery/address-location?'+new URLSearchParams(a),{credentials:'include',cache:'no-store',signal});
 if(!r.ok)throw Error('Public address geocoder unavailable');
 const match=validateAddressMatch(await r.json(),a);
 if(match&&match.method!=='census-address-range')throw Error('Unexpected geocoder response');
 return match;
}
