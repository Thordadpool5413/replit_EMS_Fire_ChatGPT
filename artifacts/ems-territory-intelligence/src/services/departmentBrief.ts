import { departmentAliases, departmentProfile, profileSourceKey } from './departmentIdentity';
import type { ProviderProfileRef } from '../navigation/providerProfileUrl';
import {
  findProviderEvidenceByConfirmedKeys,
  linkedBillingOrganization,
  type DepartmentMetric,
  type ProviderFundingEvidence,
} from '../data/providerProfileEvidence';
import { formatProviderMetric, providerEquipmentLabels } from './providerCardIntelligence';
import { loadUsfaProfileOperations } from './usfaProfileOperations';
import { loadPublicProviderProfile, type PublicProviderProfile } from './publicProviderProfile';
import { loadFloridaRoster } from './floridaEmsRoster';

export type FactKind =
  | 'equipment'
  | 'funding'
  | 'quality'
  | 'operations'
  | 'stations'
  | 'staff'
  | 'service'
  | 'people'
  | 'claims'
  | 'license'
  | 'identity';
export type BriefFact = { kind: FactKind; label: string; value: string; note?: string; source: string };
export type DepartmentContact = {
  agency: string;
  state: string;
  label: string;
  date: string;
  phone?: string;
  fax?: string;
  website?: string;
  organization?: string;
  emergencyManagement?: string;
  mailing?: string;
  licenses?: string[];
};
export type RosterContact = {
  sourcePage: number;
  rosterContact?: string;
  phone?: string;
  emails?: string[];
};
const fileCache = new Map<string, Promise<unknown>>();
function snapshot<T>(path: string): Promise<T> {
  let pending = fileCache.get(path);
  if (!pending) {
    pending = fetch((import.meta.env?.BASE_URL ?? '/') + path, { signal: AbortSignal.timeout(20000) })
      .then(async (r) => {
        if (!r.ok) throw Error('Snapshot unavailable');
        return r.json();
      })
      .catch((error) => {
        fileCache.delete(path);
        throw error;
      });
    fileCache.set(path, pending);
  }
  return pending as Promise<T>;
}

export async function loadLicenseContacts() {
  const [data, roster] = await Promise.all([
    snapshot<{ sourceDate: string; records: Record<string, RosterContact> }>(
      'registry/state-ems/FL-contacts.json',
    ),
    loadFloridaRoster(),
  ]);
  if (data.sourceDate !== roster.sourceDate) throw Error('License and contact editions differ');
  return data;
}

export function sourceRef(state: string, key: string): ProviderProfileRef | undefined {
  if (key.startsWith('FDID:' + state + ':')) return { source:'registry', state, id:'usfa:' + key.slice(5) };
  if (key.startsWith('NPI:')) return { source: 'registry', state, id: 'nppes:' + key.slice(4) };
  if (key.startsWith('NERIS:')) return { source: 'neris', state, id: key.slice(6) };
  if (key.startsWith('STATE-EMS:')) return { source: 'state-ems', state, id: key.split(':')[3] };
  if (key.startsWith('TX-DSHS:') || key.startsWith('NY-WREMSCO:'))
    return { source: 'regional-ems', state, id: key };
  return undefined;
}

export const factSection: Record<FactKind, string> = {
  equipment: 'equipment',
  funding: 'equipment',
  quality: 'quality',
  operations: 'operations',
  stations: 'stations',
  staff: 'operations',
  service: 'sources',
  people: 'people',
  claims: 'claims',
  license: 'sources',
  identity: 'sources',
};
// NUCC ambulance taxonomy group, as registered by the organization in NPPES.
const ambulanceTaxonomies: Record<string, string> = {
  '341600000X': 'Ambulance',
  '3416A0800X': 'Air ambulance',
  '3416L0300X': 'Land ambulance',
  '3416S0300X': 'Water ambulance',
};
const levels: Record<string, string> = {
  'ALS/T': 'ALS transport',
  'ALS/N': 'ALS nontransport',
  'BLS/T': 'BLS transport',
  'BLS/N': 'BLS nontransport',
};
export const billingYears = (npi: string) =>
  snapshot<Record<string, Record<string, [number, number]>>>(
    'data/medicaid/' + npi.slice(0, 2) + '.json',
  ).then((data) => data[npi] ?? {});
const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export async function loadDepartmentBrief(input: ProviderProfileRef) {
  const ref = departmentProfile(input),
    key = profileSourceKey(ref);
  const keys = [key, ...departmentAliases(ref.state, key)];
  const localEvidence = findProviderEvidenceByConfirmedKeys(keys);
  const unavailable = new Set<string>();
  async function read<T>(label: string, task: Promise<T>): Promise<T | undefined> {
    try {
      return await task;
    } catch {
      unavailable.add(label);
      return undefined;
    }
  }
  const refs = [ref, ...keys.slice(1).flatMap((k) => sourceRef(ref.state, k) ?? [])];
  const npis = new Set(keys.filter((k) => k.startsWith('NPI:')).map((k) => k.slice(4)));
  const billingId = linkedBillingOrganization(key, localEvidence);
  if (billingId) npis.add(billingId);
  const [profiles, ops, contactEdition, payments, awardEdition, contactsByKey] = await Promise.all([
    Promise.all(refs.map((r) => read(r.source, loadPublicProviderProfile(r)))),
    key.startsWith('FDID:') ? read('USFA staffing', loadUsfaProfileOperations(ref.state, key)) : undefined,
    keys.some((k) => k.startsWith('STATE-EMS:FL:license:'))
      ? read('Florida license contacts', loadLicenseContacts())
      : undefined,
    Promise.all(
      [...npis].map(async (npi) => ({ npi, years: await read('Medicaid payments', billingYears(npi)) })),
    ),
    read('Federal awards', snapshot<{byProvider:Record<string,ProviderFundingEvidence[]>;counters:{checked:string;grantRows:number;contractRows:number;matched:number;ambiguous:number;unmatched:number;contractCoverage:string}}>('data/providers/awards-'+ref.state+'.json')),
    read(
      'Directory contacts',
      snapshot<Record<string, DepartmentContact>>('data/providers/contacts-' + ref.state + '.json'),
    ),
  ]);
  const contacts = keys.flatMap((k) => (contactsByKey?.[k] ? [{ key: k, ...contactsByKey[k] }] : []));
  const records = profiles.filter((p): p is PublicProviderProfile => !!p);
  const awards=awardEdition?.byProvider[key]??[];
  const evidence=awards.length ? {...localEvidence,registryKey:key,registryName:records[0]?.name??key,
    funding:[...(localEvidence?.funding??[]),...awards]} : localEvidence;
  const facts: BriefFact[] = [];
  const metric = (kind: FactKind, m: DepartmentMetric) =>
    facts.push({
      kind,
      label: m.label,
      value: formatProviderMetric(m),
      note: m.context,
      source: [m.source.label, m.reportingPeriod || m.source.date].filter(Boolean).join(' · '),
    });
  const equipment = (evidence?.equipment ?? [])
    .slice()
    .sort((a, b) =>
      (b.lastPurchasedOn ?? b.paidOn ?? b.approvedOn ?? b.source.date).localeCompare(
        a.lastPurchasedOn ?? a.paidOn ?? a.approvedOn ?? a.source.date,
      ),
    );
  for (const unit of equipment)
    facts.push({
      kind: 'equipment',
      label: unit.status,
      value:
        [unit.manufacturer, unit.model].filter(Boolean).join(' ') || providerEquipmentLabels[unit.category],
      note: [
        unit.quantity != null && unit.quantity + ' units',
        unit.supplier && 'Supplier ' + unit.supplier,
        unit.lastPurchasedOn && 'Purchased ' + unit.lastPurchasedOn,
        unit.deployment,
      ]
        .filter(Boolean)
        .join(' · '),
      source: unit.source.label + ' · ' + unit.source.date,
    });
  for (const fund of evidence?.funding ?? [])
    facts.push({
      kind: 'funding',
      label: fund.title,
      value: fund.amount != null ? money(fund.amount) : fund.status,
      note: [fund.status, fund.spendBy && 'Spend by ' + fund.spendBy].filter(Boolean).join(' · '),
      source: fund.source.label + ' · ' + fund.source.date,
    });
  for (const m of evidence?.quality ?? []) metric('quality', m);
  for (const m of evidence?.operations ?? []) metric('operations', m);
  for (const value of [...evidence?.billing??[],...evidence?.payerMix??[],...evidence?.billingDenials??[]]) metric('claims', value);
  for (const person of evidence?.contacts ?? [])
    facts.push({
      kind: 'people',
      label: person.role,
      value: person.name || person.phone || person.email || person.role,
      note: [person.phone, person.email].filter(Boolean).join(' · '),
      source: person.source.label + ' · ' + person.source.date,
    });
  for (const p of records) {
    const source = [p.source.name, p.source.date].filter(Boolean).join(' · ');
    if (p.identity?.serviceLevel && p.identity.serviceLevel !== 'None')
      facts.push({
        kind: 'service',
        label: 'Reported service level',
        value: levels[p.identity.serviceLevel] ?? p.identity.serviceLevel,
        source,
      });
    if (p.reportedStationCount != null)
      facts.push({
        kind: 'stations',
        label: 'Reported stations',
        value: p.reportedStationCount.toLocaleString(),
        source,
      });
    if (p.identity?.licenseExpiresAt)
      facts.push({
        kind: 'license',
        label: 'License expiration',
        value: p.identity.licenseExpiresAt,
        note: p.identifier,
        source,
      });
    const npi = p.registryFields?.find((f) => f.label === 'Registered taxonomies')?.value;
    if (npi)
      facts.push({
        kind: 'service',
        label: 'Registered ambulance taxonomy',
        value: npi
          .split(', ')
          .filter((code) => code.startsWith('3416'))
          .map((code) => ambulanceTaxonomies[code] || code)
          .join(' · '),
        source: 'CMS NPPES · ' + p.source.date,
      });
    if (p.registryFields?.some((f) => f.label === 'Roster status'))
      facts.push({
        kind: 'license',
        label: 'License status',
        value: p.registryFields.find((f) => f.label === 'Roster status')!.value,
        note: p.registryFields.find((f) => f.label === 'License type')?.value,
        source,
      });
    if (p.identity?.sourceName === 'State EMS' && p.stateCode === 'FL') {
      const contact = contactEdition?.records[p.identity.identifier];
      if (contact)
        facts.push({
          kind: 'people',
          label: 'EMS license contact',
          value: contact.rosterContact || contact.phone || contact.emails?.[0] || p.identifier,
          note: [contact.phone, ...(contact.emails ?? [])].filter(Boolean).join(' · '),
          source,
        });
    }
  }
  const staffing = ops?.metrics.filter((m) => m.label.includes('firefighters')) ?? [];
  if (ops) {
    const stations = ops.metrics.find((m) => m.label === 'Fire stations');
    if (stations && !facts.some((f) => f.kind === 'stations'))
      facts.push({
        kind: 'stations',
        label: 'Reported stations',
        value: stations.value.toLocaleString(),
        source: 'USFA · ' + ops.retrievedAt,
      });
    if (staffing.length === 3)
      facts.push({
        kind: 'staff',
        label: 'Reported firefighters',
        value: staffing.reduce((n, row) => n + row.value, 0).toLocaleString(),
        note: ops.departmentType ?? undefined,
        source: 'USFA · ' + ops.retrievedAt,
      });
  }
  for (const pay of payments) {
    const annual = Object.entries(pay.years ?? {}).sort(([a], [b]) => b.localeCompare(a))[0];
    if (annual)
      facts.push({
        kind: 'claims',
        label: 'Medicaid & CHIP claim lines',
        value: annual[1][0].toLocaleString(),
        note: money(annual[1][1] / 100) + ' reported paid · Billing NPI ' + pay.npi,
        source: 'HHS · ' + annual[0],
      });
  }
  for (const c of contacts) {
    if (c.phone)
      facts.push({
        kind: 'people',
        label: c.key.startsWith('FDID:') ? 'Headquarters phone' : 'Practice location phone',
        value: c.phone,
        note: c.agency,
        source: c.label + ' · ' + c.date,
      });
  }
  const primary = records[0];
  if (primary)
    facts.push({
      kind: 'identity',
      label: 'Registry identifier',
      value: primary.identifier,
      source: primary.source.name,
      note: primary.source.date ?? undefined,
    });
  return { facts, records, contacts, ops, staffing, payments, evidence, awards, awardCoverage:awardEdition?.counters, unavailable: [...unavailable] };
}
