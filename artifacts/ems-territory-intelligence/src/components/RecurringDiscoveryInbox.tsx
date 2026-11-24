import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ExternalLink,Radar} from 'lucide-react';
import {FEED_SCOPES,FEED_SCOPE_IDS,feedIsStale,feedKey,possibleGrantOverlap,type DiscoveryFeed,type FeedScope,type FeedItem} from '../services/recurringDiscoveryContract';
import {loadRecurringDiscovery} from '../services/recurringDiscovery';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const kinds={grant:'Reported grant award','federal-contract-award':'Federal supplier award','municipal-solicitation':'Published solicitation','municipal-award':'Published award','municipal-intent':'Intent to award','municipal-other':'Other procurement notice'} as const;
const date=(s:string)=>new Date(s).toLocaleString();
export function RecurringDiscoveryInbox(){
 const [feed,setFeed]=useState<DiscoveryFeed>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[scope,setScope]=useState<FeedScope|'all'>('all'),[filter,setFilter]=useState<'latest'|'changes'|'retained'|'all'>('latest'),[page,setPage]=useState(1);
 const [clock,setClock]=useState(Date.now());
 const request=useRef<AbortController|undefined>(undefined);
 useEffect(()=>{
  const offline=()=>{request.current?.abort();request.current=undefined;setBusy(false);setFeed(undefined);setError('Offline. The feed is not cached as live intelligence.');};
  window.addEventListener('offline',offline);
  const timer=window.setInterval(()=>setClock(Date.now()),60_000);
  return()=>{request.current?.abort();window.removeEventListener('offline',offline);window.clearInterval(timer);};
 },[]);
 async function refresh(){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setFeed(undefined);setError('');setPage(1);
  try{const data=await loadRecurringDiscovery(controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setClock(Date.now());setFeed(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not retrieve discovery feed.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const overlap=useMemo(()=>possibleGrantOverlap(feed?.items??[]),[feed]);
 const latest=(i:FeedItem)=>i.lastSeen===feed?.runAt;
 const changed=(i:FeedItem)=>latest(i)&&i.lastChanged===feed?.runAt&&i.event!=='baseline';
 const rows=(feed?.items??[]).filter(i=>(scope==='all'||i.scopes.includes(scope))&&(filter==='all'||filter==='latest'&&latest(i)||filter==='changes'&&changed(i)||filter==='retained'&&!latest(i))&&[i.candidate.title,i.candidate.organization,i.candidate.recordNumber,i.candidate.vendor].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Recurring intelligence inbox" data-testid="recurring-discovery-inbox">
  <div className="flex items-start gap-2"><Radar size={20} className="shrink-0" aria-hidden="true"/><div className="min-w-0"><h2 className="font-semibold">Intelligence inbox</h2><p className="text-sm">Recurring public-source research · pilot: Florida federal awards and NYC purchasing notices.</p></div></div>
  <button type="button" className="workspace-button" disabled={busy} onClick={()=>void refresh()}>{busy?'Checking feed…':'Check discovery inbox'}</button>
  <p className="text-xs">New means new to the monitored sample, not newly awarded or published. Source changes are research leads, not verified opportunities. No record disappearance is treated as closure.</p>
  {busy&&<p role="status" className="text-sm">Checking the latest published discovery snapshot.</p>}
  {error&&<p role="alert" className="text-sm break-words">{error}</p>}
  {feed&&<>
   <p className="text-xs">Last attempted run {date(feed.runAt)} · bounded first pages; not a statewide or nationwide census.</p>
   {feedIsStale(feed,clock)&&<p role="alert" className="text-sm font-medium">Feed is older than 48 hours. All results are historical research only.</p>}
   <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[['Seen in latest run',feed.items.filter(latest).length],['New / changed',feed.items.filter(changed).length],['Retained history',feed.items.filter(i=>!latest(i)).length],['Unavailable scopes',feed.scopes.filter(s=>s.status==='unavailable').length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
   <details><summary className="text-sm font-medium cursor-pointer">Source coverage and last successful checks</summary><ul className="divide-y divide-slate-200 dark:divide-slate-700">{feed.scopes.map(s=><li key={s.id} className="py-2 text-sm break-words"><p>{FEED_SCOPES[s.id].label}</p><p className="text-xs">{s.status==='unavailable'?'Unavailable':s.status==='partial'?'Partial page / withheld records':'Page retrieved'} · {s.sourceRows} source rows · {s.withheld} withheld{s.hasMore?' · more pages available':''}</p><p className="text-xs">Last usable retrieval: {s.lastSuccess?date(s.lastSuccess):'None'}</p></li>)}</ul></details>
   {(feed.conflictingIds>0||feed.evicted>0)&&<p className="text-xs">{feed.conflictingIds} conflicting source identities withheld this run · {feed.evicted} older records removed from the bounded display history.</p>}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Research scope<select className={control} value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setPage(1);}}><option value="all">All pilot scopes</option>{FEED_SCOPE_IDS.map(id=><option key={id} value={id}>{FEED_SCOPES[id].label}</option>)}</select></label><label className="block text-sm">View<select className={control} value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(1);}}><option value="latest">Seen in latest run</option><option value="changes">New or changed this run</option><option value="retained">Retained / not seen this run</option><option value="all">All retained candidates</option></select></label></div>
   <label className="block text-sm">Search<input className={control} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Organization, title, vendor or record number"/></label>
   {!rows.length&&<p role="status" className="text-sm">No records match this view. This does not establish absence of procurement activity.</p>}
   <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*8,current*8).map(i=>{const c=i.candidate;return <li key={feedKey(c)} className="py-3 space-y-1 min-w-0 break-words"><p className="font-semibold text-sm">{c.organization} · {c.state}</p><p className="text-sm">{c.title} · {kinds[c.kind]}</p><p className="text-xs">{!latest(i)?'Retained history · not seen this run':changed(i)?i.event==='changed'?'Source fields changed':'New to monitored sample':'Seen in latest sample'} · {c.recordNumber??c.nativeId}</p><p className="text-xs">First seen {date(i.firstSeen)} · Last observed {date(i.lastSeen)} · Last change {date(i.lastChanged)}</p>
    {c.fiscalYear!==null&&<p className="text-xs">Reported fiscal year {c.fiscalYear} (not award date)</p>}{c.publishedDay&&<p className="text-xs">Published {c.publishedDay}</p>}{(c.periodStart||c.periodEnd)&&<p className="text-xs">Reported performance period: {c.periodStart??'Not stated'} to {c.periodEnd??'Not stated'}</p>}{c.deadlineLocal&&<p className="text-xs">Published local deadline {c.deadlineLocal.replace('T',' ')} · verify current status</p>}{c.vendor&&<p className="text-xs">Reported vendor: {c.vendor}</p>}
    <p className="text-sm">Reported amount: {c.amount===null?'Not stated':money.format(c.amount)}</p>{overlap.has(feedKey(c))&&<p className="text-xs font-medium">Possible cross-source grant overlap; review both records, do not total amounts.</p>}{c.kind==='federal-contract-award'&&<p className="text-xs">Recipient is a supplier, not a confirmed purchasing agency.</p>}
    <a className="inline-flex items-center gap-1 underline text-sm" href={c.sourceUrl} target="_blank" rel="noreferrer">Open original source record <ExternalLink size={12} aria-hidden="true"/></a></li>;})}</ul>
   <div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-xs">Page {current}</span><button type="button" className="workspace-button" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
  </>}
  <p className="text-xs">Public records only. No agency assignments, reviewed evidence writes, sales scores, saved private notes or automatic notifications.</p>
 </section>;
}
