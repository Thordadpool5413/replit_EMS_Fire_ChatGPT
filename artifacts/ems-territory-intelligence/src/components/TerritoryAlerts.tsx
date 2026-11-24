import React,{useMemo,useState} from 'react';
import {Bell,ExternalLink} from 'lucide-react';
import type {Agency} from '../types';
import {ALERT_TYPES,ALERT_WINDOWS,alertState,alertOrganization,type AlertType,type TerritoryAlert} from '../services/territoryAlerts';
import type {TerritoryAlertState} from '../hooks/useTerritoryAlerts';
const input='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const statusText={offline:'Offline: public source changes are withheld.',loading:'Checking the published public feed…',unchecked:'Public feed not checked yet.',unavailable:'Public feed unavailable or not initialized. Local reminders are still available.',stale:'Public feed older than 48 hours; historical changes withheld.',ready:'Latest validated public snapshot checked.'} as const;
function AlertRow({alert:a,onOpen,onFollowUps}:{alert:TerritoryAlert;onOpen?:(a:Agency)=>void;onFollowUps:()=>void}){
 return <li className="py-3 space-y-1 min-w-0 break-words">
  <p className="text-xs font-medium">{a.urgency==='now'?'Needs attention now':a.urgency==='soon'?'Coming up':'Research'} · {ALERT_TYPES[a.type]}</p>
  <p className="font-semibold text-sm">{alertOrganization(a)} · {alertState(a)}</p><p className="text-sm">{a.title}</p>
  <p className="text-xs">{a.type==='followup'?'Local follow-up date':a.type==='funding'?'Document date':a.type==='public'?'Snapshot change date (UTC)':'Reported date (UTC calendar check)'}: {a.date}</p>
  <p className="text-sm">{a.detail}</p>
  {a.type==='public'?<>
   <p className="text-xs">{a.item.candidate.title} · record {a.item.candidate.recordNumber??a.item.candidate.nativeId}</p>
   {a.overlap&&<p className="text-xs">Possible cross-source grant overlap; do not add award amounts.</p>}
   <a className="inline-flex items-center gap-1 text-sm underline" href={a.item.candidate.sourceUrl} target="_blank" rel="noreferrer">Original public record <ExternalLink size={14} aria-hidden="true"/></a>
  </>:<>
   {a.signal&&<><p className="text-xs">{a.signal.evidence.sourceName} · {a.signal.evidence.documentDate} · {a.signal.evidence.sourceRecordId}</p><a className="inline-flex gap-1 items-center text-sm underline" href={a.signal.evidence.sourceUrl} target="_blank" rel="noreferrer">Original supporting document <ExternalLink size={14} aria-hidden="true"/></a><p className="text-sm"><strong>Next step:</strong> {a.signal.nextAction}</p></>}
   <div className="flex flex-wrap gap-2">{onOpen&&<button className="workspace-button" type="button" onClick={()=>onOpen(a.agency)}>Open account</button>}{a.type==='followup'&&<button className="workspace-button" type="button" onClick={onFollowUps}>Manage follow-ups</button>}</div>
  </>}
 </li>;
}
export function TerritoryAlerts({data,onOpen,onFollowUps}:{data:TerritoryAlertState;onOpen?:(a:Agency)=>void;onFollowUps:()=>void}){
 const [type,setType]=useState<AlertType|'all'>('all'),[state,setState]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const states=useMemo(()=>[...new Set(data.alerts.map(alertState).filter(Boolean))].sort(),[data.alerts]);
 const rows=data.alerts.filter(a=>(type==='all'||a.type===type)&&(state==='all'||alertState(a)===state)&&[a.title,alertOrganization(a),alertState(a)].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/6)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Territory alerts" data-testid="territory-alerts">
  <div className="flex items-start gap-2"><Bell size={20} aria-hidden="true" className="shrink-0"/><div className="min-w-0"><h2 className="font-semibold">Territory alerts</h2><p className="text-sm">Upcoming actions and public research changes across loaded accounts and monitored pilot scopes.</p></div></div>
  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">{[['Needs attention now',data.alerts.filter(a=>a.urgency==='now').length],['Coming up',data.alerts.filter(a=>a.urgency==='soon').length],['Research changes / documents',data.alerts.filter(a=>a.urgency==='research').length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
  <p className="text-xs" role="status">{statusText[data.feedStatus]}{data.public.feed?' Snapshot: '+new Date(data.public.feed.runAt).toLocaleString()+'. Unavailable scopes: '+data.public.feed.scopes.filter(s=>s.status==='unavailable').length+'.':''}</p>
  <button className="workspace-button" type="button" disabled={data.feedStatus==='offline'||data.feedStatus==='loading'} onClick={data.refresh}>Refresh public alerts</button>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Alert type<select className={input} value={type} onChange={e=>{setType(e.target.value as typeof type);setPage(1);}}><option value="all">All alerts</option>{Object.entries(ALERT_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="block text-sm">State<select className={input} value={state} onChange={e=>{setState(e.target.value);setPage(1);}}><option value="all">All alert states</option>{states.map(s=><option key={s}>{s}</option>)}</select></label></div>
  <label className="block text-sm">Search alerts<input className={input} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Organization, state or action"/></label>
  {!rows.length&&<p role="status" className="text-sm">No alerts in this selection. Missing documents or unavailable sources do not establish absence of deadlines or opportunities.</p>}
  <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*6,current*6).map(a=><AlertRow key={a.key} alert={a} onOpen={onOpen} onFollowUps={onFollowUps}/>)}</ul>
  {rows.length>6&&<div className="flex flex-wrap gap-2 items-center"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-sm">Page {current} of {Math.ceil(rows.length/6)}</span><button type="button" className="workspace-button" disabled={current*6>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>}
  <details><summary className="text-sm font-medium cursor-pointer">Alert rules and coverage</summary><div className="mt-2 space-y-1 text-xs"><p>Open saved follow-ups overdue or due within {ALERT_WINDOWS.followUpDays} local days; eligible local solicitation dates within {ALERT_WINDOWS.bidDays} UTC calendar days; eligible documented contract end dates within {ALERT_WINDOWS.contractDays} days; recent grant/capital document dates within {ALERT_WINDOWS.fundingDocumentDays} days. Public changes are from the latest fresh monitored snapshot, not necessarily newly published records.</p><p>{data.local.loadedRows.toLocaleString()} loaded account rows; {data.local.withheldTasks} ambiguous/invalid or undated open task entries withheld; {data.local.identityExcluded} typed rows excluded for identity; {data.local.reviewRequired} typed rows requiring review. Local document alerts reuse the Radar’s reconciliation gates. The public feed covers only configured Florida and NYC pilot scopes; no automatic association to providers.</p><p>Alerts recalculate as loaded records or dates change. Public feed checks are automatic while the app is visible and online (at most once per 15 minutes, except explicit refresh or return from hidden state). No push, email, background delivery, task creation or data edits. Verify sources and procurement rules before acting.</p></div></details>
 </section>;
}
