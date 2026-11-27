import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, HeartPulse, Monitor, Receipt, Truck, Users } from 'lucide-react';
import { hasAgencyContractEvidence } from '../../data/agencyFactEvidence';
import { findProviderEvidence, type DepartmentMetric } from '../../data/providerProfileEvidence';
import type { Agency } from '../../types';
import { buildProviderCardFacts, providerCallQuestions, type CardFacts } from '../../services/providerCardIntelligence';
import { registryIdentityKey, type RegistryIdentity } from '../../services/registryAccountLink';
import { loadUsfaProfileOperations } from '../../services/usfaProfileOperations';

const groups = [
  { id: 'equipment', title: 'Equipment', icon: Monitor },
  { id: 'funding', title: 'Funding & contracts', icon: Receipt },
  { id: 'quality', title: 'Quality & outcomes', icon: HeartPulse },
  { id: 'operations', title: 'Calls, staffing & fleet', icon: Truck },
  { id: 'workflow', title: 'Buying roles & workflow', icon: Users },
] as const;

type CardProps = { agency?: Agency; identity?: RegistryIdentity };

export function ProviderCardIntelligence({ agency, identity = agency?.registryIdentity }: CardProps) {
  const key = identity && registryIdentityKey(identity);
  return identity?.sourceName === 'USFA NFDR' && key
    ? <ArchivedProviderCard agency={agency} identity={identity} registryKey={key} />
    : <CardSummary agency={agency} identity={identity} registryKey={key} />;
}

function ArchivedProviderCard({ agency, identity, registryKey }: {
  agency?: Agency;
  identity: RegistryIdentity;
  registryKey: string;
}) {
  const operations = useQuery({
    queryKey: ['usfa-profile-operations', identity.stateCode, registryKey],
    queryFn: () => loadUsfaProfileOperations(identity.stateCode, registryKey),
    retry: false,
  });
  const registry = operations.data;
  const archived = registry?.metrics.map(metric => ({
    ...metric, context: 'Archived registry count.',
    source: { label: 'USFA Fire Department Registry', date: 'Retrieved ' + registry.retrievedAt, url: 'https://apps.usfa.fema.gov/registry/download' },
  }));
  const archiveStatus = operations.isPending ? 'Loading archived USFA counts…'
    : operations.isError ? 'Archived USFA counts could not be loaded.' : undefined;
  return <CardSummary agency={agency} identity={identity} registryKey={registryKey} archived={archived} archiveStatus={archiveStatus} />;
}

function featuredFact(id: keyof CardFacts, facts: CardFacts[keyof CardFacts]) {
  if (id === 'quality') return facts.find(fact => /\bROSC\b|survival to hospital discharge/i.test(fact.label)) ?? facts[0];
  if (id === 'workflow') return facts.find(fact => /^(fire rescue chief|fire chief|ems chief|chief)$/i.test(fact.label)) ?? facts.find(fact => fact.label === 'Purchasing') ?? facts[0];
  if (id === 'operations') return facts.find(fact => /EMS (calls|incidents)|Annual calls/i.test(fact.label)) ?? facts[0];
  if (id === 'equipment') return facts.find(fact => fact.status === 'In service reported') ?? facts[0];
  return facts[0];
}

function CardSummary({ agency, identity, registryKey, archived, archiveStatus }: CardProps & {
  registryKey?: string;
  archived?: DepartmentMetric[];
  archiveStatus?: string;
}) {
  const evidence = identity && findProviderEvidence(registryKey, identity.name);
  const facts = buildProviderCardFacts(evidence, agency, archived);
  const questions = providerCallQuestions(evidence, agency && hasAgencyContractEvidence(agency));
  const populated = groups.filter(({ id }) => facts[id].length > 0);
  return <section className="min-w-0 space-y-2 rounded-lg border border-border bg-[var(--pi-surface-subtle)] p-2.5 text-xs text-foreground" aria-label="Agency intelligence">
    <p className="flex items-center gap-1.5 font-bold"><ClipboardList size={15} aria-hidden="true" /> Agency intelligence</p>
    {populated.length > 0 ? <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-2">
      {populated.map(({ id, title, icon: Icon }) => {
        const item = featuredFact(id, facts[id]);
        const prior = id === 'equipment' && item.status === 'In service reported' && facts.equipment.find(fact => fact.status === 'Documented historically');
        const cohort = id === 'quality' && /ROSC/i.test(item.label) && facts.quality.find(fact =>
          fact.label === 'Cardiac arrests' && fact.source.date === item.source.date && fact.source.url === item.source.url);
        return <div key={id} className="min-w-0 rounded-md border border-border bg-card p-2">
          <dt className="flex items-center gap-1 font-semibold text-muted-foreground"><Icon size={14} className="shrink-0" aria-hidden="true" />{title}</dt>
          <dd className="mt-1 break-words">
            <strong className="block text-sm font-bold tabular-nums">{item.value}</strong>
            {item.label !== item.value && <span className="block">{item.label}</span>}
            {item.status && <span className="mt-0.5 block font-semibold text-[var(--pi-action-ink)]">{item.status}</span>}
            {(item.period || item.source.date) && <span className="block text-muted-foreground">{item.period ?? item.source.date}</span>}
            {prior && <span className="mt-1 block text-muted-foreground">{prior.value} · {prior.label} · {prior.status?.toLowerCase()}</span>}
            {cohort && (
              <span className="block text-muted-foreground">{cohort.value} cardiac arrests reported</span>
            )}
          </dd>
        </div>;
      })}
    </dl> : <p className="text-muted-foreground">Agency-specific equipment, funding, outcomes and operating figures pending source records.</p>}
    {archiveStatus && <p className="text-muted-foreground">{archiveStatus}</p>}
    <p className="leading-relaxed"><strong>Ask next</strong> · {questions[0]}</p>
    {populated.length > 0 && <details>
      <summary className="cursor-pointer py-1 font-semibold text-[var(--pi-action-ink)]">View card data and sources</summary>
      {populated.map(({ id, title }) => <div className="mt-2 border-t border-border pt-2" key={id}>
        <p className="font-bold">{title}</p>
        <ul className="space-y-1.5">
          {facts[id].map((item, index) => <li className="min-w-0 break-words" key={item.label + ':' + index}>
            <p><strong>{item.label}</strong> · {item.value}{item.status && ' · ' + item.status}</p>
            {item.detail && <p className="text-muted-foreground">{item.detail}</p>}
            {item.source.url
              ? <a href={item.source.url} target="_blank" rel="noreferrer" className="text-[var(--pi-action-ink)] underline">{item.source.label}{item.source.date && ' · ' + item.source.date}</a>
              : <span className="text-muted-foreground">{item.source.label}{item.source.date && ' · ' + item.source.date}</span>}
          </li>)}
        </ul>
      </div>)}
      {questions.length > 1 && <div className="mt-2 border-t border-border pt-2">
        <p className="font-bold">More questions for the visit</p>
        <ul className="list-disc space-y-1 pl-4">{questions.slice(1).map(question => <li key={question}>{question}</li>)}</ul>
      </div>}
    </details>}
  </section>;
}
