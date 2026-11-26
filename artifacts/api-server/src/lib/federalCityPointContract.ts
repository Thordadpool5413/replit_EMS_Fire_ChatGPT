import {FEDERAL_CITY_MATCHES} from './federalCityPointPins';
import type {StreetAddress} from './providerLocationContract';
export const FEDERAL_CITY_PROFILE='exact-street-city-state-native-postal-difference' as const;
const obj=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(obj(value))return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
/** Only the exact retained match/address pair may use this city-only basis. */
export function validateFederalCityFallbackMatch(rawMatch:unknown,address:StreetAddress):{sourceAddressProfile:typeof FEDERAL_CITY_PROFILE}{
 const fail=():never=>{throw Error('Invalid retained federal city/postal profile.');};
 if(!obj(rawMatch)||rawMatch.sourceAddressProfile!==FEDERAL_CITY_PROFILE||rawMatch.matchBasis!=='normalized-street-city-state'||!obj(rawMatch.point))return fail();
 const key=JSON.stringify([rawMatch.method,rawMatch.point.objectId,address.street,address.city,address.state,address.zip]);
 const pin=FEDERAL_CITY_MATCHES[key];
 if(!pin||JSON.stringify(canonical(rawMatch))!==JSON.stringify(canonical(pin)))return fail();
 return{sourceAddressProfile:FEDERAL_CITY_PROFILE};
}
