import type {Agency} from '../types';
import {buildDiscoveryMatches} from './publicIntelligenceDiscovery';
import {parseFederalQuery,validateFederalPage,type FederalCandidate,type FederalQuery,type FederalPage} from './federalDiscoveryContract';
export async function loadFederalDiscovery(q:FederalQuery,signal?:AbortSignal):Promise<FederalPage>{
 if(!parseFederalQuery(q))throw Error('Invalid federal query.');
 const params=new URLSearchParams({state:q.state,fromYear:String(q.fromYear),topic:q.topic,page:String(q.page)});
 const response=await fetch('/api/discovery/federal?'+params,{credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000)});
 if(!response.ok)throw Error('Federal discovery unavailable (HTTP '+response.status+').');
 return validateFederalPage(await response.json(),q);
}
/** Grant awardees are possible account matches only. Contract recipients are vendors, never buyer matches. */
export function federalAccountCandidates(agencies:Agency[],candidates:FederalCandidate[]){
 const grants=buildDiscoveryMatches(agencies,candidates.filter(c=>c.kind==='grant'));
 const byId=new Map(grants.map(r=>[r.candidate.id,r]));
 return candidates.map(candidate=>candidate.kind==='grant'?byId.get(candidate.id)!:{candidate,account:undefined,status:'supplier-not-buyer' as const});
}
