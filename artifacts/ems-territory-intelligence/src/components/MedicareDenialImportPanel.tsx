import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
  clearLocalMedicareDenialImport,
  createMedicareDenialImport,
  getLocalMedicareDenialImport,
  getMedicareDenialImportReport,
  MEDICARE_DENIAL_CSV_HEADERS,
  parseMedicareDenialCsv,
  saveLocalMedicareDenialImport,
  validateMedicareDenialImportCoverage,
  validateMedicareDenialImportRows,
  type DenialDefinition,
  type MedicareDenialImportDataset,
  type MedicareDenialImportRow,
} from '../services/medicareDenialImportService';
import type { Agency } from '../types';
import { getVerifiedAgencyNpi } from '../services/agencyMedicareDenialService';

const initialCoverage = {
  completeProviderGroups: false,
  completeProviderTotals: false,
  completeCountyTotals: false,
  completeStateTotals: false,
};

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function rateText(ratePct: number | null): string {
  return ratePct === null ? 'No adjudicated claims' : `${ratePct.toFixed(1)}%`;
}

function MetricTable<T extends { ratePct: number | null; deniedClaims: number; adjudicatedClaims: number }>({
  title,
  rows,
  keyOf,
}: {
  title: string;
  rows: T[];
  keyOf: (row: T) => string;
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 25);
  return (
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        {title} <span className="font-normal text-slate-500">({rows.length.toLocaleString()})</span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Record</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-right font-medium">Denied / adjudicated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={keyOf(row)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">{keyOf(row)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                  {rateText(row.ratePct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {row.deniedClaims.toLocaleString()} / {row.adjudicatedClaims.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Showing the first {shown.length}; all {rows.length.toLocaleString()} rows are included in the calculations.
        </div>
      )}
    </div>
  );
}

export const MedicareDenialImportPanel: React.FC<{ agencies?: Agency[] }> = ({ agencies = [] }) => {
  const [dataset, setDataset] = useState<MedicareDenialImportDataset | null>(() => getLocalMedicareDenialImport());
  const [rows, setRows] = useState<MedicareDenialImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [claimScope, setClaimScope] = useState('');
  const [reportingPeriod, setReportingPeriod] = useState('');
  const [denialDefinition, setDenialDefinition] = useState<DenialDefinition | ''>('');
  const [sourceName, setSourceName] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [coverage, setCoverage] = useState(initialCoverage);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isReading, setIsReading] = useState(false);

  const report = useMemo(() => dataset ? getMedicareDenialImportReport(dataset) : null, [dataset]);
  const agencyByNpi = useMemo(
    () => new Map(agencies.flatMap((agency) => {
      const npi = getVerifiedAgencyNpi(agency);
      return npi ? [[npi, agency.name] as const] : [];
    })),
    [agencies],
  );
  const previewTotals = useMemo(
    () => rows.reduce(
      (totals, row) => ({
        denied: totals.denied + row.deniedClaims,
        adjudicated: totals.adjudicated + row.adjudicatedClaims,
      }),
      { denied: 0, adjudicated: 0 },
    ),
    [rows],
  );

  const handleFile = async (file?: File) => {
    setError('');
    setNotice('');
    setRows([]);
    setFileName('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a CSV summary file. Raw 835 and patient-level files are not accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The CSV is larger than the 5 MB limit. Export a smaller aggregate summary.');
      return;
    }
    setIsReading(true);
    try {
      const parsed = parseMedicareDenialCsv(await file.text());
      await validateMedicareDenialImportRows(parsed);
      setRows(parsed);
      setFileName(file.name);
      setNotice(`Validated ${parsed.length.toLocaleString()} aggregate NPI × pickup-county rows against county FIPS references.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The CSV could not be parsed.');
    } finally {
      setIsReading(false);
    }
  };

  const handleImport = async () => {
    setError('');
    setNotice('');
    setIsReading(true);
    try {
      if (!denialDefinition) throw new Error('Select the denial definition used by the source report.');
      const nextDataset = createMedicareDenialImport(rows, {
        claimScope: claimScope.trim(),
        reportingPeriod: reportingPeriod.trim(),
        denialDefinition,
        sourceName: sourceName.trim(),
        sourceReference: sourceReference.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
        coverage,
      }, fileName);
      await validateMedicareDenialImportCoverage(nextDataset);
      if (dataset && !window.confirm('Replace the current local claim summary with this import? The existing summary will be removed.')) {
        return;
      }
      saveLocalMedicareDenialImport(nextDataset);
      setDataset(nextDataset);
      setRows([]);
      setFileName('');
      setNotice('Imported and saved in this browser only. No file or claims summary was sent to Firestore.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import could not be saved.');
    } finally {
      setIsReading(false);
    }
  };

  const handleDelete = () => {
    if (!dataset || !window.confirm('Delete the imported claim summary saved in this browser?')) return;
    clearLocalMedicareDenialImport();
    setDataset(null);
    setNotice('The local claim summary was deleted.');
    setError('');
  };

  const downloadTemplate = () => {
    downloadText('medicare-ambulance-denial-summary-template.csv', `${MEDICARE_DENIAL_CSV_HEADERS.join(',')}\n`, 'text/csv;charset=utf-8');
  };

  const downloadCurrentCsv = () => {
    if (!dataset) return;
    const csvRows = [
      MEDICARE_DENIAL_CSV_HEADERS.join(','),
      ...dataset.rows.map((row) => [
        row.npi,
        row.countyFips,
        row.deniedClaims,
        row.adjudicatedClaims,
      ].join(',')),
    ];
    downloadText('medicare-ambulance-denial-summary.csv', `${csvRows.join('\n')}\n`, 'text/csv;charset=utf-8');
  };

  const updateCoverage = (key: keyof typeof coverage, checked: boolean) => {
    setCoverage((current) => {
      const next = { ...current, [key]: checked };
      if (key === 'completeCountyTotals' && !checked) next.completeStateTotals = false;
      if (key === 'completeProviderGroups' && !checked) {
        next.completeProviderTotals = false;
        next.completeCountyTotals = false;
        next.completeStateTotals = false;
      }
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Import Medicare ambulance claim summaries</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Calculate fixed denial percentages from aggregate denied and adjudicated claim counts. Use the template; extra columns are rejected.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Download CSV template
        </button>
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Import aggregate counts only—never upload raw 835 files, patient-level rows, beneficiary IDs, dates of service, or other PHI.
            The CSV is read in your browser and discarded after parsing. The summary is saved in this browser profile's local storage,
            which is not encrypted by this app; other browsers and devices will not receive it.
          </p>
        </div>
        <div className="border-t border-amber-300/70 pt-2 dark:border-amber-800/70">
          <p className="font-semibold">Workspace sharing is disabled for now.</p>
          <p>
            This app has no authenticated workspace identity, and its Firestore access rules are not available here to verify.
            Publishing imports to a shared endpoint could expose them outside the intended workspace, so this flow does not upload or
            fetch claim summaries from Firestore or the API server.
          </p>
          <p className="mt-1">
            For safe sharing, keep this local-only, or later enable a verified workspace-only access rule or sign-in before adding
            shared storage. No sign-in has been added.
          </p>
        </div>
      </div>

      {dataset && report && (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/70 dark:bg-sky-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Current local import</div>
              <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                {dataset.rows.length.toLocaleString()} NPI × county rows · {dataset.reportingPeriod} · {dataset.sourceName} · {dataset.sourceReference}
              </div>
              <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                Imported {new Date(dataset.importedAt).toLocaleString()} · source details are user-entered and not independently verified
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={downloadCurrentCsv} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                <Download className="h-3.5 w-3.5" /> Export summary
              </button>
              <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:border-rose-900 dark:text-rose-300">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <MetricTable
              title="Provider totals · NPI"
              rows={report.providerMetrics}
              keyOf={(row) => `${agencyByNpi.get(row.npi) ?? 'NPI not matched'} · ${row.npi}`}
            />
            <MetricTable title="County totals · pickup FIPS" rows={report.countyMetrics} keyOf={(row) => String(row.countyFips)} />
            <MetricTable title="State totals" rows={report.stateMetrics} keyOf={(row) => String(row.stateCode)} />
          </div>
          <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-3">
            <div className="rounded-md bg-white/80 p-2 text-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
              Provider totals: {dataset.coverage.completeProviderTotals ? `${report.providerMetrics.length} calculated` : 'not calculated; full NPI coverage not attested'}
            </div>
            <div className="rounded-md bg-white/80 p-2 text-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
              County totals: {dataset.coverage.completeCountyTotals ? `${report.countyMetrics.length} calculated` : 'not calculated; all providers per county not attested'}
            </div>
            <div className="rounded-md bg-white/80 p-2 text-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
              State totals: {dataset.coverage.completeStateTotals ? `${report.stateMetrics.length} calculated` : 'not calculated; statewide coverage not attested'}
            </div>
          </div>
          {dataset.coverage.completeProviderGroups && (
            <div className="mt-3">
              <MetricTable
                title="Provider × pickup-county rows"
                rows={report.providerCountyMetrics}
                keyOf={(row) => `${agencyByNpi.get(row.npi) ?? 'NPI not matched'} · ${row.npi} · ${row.countyFips}`}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Claim population and scope
          <input value={claimScope} onChange={(event) => setClaimScope(event.target.value)} maxLength={240} placeholder="e.g. Medicare FFS ground ambulance, HCPCS scope..." className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Reporting period
          <input value={reportingPeriod} onChange={(event) => setReportingPeriod(event.target.value)} maxLength={100} placeholder="e.g. 2025-01-01 through 2025-12-31" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Denial definition used by the counts
          <select value={denialDefinition} onChange={(event) => setDenialDefinition(event.target.value as DenialDefinition)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
            <option value="">Select the source report’s definition</option>
            <option value="any_service_line_denied">Claim has any denied service line</option>
            <option value="fully_denied_claim">Entire claim was denied</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Source system or report name
          <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} maxLength={160} placeholder="Billing system or Medicare report" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Source report reference
          <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} maxLength={160} placeholder="Report name, ID, or account reference" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Optional HTTPS source link
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2048} placeholder="https://..." className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </label>
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Coverage checks control which rollups are allowed
        </div>
        {([
          ['completeProviderGroups', 'Counts are final, unique claims; adjustments/reversals are resolved, the selected denial definition and period match the source, and every NPI × pickup-county group is complete.'],
          ['completeProviderTotals', 'Every pickup county for each listed NPI is included; provider totals are complete.'],
          ['completeCountyTotals', 'Every billing provider for each listed pickup county is included; county totals are complete.'],
          ['completeStateTotals', 'Every county in each represented state is included, including zero-claim counties; state totals are complete.'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={coverage[key]}
              disabled={key !== 'completeProviderGroups' && !coverage.completeProviderGroups || key === 'completeStateTotals' && !coverage.completeCountyTotals}
              onChange={(event) => updateCoverage(key, event.target.checked)}
              className="mt-1 accent-sky-600"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          <Upload className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
          <span className="min-w-0">
            <span className="block font-semibold">Choose aggregate CSV</span>
            <span className="block truncate text-[11px] text-slate-500">Only NPI, pickup county FIPS, denied claims, adjudicated claims</span>
          </span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event.target.files?.[0])} className="sr-only" />
        </label>
        <button
          type="button"
          disabled={rows.length === 0 || isReading}
          onClick={() => void handleImport()}
          className="rounded-lg bg-sky-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isReading ? 'Checking summary…' : 'Import summary locally'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          Preview: {rows.length.toLocaleString()} rows · {previewTotals.denied.toLocaleString()} denied / {previewTotals.adjudicated.toLocaleString()} adjudicated · {fileName}
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Rate = denied claims ÷ adjudicated claims × 100. Counts must use the selected denial definition, same scope and period, and the coverage statements above.
          </p>
        </div>
      )}
      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`mt-3 rounded-lg px-3 py-2 text-xs ${error ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'}`}>
          {error || notice}
        </div>
      )}
    </section>
  );
};
