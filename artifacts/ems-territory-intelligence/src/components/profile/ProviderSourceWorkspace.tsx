import { useState } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { ClipboardList, PackageCheck, Receipt } from 'lucide-react';
import {
  billingDenialDefinitions, equipmentCategories, inventoryScopes, MAX_PROVIDER_SOURCE_CSV, payerCategories,
  parseProviderSourceRows, providerSourceHeadings, purchaseEvents, type ProviderSourceKind, type ProviderSourceRow,
} from '@workspace/api-zod/provider-sources';
import { ScrollableTableRegion } from '../ScrollableTableRegion';

const headings = {
  inventory: { title: 'Provider-owned inventory', icon: PackageCheck, help: 'Enter owned equipment counts as of a stated date. Use an agency asset register or a documented subset such as a station or apparatus.' },
  purchases: { title: 'Provider purchase history', icon: ClipboardList, help: 'Enter the event documented by the source. Keep approvals, orders, documented purchases, deliveries, payments and cancellations on separate rows.' },
  billing: { title: 'Aggregate payer and denial records', icon: Receipt, help: 'Enter one row per payer or named plan and reporting period. Initial and final denials use the same positive adjudicated denominator. Blank means unpublished or unavailable.' },
};
type Report = {
  revision: number; savedAt: string; source: string; cohort: string; definition: string; rows: ProviderSourceRow[];
};
type Workspace = { registryKey: string; binding: string; snapshot: Report | null; canWrite: boolean };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const integer = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

async function request<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include', cache: 'no-store',
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error?.message ?? result.error ?? 'Provider source request failed.');
  return result as T;
}

export function ProviderSourceWorkspace({ agencyId, kind }: { agencyId: string; kind: ProviderSourceKind }) {
  const { user } = useAuth();
  return user ? <PrivateSourceWorkspace key={[user.id, agencyId, kind].join(':')} agencyId={agencyId} kind={kind} /> : null;
}
function PrivateSourceWorkspace({ agencyId, kind }: { agencyId: string; kind: ProviderSourceKind }) {
  const path = '/api/agencies/' + encodeURIComponent(agencyId) + '/source-snapshots/' + kind;
  const [workspace, setWorkspace] = useState<Workspace>();
  const [history, setHistory] = useState<Report>();
  const [draft, setDraft] = useState<{ csv: string; rows: ProviderSourceRow[] }>();
  const [source, setSource] = useState('');
  const [cohort, setCohort] = useState('');
  const [denialDefinition, setDenialDefinition] = useState<string>(billingDenialDefinitions[0]);
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { title, icon: Icon, help } = headings[kind];

  async function load() {
    setBusy(true);
    setMessage('');
    setDraft(undefined);
    setWorkspace(undefined);
    setHistory(undefined);
    try { setWorkspace(await request<Workspace>(path)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Provider source records could not be loaded.'); }
    finally { setBusy(false); }
  }
  async function readHistory(revision: number) {
    if (!workspace || revision < 1) return;
    setBusy(true);
    setMessage('');
    setHistory(undefined);
    try {
      const previous = await request<Workspace>(path + '?revision=' + revision);
      if (previous.binding !== workspace.binding || !previous.snapshot) throw Error('The account or source revision changed.');
      setHistory(previous.snapshot);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load the prior revision.'); }
    finally { setBusy(false); }
  }
  async function preview(file: File) {
    if (!workspace) return;
    setBusy(true);
    setDraft(undefined);
    setMessage('');
    try {
      if (file.size > MAX_PROVIDER_SOURCE_CSV || !file.name.toLowerCase().endsWith('.csv')) throw Error('Choose a CSV under 65 KB.');
      const csv = await file.text();
      setDraft({ csv, rows: parseProviderSourceRows(csv, kind, workspace.registryKey) });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview the file.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!workspace?.canWrite || !draft || !attested) return;
    setBusy(true);
    setMessage('');
    try {
      const { snapshot } = await request<{ snapshot: Report }>(path, {
        binding: workspace.binding, expectedRevision: workspace.snapshot?.revision ?? 0,
        source, cohort, denialDefinition, attested, csv: draft.csv,
      });
      setWorkspace({ ...workspace, snapshot });
      setDraft(undefined);
      setHistory(undefined);
      setAttested(false);
      setMessage('Source snapshot saved to the private provider profile.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save could not be confirmed.'); }
    finally { setBusy(false); }
  }

  const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent(providerSourceHeadings[kind].join(',') + '\n');
  const categories = kind === 'billing' ? payerCategories : equipmentCategories;
  const providesDenials = kind === 'billing' && draft?.rows.some(row => row.initial !== null || row.final !== null);
  return <details className="pr-panel" onToggle={event => {
    if (event.currentTarget.open && !busy) void load();
  }}>
    <summary className="font-semibold"><Icon size={17} aria-hidden="true" /> {title}</summary>
    <p>{help}</p>
    {busy && <p role="status">Working with private provider records…</p>}
    {message && <p role="status">{message}</p>}
    {!busy && <button type="button" className="pr-source-link" onClick={() => void load()}>Refresh saved records</button>}
    {workspace && <>
      <p>Registry key <code>{workspace.registryKey}</code></p>
      {workspace.snapshot ? <>
        <p>Source {workspace.snapshot.source} · Revision {workspace.snapshot.revision} · Saved {new Date(workspace.snapshot.savedAt).toLocaleDateString()}</p>
        {workspace.snapshot.cohort && <p>Billing cohort {workspace.snapshot.cohort} · Denial definition {workspace.snapshot.definition}</p>}
        <SourceTable kind={kind} rows={workspace.snapshot.rows} label="Saved source rows" />
        {workspace.snapshot.revision > 1 && <button className="pr-source-link" type="button" disabled={busy}
          onClick={() => void readHistory(workspace.snapshot!.revision - 1)}>Show prior revision</button>}
        {history && <section>
          <p>Revision {history.revision} · {history.source} · {new Date(history.savedAt).toLocaleDateString()}</p>
          {history.cohort && <p>Billing cohort {history.cohort} · Denial definition {history.definition}</p>}
          <SourceTable kind={kind} rows={history.rows} label="Prior source rows" />
          {history.revision > 1 && <button className="pr-source-link" type="button" disabled={busy}
            onClick={() => void readHistory(history.revision - 1)}>Show older revision</button>}
          <button className="pr-source-link" type="button" disabled={busy} onClick={() => setHistory(undefined)}>Close revision history</button>
        </section>}
      </> : <p>No records have been saved to this profile for this category.</p>}
      {workspace.canWrite && <details>
        <summary>Import an authorized {kind === 'billing' ? 'billing' : 'agency'} CSV</summary>
        <a href={template} download={kind + '-provider-template.csv'} className="pr-source-link">Download exact CSV template</a>
        <p>{kind === 'billing' ? 'Payers' : 'Equipment categories'} · {categories.join(', ')}</p>
        {kind === 'purchases' && <p>Event types · {purchaseEvents.join(', ')}</p>}
        {kind === 'inventory' && <p>Coverage scope · {inventoryScopes.join(', ')}. Give a scope reference for any subset.</p>}
        <p>Use the registry key shown above for each row. Each save replaces the displayed snapshot and retains the prior revision in the workspace database.</p>
        <label className="block"><input type="checkbox" checked={attested} disabled={busy} onChange={event => {
          setAttested(event.target.checked);
          if (!event.target.checked) setDraft(undefined);
        }} /> I am authorized to share this export with the private workspace. The file contains no patient-level records.</label>
        <label className="block">Source name or export reference <input type="text" maxLength={160} value={source}
          disabled={!attested || busy} onChange={event => setSource(event.target.value)} /></label>
        {kind === 'billing' && <>
          <label className="block">Billing cohort <input type="text" maxLength={160} value={cohort} placeholder="Example: all adjudicated ground transports"
            disabled={!attested || busy} onChange={event => setCohort(event.target.value)} /></label>
          <label className="block">Denial definition <select value={denialDefinition} disabled={!attested || busy} onChange={event => setDenialDefinition(event.target.value)}>
            {billingDenialDefinitions.map(value => <option key={value}>{value}</option>)}
          </select></label>
        </>}
        <label className="block">Source CSV <input type="file" accept=".csv,text/csv" disabled={!attested || busy} onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void preview(file);
        }} /></label>
        {draft && <>
          <SourceTable kind={kind} rows={draft.rows} label="Preview before saving" />
          <button type="button" className="workspace-button" onClick={() => void save()}
            disabled={busy || !attested || !source.trim() || (kind === 'billing' && (!cohort.trim() || (providesDenials && denialDefinition === 'not provided')))}>
            {workspace.snapshot ? 'Save new snapshot revision' : 'Save to provider profile'}
          </button>
        </>}
      </details>}
    </>}
  </details>;
}

function SourceTable({ kind, rows, label }: { kind: ProviderSourceKind; rows: ProviderSourceRow[]; label: string }) {
  const columns = kind === 'billing' ? [
    ['start', 'Period start'], ['end', 'Period end'], ['payer', 'Payer category'], ['payerName', 'Payer or plan name'], ['claims', 'Claims'], ['adjudicated', 'Adjudicated'],
    ['initial', 'Initial denials'], ['final', 'Final denials'], ['billed', 'Billed'], ['paid', 'Paid'],
  ] : kind === 'inventory' ? [
    ['asOf', 'As of'], ['category', 'Category'], ['manufacturer', 'Make'], ['model', 'Model'], ['owned', 'Owned units'], ['scope', 'Scope'], ['scopeReference', 'Scope reference'],
  ] : [
    ['eventDate', 'Event date'], ['event', 'Status'], ['reference', 'Source record'], ['category', 'Category'], ['manufacturer', 'Make'],
    ['model', 'Model'], ['supplier', 'Supplier'], ['quantity', 'Units'], ['amount', 'Source amount'],
  ];

  function value(key: string, row: ProviderSourceRow) {
    const cell = row[key];
    if (cell === null || cell === '') return '—';
    if (typeof cell !== 'number') return cell;
    if (['billed', 'paid', 'amount'].includes(key)) return money.format(cell / 100);
    return integer.format(cell) + (['initial', 'final'].includes(key) && typeof row.adjudicated === 'number' && row.adjudicated > 0
      ? ' (' + percent.format(cell / row.adjudicated) + ')' : '');
  }
  return <ScrollableTableRegion label={label} maxHeightClassName="max-h-72">
    <table className="w-full text-left text-sm">
      <caption>{label} · {rows.length.toLocaleString()} rows</caption>
      <thead><tr>{columns.map(([key, title]) => <th className="p-2" scope="col" key={key}>{title}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(([key]) => <td className="p-2" key={key}>{value(key, row)}</td>)}</tr>)}</tbody>
    </table>
  </ScrollableTableRegion>;
}
