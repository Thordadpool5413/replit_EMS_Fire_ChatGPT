import type {RegistryIdentity} from './registryAccountLink';
export interface StateEmsRoster {
 schemaVersion:1;stateCode:'OH';sourceName:string;sourceUrl:string;sourceDate:string|null;retrievedAt:string;identifierKind:'agency-code';scope:string;
 records:{identifier:string;name:string;city:string;serviceLevel:string|null}[];
}
const OH_URL='https://ems.ohio.gov/ems-trauma-data/data-center-resources/ohio-ems-agency-list';
export function validateOhioRoster(value:unknown):StateEmsRoster{
 const x=value as StateEmsRoster;
 if(!x||x.schemaVersion!==1||x.stateCode!=='OH'||x.sourceUrl!==OH_URL||x.identifierKind!=='agency-code'||!x.sourceName||!x.scope||!/^\d{4}-\d{2}-\d{2}$/.test(x.retrievedAt)||!Array.isArray(x.records)||x.records.length<500)throw Error('Ohio roster metadata or record count is invalid.');
 const ids=new Set<string>();
 for(const r of x.records){
 if(!r||typeof r.identifier!=='string'||!/^[-A-Z0-9]+$/i.test(r.identifier)||ids.has(r.identifier)||typeof r.name!=='string'||!r.name.trim()||typeof r.city!=='string'||![null,'None','EMR','EMT','AEMT','Paramedic'].includes(r.serviceLevel))throw Error('Ohio roster contains invalid or duplicate agency codes.');
 ids.add(r.identifier);
 }
 return x;
}
let pending:Promise<StateEmsRoster>|undefined;
export function loadOhioRoster():Promise<StateEmsRoster>{
 if(!pending)pending=fetch((import.meta.env?.BASE_URL??'/')+'registry/state-ems/OH.json',{signal:AbortSignal.timeout(30000)}).then(async r=>{if(!r.ok)throw Error('Ohio agency roster could not be loaded.');return validateOhioRoster(await r.json());}).catch(e=>{pending=undefined;throw e});
 return pending;
}
export function ohioRegistryIdentity(roster:StateEmsRoster,record:StateEmsRoster['records'][number]):RegistryIdentity{
 return {sourceName:'State EMS',sourceAuthority:roster.sourceName,identifierKind:'agency-code',identifier:record.identifier,name:record.name,stateCode:'OH',city:record.city,sourceUrl:roster.sourceUrl,sourceDate:roster.sourceDate,retrievedAt:roster.retrievedAt,serviceLevel:record.serviceLevel};
}
