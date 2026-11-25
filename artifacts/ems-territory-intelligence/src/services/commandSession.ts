import type {Agency} from '../types';
import {eligiblePriorityAccounts,MAX_REVIEW_ACCOUNTS,type ReviewedSample} from './reviewedAccountPriorities';
import {providerIdentityReady} from './providerCompetitiveProfile';
export const REVIEW_TTL_MS=300000;
export type CommandSample={samples:ReviewedSample[];started:number;scope:string};
/** Bind every command tab to a current, unique source-native provider selection. */
export function commandSelection(agencies:Agency[],state:string,selected:string[]){
 const eligible=eligiblePriorityAccounts(agencies).filter(a=>providerIdentityReady(a.agency,agencies));
 const inState=eligible.filter(a=>a.agency.stateCode===state);
 const chosen=inState.filter(a=>selected.includes(a.agency.id));
 const valid=!!state&&selected.length>0&&selected.length<=MAX_REVIEW_ACCOUNTS&&new Set(selected).size===selected.length&&chosen.length===selected.length;
 const scope=JSON.stringify([state,chosen.map(({agency:a,identityKey})=>[a.id,identityKey,a.name,a.registryIdentity?.name,a.registryIdentity?.sourceUrl]).sort()]);
 return {eligible,inState,chosen,valid,scope};
}
export function currentCommandSample(result:CommandSample|undefined,selection:Pick<ReturnType<typeof commandSelection>,'valid'|'scope'>,online:boolean,now=Date.now()){
 return online&&selection.valid&&result&&result.scope===selection.scope&&Number.isFinite(now)&&Number.isFinite(result.started)&&result.started<=now&&now-result.started<REVIEW_TTL_MS?result:undefined;
}
