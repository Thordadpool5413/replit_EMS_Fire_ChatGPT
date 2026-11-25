import {object} from './facilityEquipment';
import {createHash} from 'node:crypto';
export const ROLES=['leadership','clinical','operations','biomedical','procurement','budget','final-approval','other'] as const;
export type AuthorityRole=typeof ROLES[number];
export type AuthorityObservation={name:string;title:string;role:AuthorityRole;organization:string;scope:string;observedOn:string;basis:'official-document'|'agency-confirmation';sourceUrl:string;description:string};
function clean(v:unknown,max:number):string|undefined{
 return typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&v.trim()?v.trim():undefined;
}
/** Bind the observation to a saved account snapshot. An identity change withholds old claims, never transfers them. */
export function authorityIdentity(p:Record<string,unknown>):string|undefined{
 const id=clean(p.id,300),name=clean(p.name,300),state=clean(p.stateCode,2),source=typeof p.verificationSource==='string'?p.verificationSource:'';
 if(!id||!name||!state||!/^[A-Z]{2}$/.test(state)||p.dataProvenanceTier==='generated_prospect'||/^(?:zoll-agency-|zoll-lead-|territory-[a-z]{2}-(?:ems|fire)-|(?:ems|fire)-[a-z]{2}-\d{5}(?:-|$))/i.test(id)||/geographic prospect generator|generated geography-based prospect|Imported public-facing directory candidate|Imported account candidate/i.test(source))return undefined;
 const direct=object(p.registryIdentity);
 const links=(Array.isArray(p.sourceRecordAssociations)?p.sourceRecordAssociations:[]).map(object).filter(a=>a.decision==='confirmed').map(a=>JSON.stringify([a.sourceName,a.sourceRecordId,object(a.sourceFields).stateCode,object(a.sourceFields).identifierKind])).sort();
 return createHash('sha256').update(JSON.stringify([id,name,state,direct.sourceName,direct.identifier,direct.stateCode,direct.identifierKind,direct.deactivatedAt,links])).digest('hex');
}
export function parseAuthority(v:unknown,today=new Date().toISOString().slice(0,10)):AuthorityObservation|undefined{
 const p=object(v),name=clean(p.name,160),title=clean(p.title,200),organization=clean(p.organization,240),scope=clean(p.scope,240),description=clean(p.description,2000),observedOn=clean(p.observedOn,10),role=p.role as AuthorityRole,basis=p.basis;
 if(!name||!title||!organization||!scope||!description||!observedOn||!ROLES.includes(role)||(basis!=='official-document'&&basis!=='agency-confirmation')||!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)||observedOn<'1900-01-01'||observedOn>today)return undefined;
 const d=new Date(observedOn+'T00:00:00Z');if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==observedOn)return undefined;
 const sourceUrl=typeof p.sourceUrl==='string'&&p.sourceUrl.length<=1500?p.sourceUrl.trim():undefined;
 if(sourceUrl===undefined)return undefined;
 if(basis==='official-document'){
  try{const u=new URL(sourceUrl);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')return undefined;}catch{return undefined;}
 }else if(sourceUrl!=='')return undefined;
 return {name,title,organization,role,scope,observedOn,basis,sourceUrl,description};
}
