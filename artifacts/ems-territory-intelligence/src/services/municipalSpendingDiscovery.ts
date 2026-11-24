import {parseMunicipalQuery,validateMunicipalPage,type MunicipalQuery,type MunicipalPage} from './municipalDiscoveryContract';
export async function loadMunicipalDiscovery(q:MunicipalQuery,signal?:AbortSignal):Promise<MunicipalPage>{
 if(!parseMunicipalQuery(q))throw Error('Invalid municipal query.');
 const params=new URLSearchParams({source:q.source,topic:q.topic,days:String(q.days),page:String(q.page)});
 const response=await fetch('/api/discovery/municipal?'+params,{credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000)});
 if(!response.ok)throw Error('Municipal discovery unavailable (HTTP '+response.status+').');
 return validateMunicipalPage(await response.json(),q);
}
