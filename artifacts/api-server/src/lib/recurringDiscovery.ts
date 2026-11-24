import {FEED_SCOPES,FEED_SCOPE_IDS,FEED_LIMIT,FEED_RETAIN_DAYS,feedKey,scopeMatches,validateFeedCandidate,validateDiscoveryFeed,type FeedScope,type FeedCandidate,type FeedItem,type FeedScopeStatus,type DiscoveryFeed} from './recurringDiscoveryContract';
export type ScopeResult={id:FeedScope;status:'ok'|'partial'|'unavailable';sourceRows:number;withheld:number;hasMore:boolean;candidates:FeedCandidate[]};
/** Compare source-native records, never infer deletion or closure from absence. */
export function reconcileDiscoveryFeed(previous:DiscoveryFeed|undefined,results:ScopeResult[],now=Date.now()):DiscoveryFeed{
 const runAt=new Date(now).toISOString();
 const prior=previous?validateDiscoveryFeed(previous,now):undefined;
 if(prior&&prior.runAt>=runAt)throw Error('Discovery run must advance the feed clock.');
 if(results.length!==FEED_SCOPE_IDS.length||new Set(results.map(r=>r.id)).size!==results.length||FEED_SCOPE_IDS.some(id=>!results.some(r=>r.id===id)))throw Error('Every configured scope requires an explicit result.');
 const scopes:FeedScopeStatus[]=[],observed=new Map<string,{candidate:FeedCandidate;scopes:FeedScope[]}>(),conflicts=new Set<string>();
 for(const id of FEED_SCOPE_IDS){
  const r=results.find(x=>x.id===id)!;
  if(!['ok','partial','unavailable'].includes(r.status)||!Number.isInteger(r.sourceRows)||r.sourceRows<0||r.sourceRows>FEED_SCOPES[id].limit||!Number.isInteger(r.withheld)||r.withheld<0||r.withheld>r.sourceRows||typeof r.hasMore!=='boolean'||r.candidates.length>r.sourceRows-r.withheld||r.status==='unavailable'&&(r.sourceRows!==0||r.withheld!==0||r.hasMore||r.candidates.length!==0)||r.status==='ok'&&(r.hasMore||r.withheld>0))throw Error('Invalid scope outcome.');
  scopes.push({id,status:r.status,sourceRows:r.sourceRows,withheld:r.withheld,hasMore:r.hasMore,lastSuccess:r.status==='unavailable'?prior?.scopes.find(s=>s.id===id)?.lastSuccess??null:runAt});
  for(const raw of r.candidates){
   const c=validateFeedCandidate(raw);
   if(!scopeMatches(id,c))throw Error('Observation does not match its declared scope.');
   const key=feedKey(c),existing=observed.get(key);
   if(existing){
    if(JSON.stringify(existing.candidate)!==JSON.stringify(c))conflicts.add(key);
    else if(!existing.scopes.includes(id))existing.scopes.push(id);
   }else observed.set(key,{candidate:c,scopes:[id]});
  }
 }
 // A conflict invalidates the new observation, not the last observed historical record.
 for(const key of conflicts)observed.delete(key);
 const items=new Map<string,FeedItem>();
 for(const i of prior?.items??[])items.set(feedKey(i.candidate),i);
 for(const [key,o] of observed){
  const old=items.get(key),changed=!!old&&JSON.stringify(old.candidate)!==JSON.stringify(o.candidate);
  const hasBaseline=o.scopes.some(id=>!!prior?.scopes.find(s=>s.id===id)?.lastSuccess);
  items.set(key,{candidate:o.candidate,scopes:o.scopes.slice().sort(),firstSeen:old?.firstSeen??runAt,lastSeen:runAt,lastChanged:!old||changed?runAt:old.lastChanged,event:old?(changed?'changed':old.event):(hasBaseline?'new-to-sample':'baseline')});
 }
 const ordered=[...items.values()].filter(i=>now-Date.parse(i.lastSeen)<=FEED_RETAIN_DAYS*86_400_000).sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)||b.lastChanged.localeCompare(a.lastChanged)||feedKey(a.candidate).localeCompare(feedKey(b.candidate)));
 const kept=ordered.slice(0,FEED_LIMIT);
 return validateDiscoveryFeed({schemaVersion:1,runAt,scopes,items:kept,evicted:items.size-kept.length,conflictingIds:conflicts.size},now);
}
