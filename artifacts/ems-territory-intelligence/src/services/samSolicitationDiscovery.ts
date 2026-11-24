import {parseSamQuery,validateSamPage,type SamPage,type SamQuery} from './samDiscoveryContract';
export async function loadSamDiscovery(q:SamQuery,signal?:AbortSignal):Promise<SamPage>{
 if(!parseSamQuery(q))throw Error('Invalid solicitation query.');
 const params=new URLSearchParams({state:q.state,topic:q.topic,noticeType:q.noticeType,days:String(q.days),offset:String(q.offset)});
 const response=await fetch('/api/discovery/sam?'+params,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000)});
 if(response.status===503)throw Error('SAM.gov discovery is not configured. Use the official portal or contact your administrator.');
 if(response.status===403||response.status===401)throw Error('SAM.gov discovery requires an authorized workspace gateway.');
 if(response.status===429)throw Error('SAM.gov request budget reached. Use the official portal or retry later.');
 if(!response.ok)throw Error('SAM.gov could not confirm a notice page (HTTP '+response.status+').');
 return validateSamPage(await response.json(),q);
}
