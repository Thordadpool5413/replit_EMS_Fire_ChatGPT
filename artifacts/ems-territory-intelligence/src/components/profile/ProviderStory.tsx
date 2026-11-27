import React, { useState } from 'react';
import { CalendarClock, Warehouse, Landmark, Truck, CircleDot } from 'lucide-react';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';
import { NerisDepartmentStations } from './NerisDepartmentStations';
import { providerCurrency } from '../../services/providerCardIntelligence';
import './ProviderStory.css';

type Event = { date: string; stage: string; title: string; detail: string };
const dateFields = [
  ['approvedOn', 'Approved'], ['lastPurchasedOn', 'Purchased'], ['acquiredOn', 'Acquired'],
  ['paidOn', 'Paid'], ['padsExpireOn', 'Pads expire'], ['batteriesExpireOn', 'Batteries expire'],
  ['serviceEnds', 'Service ends'], ['warrantyEnds', 'Warranty ends'],
] as const;
const dateKey = (value: string) => value.match(/\d{4}(?:-\d{2}){0,2}/)?.[0] ?? '';
function Timeline({ events, empty }: { events: Event[]; empty: string }) {
  if (!events.length) return <p>{empty}</p>;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  const history = events.filter(e => !upcoming.includes(e)).sort((a,b) => dateKey(b.date).localeCompare(dateKey(a.date)));
  return <>{[['Upcoming dates', upcoming], ['Recorded milestones', history]].map(([heading, entries]) => {
    const rows = entries as Event[];
    return rows.length ? <section key={String(heading)}><h4>{String(heading)}</h4><ol className="provider-events">{rows.map((row, i) =>
      <li key={i}><CircleDot size={16} aria-hidden="true"/><small>{row.date} · {row.stage}</small><strong>{row.title}</strong><span>{row.detail}</span></li>)}</ol></section> : null;
  })}</>;
}

const views = [['Equipment', CalendarClock], ['Stations', Warehouse], ['Funding', Landmark]] as const;
export function ProviderStory({ evidence, nerisId, stationDevices }: { evidence?: ProviderEvidence; nerisId?: string; stationDevices?: React.ReactNode }) {
  const [view,setView] = useState<string>('Equipment');
  const equipment: Event[] = [];
  const funding: Event[] = [];
  for (const unit of evidence?.equipment ?? []) {
    const title = [unit.manufacturer, unit.model || unit.category].filter(Boolean).join(' ');
    const detail = [unit.quantity != null && unit.quantity + ' units', unit.deployment, unit.supplier, unit.source.label].filter(Boolean).join(' · ');
    const dates = dateFields.filter(([field]) => unit[field]);
    for (const [field, stage] of dates) {
      const event = { date: unit[field]!, stage, title, detail };
      equipment.push(event);
      if (['approvedOn','paidOn','lastPurchasedOn'].includes(field)) funding.push(event);
    }
    if (!dates.length || unit.status === 'Proposed purchase') {
      const event = { date: unit.source.date, stage: unit.status + ' reported', title, detail };
      equipment.push(event);
      if (unit.status === 'Proposed purchase' || unit.status === 'Purchase approved' || unit.status === 'Purchase documented') funding.push(event);
    }
  }
  for (const grant of evidence?.funding ?? []) {
    const detail = [grant.amount != null && providerCurrency.format(grant.amount), grant.basis].filter(Boolean).join(' · ');
    funding.push({date: grant.source.date, stage: grant.status + ' reported', title: grant.title, detail});
    if (grant.spendBy) funding.push({date: grant.spendBy, stage: 'Spending deadline', title: grant.title, detail});
  }
  const directory = evidence?.stationDirectory;
  return <section className="pr-panel provider-story"><h2>Equipment, stations &amp; funding</h2>
    <div className="provider-story-switch" role="group" aria-label="Account views">{views.map(([name, Icon]) =>
      <button type="button" key={name} aria-pressed={view === name} onClick={() => setView(name)}><Icon size={17} aria-hidden="true"/>{name}</button>)}</div>
    {view === 'Equipment' && <Timeline events={equipment} empty="No public equipment milestones on file."/>}
    {view === 'Funding' && <Timeline events={funding} empty="No public funding or purchase milestones on file."/>}
    {view === 'Stations' && <>
      {directory && <><p>{directory.source.label} · {directory.source.date}</p><div className="provider-station-grid">{directory.stations.map(station =>
        <article key={station.number + station.address}><strong>Station {station.number} · {station.name}</strong><p>{station.address}</p>
          {station.apparatus && <p><Truck size={16} aria-hidden="true"/> {station.apparatus}</p>}
          {station.contact && <small>{[station.contact.role, station.contact.name, station.contact.phone].filter(Boolean).join(' · ')}</small>}
        </article>)}</div></>}
      {nerisId && <NerisDepartmentStations id={nerisId} autoLoad/>}
      {!directory?.stations.length && !nerisId && <p>No public station assignments on file.</p>}
      {stationDevices}
    </>}
  </section>;
}
