/** Chronological purchasing timeline: past records are history, future dates are dated events, undated items are context. */
import React from 'react';
import { CalendarClock, FileSignature, Landmark, ScrollText } from 'lucide-react';
import type { Agency } from '../../types';

type Ev = { key: string; when: string; sort: string; title: string; detail: string; kind: 'contract' | 'grant' | 'budget' | 'license'; state: 'past' | 'upcoming' | 'undated' };
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const today = () => new Date().toISOString().slice(0, 10);
const classify = (d?: string): Ev['state'] => {
  if (!d) return 'undated';
  const t = Date.parse(d);
  if (Number.isNaN(t)) return 'undated';
  return new Date(t).toISOString().slice(0, 10) < today() ? 'past' : 'upcoming';
};
const ICON = { contract: FileSignature, grant: Landmark, budget: CalendarClock, license: ScrollText };

export const ProcurementTimeline: React.FC<{ agency: Agency }> = ({ agency }) => {
  const events: Ev[] = [];
  const c = agency.competitorContract;
  if (c?.contractEndDate) events.push({ key: 'contract', when: c.contractEndDate, sort: c.contractEndDate, kind: 'contract', state: classify(c.contractEndDate),
    title: `${c.vendor || 'Service'} contract ${classify(c.contractEndDate) === 'past' ? 'ended' : 'ends'}`,
    detail: [c.status && `Status ${c.status}`, c.contractNumber && `No. ${c.contractNumber}`].filter(Boolean).join(' · ') || 'Status not reported' });
  (agency.femaGrantHistory ?? []).forEach((g, i) => {
    if (!isNum(g.fiscalYear)) return;
    events.push({ key: `grant-${i}`, when: `FY${g.fiscalYear}`, sort: `${g.fiscalYear}-09-30`, kind: 'grant', state: 'past',
      title: `${g.programName}${isNum(g.awardAmount) ? ` · $${g.awardAmount.toLocaleString()}` : ''}`, detail: `${g.purpose} · ${g.status}` });
  });
  if (agency.stateLicenseExpiration) events.push({ key: 'license', when: agency.stateLicenseExpiration, sort: agency.stateLicenseExpiration, kind: 'license', state: classify(agency.stateLicenseExpiration),
    title: 'State license expiration', detail: [agency.stateLicenseNumber, agency.stateLicenseType].filter(Boolean).join(' · ') || 'License details not reported' });
  if (agency.budgetCycleEndMonth) events.push({ key: 'budget', when: agency.budgetCycleEndMonth, sort: '9999', kind: 'budget', state: 'undated',
    title: 'Budget cycle ends', detail: 'Recurring month; confirm the capital request deadline.' });
  events.sort((a, b) => b.sort.localeCompare(a.sort));
  const upcoming = events.filter((e) => e.state === 'upcoming').length;
  const history = events.filter((e) => e.state === 'past').length;
  const recurring = events.filter((e) => e.state === 'undated').length;

  return (
    <section className="apt" aria-labelledby="apt-title" data-testid="procurement-timeline">
      <header className="apt-head">
        <h3 id="apt-title"><CalendarClock aria-hidden="true" className="apt-title-ico" />Procurement timeline</h3>
        <p>{events.length ? `${events.length} dated record${events.length === 1 ? '' : 's'} · ${upcoming} upcoming` : 'No contract, grant, license or budget dates recorded.'}</p>
      </header>
      {events.length > 0 && (
        <dl className="apt-counts" data-testid="procurement-timeline-counts">
          <div data-state="upcoming"><dt>Upcoming</dt><dd>{upcoming}</dd></div>
          <div data-state="past"><dt>History</dt><dd>{history}</dd></div>
          <div data-state="undated"><dt>Recurring</dt><dd>{recurring}</dd></div>
        </dl>
      )}
      {events.length > 0 && (
        <ol className="apt-list">
          {events.map((e) => {
            const Icon = ICON[e.kind];
            return (
              <li key={e.key} data-state={e.state} data-testid={`timeline-${e.key}`}>
                <span className="apt-dot"><Icon aria-hidden="true" className="h-3.5 w-3.5" /></span>
                <span className="apt-when">{e.when}</span>
                <div>
                  <p className="apt-title">{e.title}</p>
                  <p className="apt-detail">{e.detail}</p>
                </div>
                <span className="apt-state">{e.state === 'past' ? 'History' : e.state === 'upcoming' ? 'Upcoming' : 'Recurring'}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="apt-foot">A past grant award is not an open application. Expired contract dates are history unless a renewal is documented.</p>
    </section>
  );
};

export default ProcurementTimeline;
