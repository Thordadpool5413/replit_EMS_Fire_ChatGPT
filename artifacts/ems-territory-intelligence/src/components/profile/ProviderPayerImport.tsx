import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { payerCategories, payerHeaders, parseAggregatePayerCsv, type PayerRow } from '../../services/aggregatePayerImport';

const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent(payerHeaders.join(',') + '\n');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percentage = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const display = (value: number | null) => value === null ? '—' : value.toLocaleString();
const amount = (value: number | null) => value === null ? '—' : money.format(value / 100);
function denial(value: number | null, total: number | null) {
  return value === null || !total ? '—' : display(value) + ' (' + percentage.format(value / total) + ')';
}

export function ProviderPayerImport({ registryKeys }: { registryKeys: readonly string[] }) {
  const [rows, setRows] = useState<PayerRow[]>([]);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [source, setSource] = useState('');
  const [loadedSource, setLoadedSource] = useState('');
  const [busy, setBusy] = useState(false);
  if (!registryKeys.length) return null;
  const groups = Map.groupBy(rows, row => row.start + ' to ' + row.end);
  const load = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      if (file.size > 250_000 || !file.name.toLowerCase().endsWith('.csv')) throw Error('Choose an aggregate CSV under 250 KB.');
      const next = parseAggregatePayerCsv(await file.text(), registryKeys);
      setRows(next);
      setLoadedSource(source.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to read the import.');
    } finally {
      setBusy(false);
    }
  };

  return <details className="pr-panel">
    <summary className="font-semibold"><Receipt size={17} aria-hidden="true" /> Import authorized all-payer billing</summary>
    <p>Use one aggregate row per payer and reporting period. Use the same adjudicated cohort for each reported denial count. Leave unavailable metrics blank. This preview stays in this open profile session.</p>
    <p>Accepted registry keys for this profile. <code>{registryKeys.join(' · ')}</code></p>
    <p>Accepted payer categories. {payerCategories.join(', ')}.</p>
    <a href={template} download="aggregate-payer-template.csv" className="pr-source-link">Download aggregate CSV template</a>
    <label className="block"><input type="checkbox" checked={authorized} onChange={event => {
      setAuthorized(event.target.checked);
      if (!event.target.checked) setRows([]);
    }} disabled={busy} /> I’m authorized to view this aggregate export and it contains no patient-level records.</label>
    <label className="block">Agency or billing export source <input type="text" value={source} maxLength={100}
      disabled={!authorized || busy} onChange={event => setSource(event.target.value)} /></label>
    <label className="block">Aggregate payer CSV <input type="file" accept=".csv,text/csv" disabled={!authorized || !source.trim() || busy} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (file) void load(file);
    }} /></label>
    {error && <p role="alert">{error}</p>}
    {rows.length > 0 && <p>Source reported at import · {loadedSource}</p>}
    {rows.length > 0 && <button type="button" className="pr-source-link" onClick={() => setRows([])} disabled={busy}>Clear preview</button>}
    {[...groups].map(([period, entries]) => {
      const complete = entries.every(row => row.claims !== null);
      const total = complete ? entries.reduce((sum, row) => sum + (row.claims ?? 0), 0) : 0;
      return <section key={period}>
        <h3>{period}</h3>
        <dl className="pr-metrics pr-metric-cards">
          {entries.map(row => <div className="pr-metric-card" key={row.payer}>
            <dt>{row.payer}</dt>
            <dd>{display(row.claims)} reported claims
              {total > 0 && row.claims !== null && <small>{percentage.format(row.claims / total)} of imported claims in this period</small>}
              <small>Adjudicated {display(row.adjudicated)}</small>
              <small>Initial denials {denial(row.initial, row.adjudicated)}</small>
              <small>Final denials {denial(row.final, row.adjudicated)}</small>
              <small>Billed {amount(row.billed)} · Paid {amount(row.paid)}</small>
            </dd>
          </div>)}
        </dl>
      </section>;
    })}
  </details>;
}
