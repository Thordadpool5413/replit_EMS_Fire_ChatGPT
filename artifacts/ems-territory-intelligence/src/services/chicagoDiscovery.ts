import {parseChicagoQuery,validateChicagoPage,type ChicagoQuery,type ChicagoPage} from './chicagoDiscoveryContract';
export async function loadChicagoDiscovery(q:ChicagoQuery,signal:AbortSignal):Promise<ChicagoPage>{
 if(!parseChicagoQuery(q))throw Error('Invalid Chicago query.');
 const params=new URLSearchParams({topic:q.topic,days:String(q.days),page:String(q.page)});
 const response=await fetch('/api/discovery/chicago?'+params,{credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(25_000)])});
 if(!response.ok)throw Error('Chicago contract discovery unavailable (HTTP '+response.status+').');
 return validateChicagoPage(await response.json(),q);
}
