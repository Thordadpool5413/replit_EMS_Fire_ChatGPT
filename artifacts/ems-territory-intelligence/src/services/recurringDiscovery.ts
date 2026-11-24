import {validateDiscoveryFeed,type DiscoveryFeed} from './recurringDiscoveryContract';
export async function loadRecurringDiscovery(signal:AbortSignal):Promise<DiscoveryFeed>{
 const response=await fetch('/api/discovery/feed',{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)])});
 if(response.status===503)throw Error('The recurring feed has not been initialized. Manual discovery remains available below.');
 if(!response.ok)throw Error('Recurring discovery feed unavailable. Try again or use the original source.');
 return validateDiscoveryFeed(await response.json());
}
