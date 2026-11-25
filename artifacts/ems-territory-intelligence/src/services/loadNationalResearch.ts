import {loadDiscoveryPage} from './publicIntelligenceDiscovery';
import {loadFederalDiscovery} from './federalSpendingDiscovery';
import {loadChicagoDiscovery} from './chicagoDiscovery';
import {loadMunicipalDiscovery} from './municipalSpendingDiscovery';
import {NATIONAL_STATES,NATIONAL_TOPICS,NYC_TOPIC,femaResearch,federalResearch,municipalResearch,chicagoResearch,unavailableScope,type NationalTopic,type ResearchSource,type ResearchScope,type StateResearch} from './nationalCompetitiveResearch';
/** Explicit selected-state, first-page checks only. No background fan-out or provider data transmission. */
export async function loadNationalResearch(state:string,topic:NationalTopic,fromYear:number,signal:AbortSignal):Promise<StateResearch>{
 const now=Date.now(),year=new Date(now).getUTCFullYear();
 if(!NATIONAL_STATES.includes(state)||!Object.hasOwn(NATIONAL_TOPICS,topic)||!Number.isInteger(fromYear)||fromYear<2010||fromYear>year)throw Error('Invalid national research scope.');
 const guarded=async(source:ResearchSource,run:()=>Promise<ResearchScope>)=>{try{return await run();}catch{return unavailableScope(source);}};
 const scopes=await Promise.all([
  guarded('fema',async()=>femaResearch(await loadDiscoveryPage({state,fromYear,offset:0},signal))),
  guarded('federal-grants',async()=>federalResearch(await loadFederalDiscovery({state,fromYear,topic:'grants',page:1},signal))),
  guarded('federal-contracts',async()=>federalResearch(await loadFederalDiscovery({state,fromYear,topic,page:1},signal))),
  state==='NY'?guarded('municipal',async()=>municipalResearch(await loadMunicipalDiscovery({source:'nyc-city-record',topic:NYC_TOPIC[topic],days:90,page:1},signal))):Promise.resolve(unavailableScope('municipal','not-covered')),
  state==='IL'?guarded('chicago',async()=>chicagoResearch(await loadChicagoDiscovery({topic:NYC_TOPIC[topic],days:365,page:1},signal))):Promise.resolve(unavailableScope('chicago','not-covered')),
 ]);
 if(signal.aborted)throw Error('Research canceled.');
 return {state,topic,fromYear,checkedAt:new Date(now).toISOString(),scopes};
}
