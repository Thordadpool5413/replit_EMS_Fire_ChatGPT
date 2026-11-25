import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Check, ChevronLeft, ChevronRight, Database, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Agency } from '../types';
import {
  buildNationwideRegistryPreview,
  loadRegistryStatePreview,
  MAX_REGISTRY_IMPORT_SELECTION,
  type RegistryImportCandidate,
  type RegistryImportNationalPreview,
  type RegistryImportProgress,
  type RegistryImportResult,
  type RegistryImportWriteProgress,
  type RegistryImportDisposition,
} from '../services/nationalRegistryImport';
import { loadAgencyWorkspaceAccess, type AgencyWorkspaceAccess } from '../services/agencyWorkspaceAccess';
import { createSourceNativeAgency } from '../services/sourceNativeAgency';
import { loadSourceDirectoryManifest, loadSourceDirectoryState } from '../services/nationalSourceDirectory';
import { loadNationalLocationState } from '../services/nationalLocationSnapshot';

type Props = {
  agencies: Agency[];
  directoryStatus?: { status: 'loading' | 'ready' | 'unavailable'; loaded: number };
  online: boolean;
  onImportProfiles?: (
    profiles: Agency[],
    onProgress?: (progress: RegistryImportWriteProgress) => void,
  ) => Promise<RegistryImportResult>;
};

const PAGE_SIZE = 8;
const dispositionLabels: Record<RegistryImportDisposition, string> = {
  eligible: 'Eligible',
  excluded: 'Excluded',
  duplicate: 'Exact duplicate',
  ambiguous: 'Possible match',
  unassigned: 'County unassigned',
};

function count(value: number) {
  return value.toLocaleString();
}

function dateLabel(value?: string) {
  if (!value) return 'Date not supplied';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function countyBasisLabel(value?: string) {
  const labels: Record<string, string> = {
    'source-county': 'County reported by the source',
    'official-town-crosswalk': 'Official town-to-county crosswalk',
    'census-address-range': 'U.S. Census address-range match',
    'nad-address-point': 'USDOT address-point match',
    'ohio-lbrs-address-point': 'Ohio LBRS address-point match',
    'ny-sam-address-point': 'New York SAM address-point match',
    'regional-address-point': 'Official regional address-point match',
  };
  return value ? labels[value] ?? `Recorded basis: ${value}` : 'No supported exact county assignment';
}

export function NationalAgencyImportPanel({
  agencies,
  directoryStatus,
  online,
  onImportProfiles,
}: Props) {
  const [access, setAccess] = useState<AgencyWorkspaceAccess>('unavailable');
  const [accessLoading, setAccessLoading] = useState(true);
  const [preview, setPreview] = useState<RegistryImportNationalPreview>();
  const [manifest, setManifest] = useState<Awaited<ReturnType<typeof loadSourceDirectoryManifest>>>();
  const [selectedState, setSelectedState] = useState('');
  const [statePreview, setStatePreview] = useState<Awaited<ReturnType<typeof loadRegistryStatePreview>>>();
  const [loadingState, setLoadingState] = useState(false);
  const [stateProgress, setStateProgress] = useState<RegistryImportProgress>();
  const [scanError, setScanError] = useState('');
  const [stateError, setStateError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'USFA' | 'NPPES'>('all');
  const [dispositionFilter, setDispositionFilter] = useState<RegistryImportDisposition | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, RegistryImportCandidate>>(() => new Map());
  const [stagedRetry, setStagedRetry] = useState<{ selectionKey: string; profiles: Agency[] }>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeProgress, setWriteProgress] = useState<RegistryImportWriteProgress>();
  const [writeError, setWriteError] = useState('');
  const [writeResult, setWriteResult] = useState<RegistryImportResult>();
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setAccessLoading(true);
    void loadAgencyWorkspaceAccess().then((role) => {
      if (active) setAccess(role);
    }).finally(() => {
      if (active) setAccessLoading(false);
    });
    return () => { active = false; };
  }, []);

  const directoryReady = directoryStatus?.status === 'ready';
  const filteredCandidates = useMemo(() => (statePreview?.candidates ?? []).filter((candidate) =>
    (sourceFilter === 'all' || candidate.source === sourceFilter) &&
    (dispositionFilter === 'all' || candidate.disposition === dispositionFilter),
  ), [statePreview, sourceFilter, dispositionFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));
  const visibleCandidates = filteredCandidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const eligibleVisible = visibleCandidates.filter((candidate) => candidate.disposition === 'eligible');
  const selectedEligible = useMemo(() => [...selected.values()], [selected]);
  const selectedProfilesKey = selectedEligible.map((candidate) => candidate.id).sort().join('|');
  const selectedCount = selected.size;
  const canWrite = online && access === 'editor' && Boolean(onImportProfiles) && !writing;
  const selectedStateSummary = preview?.byState.find((state) => state.stateCode === selectedState);

  useEffect(() => {
    setPage(1);
  }, [selectedState, sourceFilter, dispositionFilter]);

  useEffect(() => {
    if (!confirmOpen) return;
    confirmCheckRef.current?.focus();
    return () => reviewButtonRef.current?.focus();
  }, [confirmOpen]);

  useEffect(() => {
    if (!preview || !manifest || !selectedState) {
      setStatePreview(undefined);
      return;
    }
    let active = true;
    setLoadingState(true);
    setStateError('');
    void loadRegistryStatePreview({
      stateCode: selectedState,
      manifest,
      agencies,
    }).then((result) => {
      if (active) setStatePreview(result);
    }).catch((error) => {
      if (active) setStateError(error instanceof Error ? error.message : 'State candidate review could not be loaded.');
    }).finally(() => {
      if (active) setLoadingState(false);
    });
    return () => { active = false; };
  }, [preview, manifest, selectedState, agencies]);

  const runScan = async () => {
    if (!directoryReady || scanning) return;
    setScanning(true);
    setScanError('');
    setPreview(undefined);
    setStatePreview(undefined);
    setSelected(new Map());
    setStagedRetry(undefined);
    setWriteResult(undefined);
    setWriteError('');
    setStateProgress(undefined);
    try {
      const loadedManifest = await loadSourceDirectoryManifest();
      setManifest(loadedManifest);
      const result = await buildNationwideRegistryPreview({
        manifest: loadedManifest,
        agencies,
        loadStateRecords: loadSourceDirectoryState,
        loadLocationState: loadNationalLocationState,
        onProgress: setStateProgress,
      });
      setPreview(result);
      setSelectedState((current) => current && loadedManifest.stateNames[current] ? current : Object.keys(loadedManifest.stateNames).sort()[0] ?? '');
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'The national snapshots could not be scanned.');
    } finally {
      setScanning(false);
    }
  };

  const toggleCandidate = (candidate: RegistryImportCandidate, checked: boolean) => {
    if (candidate.disposition !== 'eligible') return;
    setSelected((current) => {
      const next = new Map(current);
      if (checked) {
        if (next.size >= MAX_REGISTRY_IMPORT_SELECTION) return next;
        next.set(candidate.id, candidate);
      } else next.delete(candidate.id);
      return next;
    });
  };

  const toggleVisible = (checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const candidate of eligibleVisible) {
        if (checked && next.size < MAX_REGISTRY_IMPORT_SELECTION) next.set(candidate.id, candidate);
        else if (!checked) next.delete(candidate.id);
      }
      return next;
    });
  };

  const beginConfirmation = () => {
    if (!selectedCount || !canWrite) return;
    setAcknowledged(false);
    setConfirmOpen(true);
  };

  const createSelected = async () => {
    if (!acknowledged || !onImportProfiles || !canWrite || !selectedEligible.length) return;
    setWriting(true);
    setWriteError('');
    setWriteResult(undefined);
    setWriteProgress({ processed: 0, created: 0, alreadyPresent: 0, total: selectedEligible.length });
    try {
      const profiles = stagedRetry?.selectionKey === selectedProfilesKey
        ? stagedRetry.profiles
        : selectedEligible.map(({ identity }) => {
          if (!identity) throw new Error('An eligible source identity is unavailable. Run the review again.');
          return createSourceNativeAgency(identity, agencies);
        });
      setStagedRetry({ selectionKey: selectedProfilesKey, profiles });
      const result = await onImportProfiles(profiles, setWriteProgress);
      setWriteResult(result);
      setSelected(new Map());
      setStagedRetry(undefined);
      setConfirmOpen(false);
      setAcknowledged(false);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Creation could not be confirmed. You may safely retry; the service does not overwrite existing records.');
    } finally {
      setWriting(false);
    }
  };

  const stateName = selectedState ? manifest?.stateNames[selectedState] ?? selectedState : '';
  const sourceTotals = preview?.bySource;

  return (
    <section className="nri-panel" aria-labelledby="nri-title" data-testid="panel-national-agency-import">
      <header className="nri-header">
        <div className="nri-header-mark" aria-hidden="true"><Database size={19} /></div>
        <div className="nri-heading-copy">
          <p className="nri-eyebrow">Settings / public data</p>
          <h2 id="nri-title">National registry import</h2>
          <p>Review source-native identity listings before adding saved profiles.</p>
        </div>
        <span className={`nri-connection ${online ? 'is-online' : 'is-offline'}`} data-testid="status-import-connectivity">
          <span aria-hidden="true" />{online ? 'Online' : 'Offline'}
        </span>
      </header>

      <div className="nri-notice" role="note" data-testid="notice-registry-limitations">
        <ShieldCheck size={18} aria-hidden="true" />
        <p><strong>A listing is identity evidence only.</strong> Registry presence does not establish licensure, active operations, service area, equipment, contacts, or operational metrics. USFA updates are retired. NPPES Type 2 ambulance taxonomy is not licensure.</p>
      </div>

      <section className="nri-readiness" aria-labelledby="nri-readiness-title">
        <div>
          <h3 id="nri-readiness-title">Saved directory readiness</h3>
          <p data-testid="status-saved-directory">
            {directoryStatus?.status === 'ready'
              ? `Complete paginated directory ready · ${count(directoryStatus.loaded)} records loaded`
              : directoryStatus?.status === 'unavailable'
                ? `Saved directory unavailable · ${count(directoryStatus.loaded)} records loaded`
                : `Loading all saved records · ${count(directoryStatus?.loaded ?? 0)} loaded`}
          </p>
        </div>
        <button
          type="button"
          className="nri-button nri-button-primary"
          onClick={() => void runScan()}
          disabled={!directoryReady || scanning}
          data-testid="button-scan-registry-snapshots"
        >
          {scanning ? <RefreshCw className="nri-spin" size={16} aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}
          {scanning ? 'Scanning snapshots' : preview ? 'Rescan snapshots' : 'Scan static snapshots'}
        </button>
      </section>
      {!directoryReady && <p className="nri-inline-status" role="status" data-testid="status-scan-blocked">A complete saved-agency directory is required before scanning, so exact and possible matches are checked against all saved records.</p>}

      {scanning && (
        <div className="nri-progress" role="status" data-testid="status-national-scan-progress">
          <div className="nri-progress-top"><span>Reviewing state snapshots</span><span>{stateProgress ? `${stateProgress.completedStates} / ${stateProgress.totalStates}` : 'Preparing index'}</span></div>
          <div className="nri-progress-track"><span style={{ width: stateProgress ? `${(stateProgress.completedStates / stateProgress.totalStates) * 100}%` : '8%' }} /></div>
          <small>{stateProgress ? `Last completed: ${stateProgress.stateCode}` : 'Loading the source index…'}</small>
        </div>
      )}
      {scanError && <div className="nri-error" role="alert" data-testid="alert-scan-error"><AlertCircle size={17} /> <span>{scanError}</span><button type="button" onClick={() => void runScan()} disabled={!directoryReady || scanning} data-testid="button-retry-scan">Retry scan</button></div>}

      {preview && manifest && (
        <>
          <section className="nri-source-block" aria-label="Snapshot provenance" data-testid="summary-snapshot-provenance">
            <div className="nri-sources-grid">
              <article className="nri-source-card">
                <div className="nri-source-label"><span className="nri-source-dot usfa" />USFA fire departments</div>
                <strong>{dateLabel(manifest.sources.USFA.retrievedAt)}</strong>
                <small>Retrieved snapshot date · updates retired</small>
                <a href="https://apps.usfa.fema.gov/registry/search" target="_blank" rel="noreferrer" data-testid="link-usfa-source">USFA source <ExternalLink size={12} /></a>
              </article>
              <article className="nri-source-card">
                <div className="nri-source-label"><span className="nri-source-dot nppes" />NPPES ambulance organizations</div>
                <strong>{dateLabel(manifest.sources.NPPES.reportingPeriod)}</strong>
                <small>Reporting period · staged {dateLabel(manifest.sources.NPPES.stagedAt)}</small>
                <small>Type 2 taxonomy is not licensure</small>
                <a href="https://npiregistry.cms.hhs.gov/" target="_blank" rel="noreferrer" data-testid="link-nppes-source">NPPES source <ExternalLink size={12} /></a>
              </article>
            </div>
            <p className="nri-outside-note" data-testid="text-outside-jurisdictions"><strong>{count(preview.outsideStatesAndDc)}</strong> other-jurisdiction listings are kept outside state and D.C. importing.</p>
          </section>

          <section className="nri-summary" aria-labelledby="nri-summary-title">
            <div className="nri-section-heading">
              <div><p className="nri-eyebrow">Snapshot results</p><h3 id="nri-summary-title">Nationwide disposition</h3></div>
              <span className="nri-total" data-testid="value-national-total">{count(preview.totals.total)} listings</span>
            </div>
            <div className="nri-count-grid" data-testid="summary-national-dispositions">
              {([
                ['eligible', 'Eligible', 'Source identity and exact county established'],
                ['excluded', 'Excluded', 'Identity checks not satisfied'],
                ['duplicate', 'Exact duplicates', 'Already linked to a saved profile'],
                ['ambiguous', 'Possible matches', 'Needs human review'],
                ['unassigned', 'Unassigned', 'No supported county FIPS'],
              ] as const).map(([key, title, hint]) => (
                <div className={`nri-count-cell ${key}`} key={key} data-testid={`metric-national-${key}`}>
                  <span>{title}</span><strong>{count(preview.totals[key])}</strong><small>{hint}</small>
                </div>
              ))}
            </div>
            <div className="nri-source-totals" data-testid="summary-source-totals">
              {(['USFA', 'NPPES'] as const).map((source) => (
                <div key={source} data-testid={`row-source-totals-${source.toLowerCase()}`}>
                  <strong>{source}</strong>
                  <span>{count(sourceTotals?.[source].total ?? 0)} listings</span>
                  <span>{count(sourceTotals?.[source].eligible ?? 0)} eligible</span>
                  <span>{count(sourceTotals?.[source].excluded ?? 0)} excluded</span>
                  <span>{count(sourceTotals?.[source].duplicate ?? 0)} exact duplicates</span>
                  <span>{count(sourceTotals?.[source].ambiguous ?? 0)} possible matches</span>
                  <span>{count(sourceTotals?.[source].unassigned ?? 0)} unassigned</span>
                </div>
              ))}
            </div>
            <details className="nri-state-totals" data-testid="details-state-totals">
              <summary data-testid="summary-state-totals">State and D.C. totals <span>{preview.byState.length} jurisdictions</span></summary>
              <div className="nri-table-wrap">
                <table>
                  <thead><tr><th scope="col">State</th><th scope="col">Eligible</th><th scope="col">Excluded</th><th scope="col">Exact duplicates</th><th scope="col">Possible matches</th><th scope="col">Unassigned</th><th scope="col">Source details</th></tr></thead>
                  <tbody>{preview.byState.map((state) => (
                    <tr key={state.stateCode} data-testid={`row-state-total-${state.stateCode}`}>
                      <th scope="row">{manifest.stateNames[state.stateCode] ?? state.stateCode}</th>
                      <td>{count(state.totals.eligible)}</td><td>{count(state.totals.excluded)}</td><td>{count(state.totals.duplicate)}</td><td>{count(state.totals.ambiguous)}</td><td>{count(state.totals.unassigned)}</td>
                      <td><details data-testid={`details-state-source-${state.stateCode}`}><summary data-testid={`summary-state-source-${state.stateCode}`}>USFA + NPPES</summary><div className="nri-state-source-breakdown">{(['USFA', 'NPPES'] as const).map((source) => {
                        const sourceCounts = state.bySource[source];
                        return <section key={source}><strong>{source}</strong><span>{count(sourceCounts.total)} total · {count(sourceCounts.eligible)} eligible · {count(sourceCounts.excluded)} excluded · {count(sourceCounts.duplicate)} duplicates · {count(sourceCounts.ambiguous)} possible · {count(sourceCounts.unassigned)} unassigned</span></section>;
                      })}</div></details></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="nri-review" aria-labelledby="nri-review-title">
            <div className="nri-section-heading">
              <div><p className="nri-eyebrow">Candidate review</p><h3 id="nri-review-title">Inspect state listings</h3></div>
              <span className="nri-selection-count" data-testid="value-selected-count">{selectedCount} / {MAX_REGISTRY_IMPORT_SELECTION} selected</span>
            </div>
            <div className="nri-filter-row">
              <label>State
                <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)} disabled={!preview} data-testid="select-import-state" aria-label="Filter candidates by state">
                  {Object.entries(manifest.stateNames).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option value={code} key={code}>{name}</option>)}
                </select>
              </label>
              <label>Source
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)} data-testid="select-import-source" aria-label="Filter candidates by source">
                  <option value="all">Both sources</option><option value="USFA">USFA</option><option value="NPPES">NPPES</option>
                </select>
              </label>
              <label>Disposition
                <select value={dispositionFilter} onChange={(event) => setDispositionFilter(event.target.value as typeof dispositionFilter)} data-testid="select-import-disposition" aria-label="Filter candidates by disposition">
                  <option value="all">All dispositions</option><option value="eligible">Eligible</option><option value="excluded">Excluded</option><option value="duplicate">Exact duplicate</option><option value="ambiguous">Possible match</option><option value="unassigned">County unassigned</option>
                </select>
              </label>
            </div>

            {selectedStateSummary && (
              <div className="nri-state-summary" data-testid={`summary-state-${selectedState}`}>
                <strong>{stateName}</strong>
                <span>{count(selectedStateSummary.totals.eligible)} eligible</span>
                <span>{count(selectedStateSummary.totals.excluded)} excluded</span>
                <span>{count(selectedStateSummary.totals.duplicate)} exact duplicates</span>
                <span>{count(selectedStateSummary.totals.ambiguous)} possible matches</span>
                <span>{count(selectedStateSummary.totals.unassigned)} unassigned</span>
              </div>
            )}
            {selectedStateSummary && Object.keys(selectedStateSummary.countyTotals).length > 0 && (
              <details className="nri-county-totals" data-testid={`details-county-totals-${selectedState}`}>
                <summary data-testid={`summary-county-totals-${selectedState}`}>Eligible listings by exact county <span>{Object.keys(selectedStateSummary.countyTotals).length} counties</span></summary>
                <ul>{Object.entries(selectedStateSummary.countyTotals).sort((a, b) => a[1].countyName.localeCompare(b[1].countyName)).map(([fips, county]) => (
                  <li key={fips} data-testid={`row-county-total-${fips}`}><strong>{county.countyName}</strong><span>{count(county.total)} listings</span><small>FIPS {fips} · USFA {count(county.USFA)} · NPPES {count(county.NPPES)}</small></li>
                ))}</ul>
              </details>
            )}
            {selectedStateSummary?.locationSnapshotUnavailable && <p className="nri-inline-status" role="note" data-testid="notice-location-snapshot-unavailable">Location snapshot unavailable. County totals and eligibility require exact supported FIPS; no county is inferred from city or ZIP.</p>}

            {stateError && <div className="nri-error" role="alert" data-testid="alert-state-review-error"><AlertCircle size={17} /><span>{stateError}</span><button type="button" onClick={() => { setPreview({ ...preview }); }} data-testid="button-retry-state-review">Retry state review</button></div>}
            {loadingState ? <div className="nri-skeleton" role="status" data-testid="status-state-review-loading"><span /><span /><span />Loading {stateName} candidate review…</div> : (
              <>
                <div className="nri-review-toolbar">
                  <p data-testid="text-candidate-result-count">{count(filteredCandidates.length)} {filteredCandidates.length === 1 ? 'record' : 'records'} · page {page} of {pageCount}</p>
                  <label className="nri-select-page"><input
                    type="checkbox"
                    checked={eligibleVisible.length > 0 && eligibleVisible.every((candidate) => selected.has(candidate.id))}
                    onChange={(event) => toggleVisible(event.target.checked)}
                    disabled={!eligibleVisible.length || (selectedCount >= MAX_REGISTRY_IMPORT_SELECTION && !eligibleVisible.every((candidate) => selected.has(candidate.id)))}
                    data-testid="checkbox-select-visible-eligible"
                  />Select eligible on this page</label>
                </div>
                {!visibleCandidates.length ? (
                  <div className="nri-empty" data-testid="empty-candidate-results"><span className="nri-empty-mark" aria-hidden="true"><Database size={18} /></span><strong>No listings in this view</strong><p>Try another source or disposition filter. No records are generated to fill gaps.</p></div>
                ) : (
                  <div className="nri-candidate-list" data-testid="list-registry-candidates">
                    {visibleCandidates.map((candidate) => {
                      const checked = selected.has(candidate.id);
                      const blockedAtLimit = !checked && selectedCount >= MAX_REGISTRY_IMPORT_SELECTION;
                      return (
                        <article className={`nri-candidate ${candidate.disposition}`} key={candidate.id} data-testid={`card-registry-candidate-${candidate.id}`}>
                          <div className="nri-candidate-main">
                            <div className="nri-candidate-title">
                              {candidate.disposition === 'eligible' && <label className="nri-candidate-check" aria-label={`Select ${candidate.name}`}><input type="checkbox" checked={checked} onChange={(event) => toggleCandidate(candidate, event.target.checked)} disabled={blockedAtLimit} data-testid={`checkbox-candidate-${candidate.id}`} /><span aria-hidden="true">{checked && <Check size={12} />}</span></label>}
                              <div><h4>{candidate.name}</h4><p>{candidate.source} <span>·</span> {candidate.stateCode} <span>·</span> {dateLabel(candidate.sourceDate)}</p></div>
                              <span className={`nri-disposition ${candidate.disposition}`} data-testid={`status-candidate-disposition-${candidate.id}`}>{dispositionLabels[candidate.disposition]}</span>
                            </div>
                            <div className="nri-candidate-data">
                              <div><span>Identifier</span><strong>{candidate.identifier || 'Not reported'}</strong></div>
                              <div><span>Location</span><strong>{[candidate.address, candidate.city, candidate.stateCode, candidate.postalCode].filter(Boolean).join(', ') || 'Not reported'}</strong></div>
                              <div><span>County assignment</span><strong>{candidate.countyName && candidate.countyFips ? `${candidate.countyName} · FIPS ${candidate.countyFips}` : 'Not established'}</strong><small>{countyBasisLabel(candidate.countyAssignmentBasis)}{candidate.sourceCounty ? ` · source county: ${candidate.sourceCounty}` : ''}</small></div>
                            </div>
                            <div className="nri-candidate-footer">
                              <p><strong>Disposition reason:</strong> {candidate.reason}</p>
                              <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" data-testid={`link-candidate-source-${candidate.id}`}>Open source listing <ArrowUpRight size={14} aria-hidden="true" /></a>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <nav className="nri-pagination" aria-label="Candidate pages">
                  <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} data-testid="button-candidates-previous"><ChevronLeft size={16} />Previous</button>
                  <span data-testid="text-candidate-page">Page {page} of {pageCount}</span>
                  <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} data-testid="button-candidates-next">Next<ChevronRight size={16} /></button>
                </nav>
              </>
            )}
          </section>

          <footer className="nri-import-footer">
            <div>
              <strong>{selectedCount ? `${selectedCount} eligible ${selectedCount === 1 ? 'profile' : 'profiles'} selected` : 'No candidates selected'}</strong>
              <p>Selection stays in this panel’s memory only. One creation action is limited to {MAX_REGISTRY_IMPORT_SELECTION} profiles.</p>
            </div>
            <button ref={reviewButtonRef} type="button" className="nri-button nri-button-primary" onClick={beginConfirmation} disabled={!selectedCount || selectedCount > MAX_REGISTRY_IMPORT_SELECTION || !canWrite} data-testid="button-review-before-create">
              Review and create <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </footer>
          {accessLoading && <p className="nri-access-message" role="status" data-testid="status-import-access">Checking workspace access…</p>}
          {!accessLoading && access !== 'editor' && <p className="nri-access-message" role="note" data-testid="notice-import-access">{access === 'viewer' ? 'Workspace access is view-only. An editor must create profiles.' : access === 'sign-in-required' ? 'Sign in to an editor workspace to create profiles.' : access === 'no-access' ? 'No editor access is available for this workspace.' : 'Workspace access could not be confirmed. Profile creation is unavailable.'}</p>}
          {!online && <p className="nri-access-message" role="note" data-testid="notice-import-offline">Connect to the workspace before creating profiles. Your review remains available.</p>}
          {!onImportProfiles && <p className="nri-access-message" role="note" data-testid="notice-import-callback-unavailable">Profile creation is not connected in this workspace.</p>}
          {writeProgress && (
            <div className="nri-write-progress" role="status" data-testid="status-import-write-progress">
              <div className="nri-progress-top"><span>{writing ? 'Creating source-native profiles' : 'Last creation attempt'}</span><span>{count(writeProgress.processed)} / {count(writeProgress.total)}</span></div>
              <div className="nri-progress-track"><span style={{ width: `${writeProgress.total ? (writeProgress.processed / writeProgress.total) * 100 : 0}%` }} /></div>
              <small>{count(writeProgress.created)} created · {count(writeProgress.alreadyPresent)} already present</small>
            </div>
          )}
          {writeResult && <p className="nri-success" role="status" data-testid="status-import-result">{count(writeResult.createdIds.length)} profiles created · {count(writeResult.alreadyPresent)} already present. Existing profiles were not overwritten.</p>}
          {writeError && <div className="nri-error" role="alert" data-testid="alert-import-error"><AlertCircle size={17} /><span>{writeError}</span><button type="button" onClick={beginConfirmation} disabled={!selectedCount || !canWrite} data-testid="button-retry-import">Review retry</button></div>}
        </>
      )}

      {confirmOpen && (
        <div className="nri-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !writing) setConfirmOpen(false); }} data-testid="dialog-backdrop-import-confirmation">
          <section className="nri-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="nri-confirm-title" aria-describedby="nri-confirm-copy" onKeyDown={(event) => {
            if (event.key === 'Escape' && !writing) setConfirmOpen(false);
            if (event.key === 'Tab') {
              const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }} data-testid="dialog-import-confirmation">
            <div className="nri-dialog-icon" aria-hidden="true"><ShieldCheck size={20} /></div>
            <p className="nri-eyebrow">Final confirmation</p>
            <h3 id="nri-confirm-title">Create {selectedCount} saved {selectedCount === 1 ? 'profile' : 'profiles'}?</h3>
            <p id="nri-confirm-copy">Only reviewed eligible source identities will be sent to the create-only workspace service. Existing profiles are never overwritten. A registry listing does not verify licensure or current operations.</p>
            <label className="nri-confirm-check"><input ref={confirmCheckRef} type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} data-testid="checkbox-confirm-registry-limits" /><span>I understand these are source-native identity profiles and the source limits above.</span></label>
            <div className="nri-dialog-actions">
              <button type="button" className="nri-button nri-button-secondary" onClick={() => setConfirmOpen(false)} disabled={writing} data-testid="button-cancel-import">Cancel</button>
              <button type="button" className="nri-button nri-button-primary" onClick={() => void createSelected()} disabled={!acknowledged || writing || !canWrite} data-testid="button-confirm-create-profiles">{writing ? 'Creating…' : 'Create profiles'}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
