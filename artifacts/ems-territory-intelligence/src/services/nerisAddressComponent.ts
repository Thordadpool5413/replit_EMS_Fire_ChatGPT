import {normalizeStreet,sourceStreetLine,type SourceAddress} from './addressNormalization';

/** Native fields are preserved even when a physical line and a mailbox coexist. */
export type NerisNativeAddress=[string|null,string|null,string|null,string,string|null];
export type NerisAddressComponent={
 sourceField:'line1'|'line2';
 rule:'native-physical-line1'|'native-physical-line2';
 otherLineKind:'empty'|'secondary-designator'|'mailing-address'|'nonphysical-text'|'duplicate-physical-address'|'distinct-physical-address';
};
export type NerisAddressSelection={address:SourceAddress;component:NerisAddressComponent|null;conflict:boolean;hasPhysical:boolean};
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const safeText=(v:unknown):v is string|null=>v===null||typeof v==='string'&&v.length<=255&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const mailbox=/\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b/i;
const anyMailbox=/\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX|RURAL ROUTE|RR\s+\d+\s+BOX)\b/i;
const secondary=/^(?:STE|SUITE|UNIT|APT|APARTMENT|FL|FLOOR|RM|ROOM|BLDG|BUILDING|DEPT|DEPARTMENT|#)\s+[A-Z0-9-]+$/i;
export const nerisZip=(v:string|null)=>/^\d{5}(?:[- ]?\d{4})?$/.test((v??'').trim())?(v??'').trim().slice(0,5):'';
export const sameNerisAddress=(a:SourceAddress,b:SourceAddress)=>a.street===b.street&&a.city===b.city&&a.state===b.state&&a.zip===b.zip;
export const validNerisCoordinates=(v:unknown):v is [number,number]=>Array.isArray(v)&&v.length===2&&v.every(x=>typeof x==='number'&&Number.isFinite(x))&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180&&(v[0]!==0||v[1]!==0);

/** Same conservative native-field selection as recover_neris_primary.native_address. */
export function selectNerisNativeAddress(value:unknown):NerisAddressSelection|undefined{
 if(!Array.isArray(value)||value.length!==5||!value.every(safeText)||typeof value[3]!=='string'||!states.has(value[3]))return undefined;
 const raw=value as NerisNativeAddress;
 const lines=[(raw[0]??'').trim(),(raw[1]??'').trim()];
 const base={city:(raw[2]??'').trim(),state:raw[3],zip:nerisZip(raw[4])};
 const physical=lines.map(line=>/^\d+[A-Z]?(?:[- ]\d+[A-Z]?)?\s+\S/i.test(sourceStreetLine(line))&&!anyMailbox.test(sourceStreetLine(line)));
 if(!physical.some(Boolean))return {address:{...base,street:lines.filter(Boolean).join(', ')},component:null,conflict:false,hasPhysical:false};
 const selected=physical[0]?0:1,other=1-selected;
 const conflict=physical.every(Boolean)&&normalizeStreet(sourceStreetLine(lines[0]))!==normalizeStreet(sourceStreetLine(lines[1]));
 const otherLineKind:NerisAddressComponent['otherLineKind']=!lines[other]?'empty':physical[other]?(conflict?'distinct-physical-address':'duplicate-physical-address'):mailbox.test(lines[other])?'mailing-address':secondary.test(lines[other])?'secondary-designator':'nonphysical-text';
 const sourceField=selected===0?'line1':'line2';
 return {address:{...base,street:lines[selected]},component:{sourceField,rule:selected===0?'native-physical-line1':'native-physical-line2',otherLineKind},conflict,hasPhysical:true};
}

/** Call only for a match carrying the new native-component evidence. */
export function validateNerisAddressComponent(point:unknown,sourceAddress:SourceAddress):boolean{
 if(!obj(point)||!obj(point.addressComponent)||!validNerisCoordinates(point.coordinatesAsReported))return false;
 const selected=selectNerisNativeAddress(point.addressAsReported),component=point.addressComponent;
 return !!selected?.component&&!selected.conflict&&sameNerisAddress(selected.address,sourceAddress)&&
  component.sourceField===selected.component.sourceField&&component.rule===selected.component.rule&&component.otherLineKind===selected.component.otherLineKind;
}
