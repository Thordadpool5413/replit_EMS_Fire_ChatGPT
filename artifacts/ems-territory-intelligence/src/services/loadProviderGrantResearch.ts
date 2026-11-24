import {loadDiscoveryPage} from './publicIntelligenceDiscovery';
import {loadFederalDiscovery} from './federalSpendingDiscovery';
import {NATIONAL_STATES,femaResearch,federalResearch,unavailableScope,type ResearchScope,type ResearchSource} from './nationalCompetitiveResearch';
export async function loadProviderGrantResearch(state:string,signal:AbortSignal){
 if(!NATIONAL_STATES.includes(state))throw Error('A supported state is required.');
 const checkedAt=new Date().toISOString(),fromYear=new Date().getUTCFullYear()-2;
 const guard=async(source:ResearchSource,run:()=>Promise<ResearchScope>)=>{try{return await run();}catch{return unavailableScope(source);}};
 const scopes=await Promise.all([
  guard('fema',async()=>femaResearch(await loadDiscoveryPage({state,fromYear,offset:0},signal))),
  guard('federal-grants',async()=>federalResearch(await loadFederalDiscovery({state,fromYear,topic:'grants',page:1},signal))),
 ]);
 if(signal.aborted)throw Error('Grant research canceled.');
 return {checkedAt,scopes};
}
