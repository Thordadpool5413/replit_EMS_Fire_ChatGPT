import type {NerisPrimarySiteContext} from './nerisPrimarySiteContract';
import {nerisProofDigest} from './nerisProofHash';

export type NerisRetainedBindings={
 schemaVersion:number;method:string;sourceArchiveSha256:string;candidateCount:number;
 bindings:Record<string,{proof:string;national:string}>;
};
export function retainedNerisPayload(value:unknown,ctx:NerisPrimarySiteContext):unknown {
 return {key:ctx.key,name:ctx.name,state:ctx.state,source:ctx.source,sourceCounty:ctx.sourceCounty??'',
  countyFips:ctx.countyFips,address:ctx.address,match:ctx.match,originalAddress:ctx.originalAddress,primaryAddressEvidence:value};
}
/**
 * The finite bindings are generated only after full retained-source replay.
 * Parse-only callers bind the original frozen address; listing callers also
 * supply the independently loaded national row, which has its own exact pin.
 */
export function validateRetainedNerisEvidence<T>(value:unknown,ctx:NerisPrimarySiteContext,method:string,pins:NerisRetainedBindings):T|undefined {
 if(value===undefined)return undefined;
 const fail=():never=>{throw Error('NERIS primary-site evidence differs from its complete retained source binding.');};
 if(value===null||typeof value!=='object'||Array.isArray(value)||(value as Record<string,unknown>).method!==method||
    pins.schemaVersion!==1||pins.method!==method||!/^[a-f0-9]{64}$/.test(pins.sourceArchiveSha256))return fail();
 const pin=pins.bindings[ctx.key];
 if(!pin||nerisProofDigest(retainedNerisPayload(value,ctx))!==pin.proof)return fail();
 if(ctx.nationalRow!==undefined&&nerisProofDigest(ctx.nationalRow)!==pin.national)return fail();
 return value as T;
}
