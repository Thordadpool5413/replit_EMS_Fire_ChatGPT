import React,{useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildTerritoryCommand,type CommandView} from '../services/territoryCommand';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision} from '../services/providerLocation';
import {localDay} from '../utils/followUps';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
export function TerritoryCommandSummary({agencies,selected,samples,onView,onOpenAgency,view}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];onView:(v:CommandView)=>void;onOpenAgency:(a:Agency)=>void;view:CommandView}){
 useLocationRevision();
 const r=buildTerritoryCommand(agencies,selected,samples,resolve,localDay());
 const shortcuts:{label:string;view:CommandView}[]=[{label:'Territory analytics',view:'analytics'},{label:'Field coaching',view:'coaching'},{label:'Leadership review',view:'leadership'},{label:'Working sales pipeline',view:'pipeline'},{label:'Account activity',view:'activity'},{label:'Field execution plan',view:'plan'}];
 const tiles:{label:string;value:number;view:CommandView;detail:string}[]=[
  {label:'Priority accounts',value:r.priorities.length,view:'priorities',detail:r.urgent+' with near deadlines to verify now'},
  {label:'Dated purchasing',value:r.deadlines,view:'commercial',detail:'Accounts with reviewed dates within 90 days'},
  {label:'Funding research',value:r.funding,view:'commercial',detail:'Accounts with eligible funding documents'},
  {label:'Competitive research',value:r.competitive,view:'competitive',detail:'Accounts with reviewed competitor observations'},
  {label:'Mapped research',value:r.mapped,view:'geography',detail:r.groups+' multi-account proximity groups'},
  {label:'Coverage gaps',value:r.selected-r.checked,view:'coverage',detail:'Selected accounts without a complete document sample'},
  {label:'Open follow-ups',value:r.tasks.length,view:'followups',detail:r.overdue+' overdue · '+r.today+' today'}
 ];
 return <section className="space-y-3 min-w-0" aria-label="Selected territory command center">
  <header><h3 className="font-semibold">Territory command center</h3><p className="text-xs">{r.selected} selected · {r.eligible} unique source-native accounts · {r.checked} complete reviewed document samples. This is not a state or territory census.</p></header>
  {r.invalidScope&&<p role="status">Invalid selection; refresh account scope.</p>}
  {view==='overview'&&<>
   <div className="research-metric-grid">{tiles.map(t=><button type="button" className="research-metric" key={t.label} onClick={()=>onView(t.view)}><span className="text-xs font-medium break-words">{t.label}</span><strong>{t.value}</strong><span className="text-xs break-words">{t.detail}</span></button>)}</div>
   <h4 className="font-semibold">Workspaces</h4>
   <div className="research-shortcuts">{shortcuts.map(t=><button key={t.view} type="button" onClick={()=>onView(t.view)}>{t.label}</button>)}</div>
   <p className="text-xs">Counts are accounts except follow-ups, which are local task records. Categories may overlap; never add them into a pipeline total. Location gaps: {r.locationGaps}. Ambiguous commercial signals withheld: {r.ambiguous}.</p>
   <h4 className="font-semibold">Start with these accounts</h4>
   {!r.priorities.length&&<p>No eligible reviewed priority signals in this sample. Research gaps remain.</p>}
   <ol className="divide-y">{r.priorities.slice(0,3).map(a=><li key={a.identityKey} className="py-2 space-y-1 break-words"><p className="font-semibold">{a.agency.name}</p><p>{OPPORTUNITY_LABELS[a.primary.signal.kind]}{a.primary.days!==undefined?' · '+a.primary.days+' days':''}</p><p className="text-xs">{a.primary.signal.nextAction}</p><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open profile and prepare</button></li>)}</ol>
  </>}
 </section>;
}
export function CommandFollowUps({agencies,selected,samples,onOpenAgency}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];onOpenAgency:(a:Agency)=>void}){
 const [filter,setFilter]=useState<'all'|'overdue'|'today'|'upcoming'|'no-date'>('all'),[page,setPage]=useState(1);
 const r=buildTerritoryCommand(agencies,selected,samples,resolve,localDay()),rows=r.tasks.filter(t=>filter==='all'||t.bucket===filter),current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="space-y-2" aria-label="Selected account follow-ups"><h4 className="font-semibold">Selected account follow-ups</h4><p className="text-xs">Existing device workspace tasks only. Not a personal assignment list or server sync confirmation. No task, customer commitment or CRM stage is changed here.</p><label>Task status<select className="block w-full min-w-0 rounded border p-2 bg-transparent text-base" value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(1);}}>{(['all','overdue','today','upcoming','no-date'] as const).map(k=><option key={k} value={k}>{k.replaceAll('-',' ')}</option>)}</select></label>
 {!rows.length&&<p>No matching recorded open tasks for these selected accounts.</p>}
 <ul className="divide-y">{rows.slice((current-1)*8,current*8).map(t=><li key={t.agency.id+':'+t.id} className="py-2 space-y-1 break-words"><p className="font-semibold">{t.agency.name}</p><p>{t.action}</p><p className="text-xs">{t.bucket.replaceAll('-',' ')} · {t.dueDate||'Date not set'} · {t.owner||'Unassigned'}</p><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(t.agency)}>Open provider to manage task</button></li>)}</ul>
 {r.withheldTasks>0&&<p className="text-xs">{r.withheldTasks} task records withheld because IDs are missing or duplicated.</p>}
 {rows.length>8&&<div className="flex gap-2 items-center"><button type="button" className="workspace-button min-h-11" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button min-h-11" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>}
 </section>;
}
