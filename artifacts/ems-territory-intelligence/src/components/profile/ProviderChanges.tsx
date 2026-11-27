import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';

export function ProviderChanges({evidence}:{evidence?:ProviderEvidence}) {
  const events:{date:string;label:string;detail:string;source:string;reported:string}[]=[];
  for(const item of evidence?.equipment??[]) {
    for(const [date,label] of [[item.approvedOn,'Approval'],[item.lastPurchasedOn,'Purchase'],[item.acquiredOn,'Acquisition'],[item.paidOn,'Payment']] as const) {
      if(date) events.push({date,label,detail:[item.manufacturer,item.model??item.category,item.quantity!=null && item.quantity+' units'].filter(Boolean).join(' · '),source:item.source.label,reported:item.source.date});
    }
  }
  for(const item of evidence?.funding??[]) events.push({date:item.source.date,label:item.status+' reported',detail:item.title,source:item.source.label,reported:item.source.date});
  const sortDate=(value:string)=>value.match(/\d{4}(?:-\d{2}){0,2}/)?.[0]??'';
  events.sort((a,b)=>sortDate(b.date).localeCompare(sortDate(a.date)));
  if (!events.length) return null;
  return <section className="pr-panel"><h2 className="pr-icon-heading"><CalendarClock size={20}/>What changed at this provider?</h2>
    {events.length ? <><p>Latest documented equipment and funding milestones</p><ol className="provider-events">{events.slice(0,3).map((r,i)=><li key={i}><small>{r.date} · {r.label}</small><strong>{r.detail}</strong><span>{r.source} · reported {r.reported}</span></li>)}</ol></> : <p>No dated equipment or funding milestones matched to this profile.</p>}
  </section>;
}
