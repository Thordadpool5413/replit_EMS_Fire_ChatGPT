import {authorityIdentity} from './agencyAuthority';
import {validNpi} from './providerLocationContract';
export const STAGES=['research','qualified','evaluation','procurement','won','closed'] as const;
type Stage=typeof STAGES[number];
const limits={need:300,authority:160,milestone:300,reference:300,nextAction:300,dueDate:10} as const;
type Input={stage:Stage}&Record<keyof typeof limits,string>;
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function parsePipelineInput(v:unknown):Input|undefined{
 const p=obj(v),stage=p.stage as Stage;if(!STAGES.includes(stage))return;
 const input={stage} as Input;
 for(const k of Object.keys(limits) as (keyof typeof limits)[]){const value=p[k];if(typeof value!=='string'||value.length>limits[k]||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))return;input[k]=value.trim();}
 if(input.dueDate&&!day(input.dueDate))return;
 if(stage!=='research'&&stage!=='closed'&&(!input.need||!input.authority||!input.reference))return;
 if(['evaluation','procurement','won','closed'].includes(stage)&&!input.milestone)return;
 const terminal=stage==='won'||stage==='closed';
 if(terminal&&!input.reference||!terminal&&stage!=='research'&&(!input.nextAction||!input.dueDate)||!!input.nextAction!==!!input.dueDate)return;
 return input;
}
export function pipelineIdentity(p:Record<string,unknown>){
 const binding=authorityIdentity(p),r=obj(p.registryIdentity),state=p.stateCode;
 if(!binding||typeof state!=='string'||r.stateCode!==state||typeof r.identifier!=='string'||typeof r.name!=='string'||!r.name.trim()||r.deactivatedAt||r.headquartersState&&r.headquartersState!==state||typeof r.sourceUrl!=='string')return;
 const id=r.identifier.trim().toUpperCase(),source=r.sourceName;
 if(!/^[-A-Z0-9.]{1,80}$/.test(id)||/^LOCATION-/.test(id))return;
 let u:URL;try{u=new URL(r.sourceUrl);}catch{return;}
 if(u.protocol!=='https:'||u.username||u.password)return;
 let key:string|undefined;
 if(source==='USFA NFDR'&&u.hostname==='apps.usfa.fema.gov'&&!/^[A-Z]{2}-(?:FD|EMS)-\d{5}/.test(id))key='FDID:'+state+':'+id;
 if(source==='NPPES'&&u.hostname==='npiregistry.cms.hhs.gov'&&validNpi(r.identifier))key='NPI:'+id;
 if(source==='NERIS'&&['www.usfa.fema.gov','services5.arcgis.com'].includes(u.hostname))key='NERIS:'+id;
 if(source==='State EMS'&&state==='OH'&&r.identifierKind==='agency-code'&&u.hostname==='ems.ohio.gov'&&['Paramedic','AEMT','EMT','EMR'].includes(String(r.serviceLevel)))key='STATE-EMS:OH:agency-code:'+id;
 if(source==='State EMS'&&state==='FL'&&r.identifierKind==='license'&&/^\d{1,12}$/.test(id)&&r.headquartersState==='FL'&&u.href==='https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf'&&['AIR/I','AIR/IR','AIR/IP','AIR/P','ALS/T','ALS/N','BLS/T','BLS/N'].includes(String(r.serviceLevel))&&day(r.licenseIssuedAt)&&day(r.licenseExpiresAt)&&day(r.sourceDate)&&r.licenseIssuedAt<=r.sourceDate&&r.licenseExpiresAt>=r.sourceDate)key='STATE-EMS:FL:license:'+id;
 return key?{key,binding,source:String(source),id,state,kind:typeof r.identifierKind==='string'?r.identifierKind:''}:undefined;
}
export function parsePipelineWrite(v:unknown){
 const p=obj(v),input=parsePipelineInput(p.input);
 if(!input||p.confirmed!==true||typeof p.identityKey!=='string'||p.identityKey.length>120||typeof p.binding!=='string'||!/^[a-f0-9]{64}$/.test(p.binding)||typeof p.expectedRevision!=='number'||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||p.expectedRevision>=2147483647)return;
 return {input,identityKey:p.identityKey,binding:p.binding,expectedRevision:p.expectedRevision};
}
export function pipelineRecord(input:Input,agencyId:string,identityKey:string,revision:number,at:string,history:{stage:Stage;at:string}[]){
 return {...input,agencyId,identityKey,revision,updatedAt:at,history:[...history,{stage:input.stage,at}].slice(-50)};
}
