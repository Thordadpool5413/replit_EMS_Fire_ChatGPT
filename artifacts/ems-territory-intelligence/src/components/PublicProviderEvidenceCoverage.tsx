import React, { useEffect, useState } from 'react';
import { FileSearch, HeartPulse, PackageCheck, Receipt } from 'lucide-react';
import { EMS_JURISDICTION_SOURCE_COVERAGE } from '../data/stateEmsSourceCoverage';
import type { ProviderEvidence } from '../data/providerProfileEvidence';
import { publicProviderEvidenceCoverage, type EvidenceCoverageCounts, type EvidenceCoverageSnapshot } from '../services/publicProviderEvidenceCoverage';

const coveragePath = (import.meta.env?.BASE_URL ?? '/') + 'data/public-provider-evidence-coverage.json';
const metrics = [
  ['owned', 'Dated owned inventory count', PackageCheck],
  ['acquisitions', 'Dated purchase, receipt or payment', Receipt],
  ['payerMix', 'Published payer breakdown', FileSearch],
  ['namedDenials', 'Denial figures naming a payer', HeartPulse],
] as const;
const stateOptions = EMS_JURISDICTION_SOURCE_COVERAGE.filter(item => item.level !== 'territory');

async function loadPublicEvidenceCoverage(signal: AbortSignal): Promise<EvidenceCoverageSnapshot> {
  const response = await fetch(coveragePath, { signal });
  if (!response.ok) throw Error('Public evidence coverage unavailable.');
  const snapshot = await response.json();
  if (snapshot?.schemaVersion !== 1 || snapshot.source !== 'Bundled source audit' || !snapshot.national ||
    !snapshot.byState || !snapshot.byCounty) throw Error('Unexpected public evidence coverage format.');
  return snapshot;
}

function EvidenceCounts({ counts, within }: { counts?: EvidenceCoverageCounts; within: string }) {
  if (!counts) return <p role="status">Public evidence coverage is unavailable for this geography.</p>;
  return <>
    <p><strong>{counts.listings.toLocaleString()}</strong> audited provider listings in {within}</p>
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {metrics.map(([key, label, Icon]) => <div key={key} className="min-w-0">
        <dt><Icon size={16} aria-hidden="true" /> {label}</dt>
        <dd><strong>{counts[key].toLocaleString()}</strong> listings</dd>
      </div>)}
    </dl>
  </>;
}

export function PublicProviderEvidenceCoverage({ state, county }: { state?: string; county?: string }) {
  const [opened, setOpened] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const national = !state;
  const [snapshot, setSnapshot] = useState<EvidenceCoverageSnapshot>();
  const [failed, setFailed] = useState(false);
  const requested = national || opened;
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    loadPublicEvidenceCoverage(controller.signal).then(
      result => { if (!controller.signal.aborted) setSnapshot(result); },
      () => { if (!controller.signal.aborted) setFailed(true); },
    );
    return () => controller.abort();
  }, [requested]);
  const jurisdiction = stateOptions.find(item => item.code === (state ?? selectedState));
  const scopeCounts = county ? snapshot?.byCounty[county] : state ? snapshot?.byState[state] : snapshot?.national;
  const scope = county ? 'this county area' : state ? 'this state' : 'the United States and D.C.';
  const panel = <>
    {!snapshot && !failed ? <p role="status">Loading public evidence coverage…</p> : <EvidenceCounts counts={scopeCounts} within={scope} />}
    {national && snapshot && <>
      <p className="text-sm">{Object.keys(snapshot.byState).length} states and districts · {Object.keys(snapshot.byCounty).length.toLocaleString()} county areas</p>
      <label className="block text-sm my-2">State or district
        <select className="block border rounded px-2 py-1" value={selectedState} onChange={event => setSelectedState(event.target.value)}>
          <option value="">Select a state or D.C.</option>
          {stateOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </label>
      {selectedState && <EvidenceCounts counts={snapshot.byState[selectedState]} within={jurisdiction?.name ?? selectedState} />}
    </>}
    {jurisdiction && !county && <p className="text-sm">
      <a className="underline" href={jurisdiction.directoryUrl} target="_blank" rel="noreferrer">{jurisdiction.name} EMS source directory</a>
    </p>}
    <p className="text-xs">Counts reflect public evidence bundled in the app. A provider can appear in more than one registry. Zero means the audit found no qualifying record. Private imports are separate.</p>
  </>;
  return national ? <section className="workspace-export-panel" aria-labelledby="public-evidence-coverage-title">
    <div className="min-w-0 w-full">
      <h2 id="public-evidence-coverage-title">Nationwide public provider evidence</h2>
      {panel}
    </div>
  </section> : <details className="cv-note" onToggle={event => {
    if (event.target === event.currentTarget && event.currentTarget.open) setOpened(true);
  }}>
    <summary>Public provider evidence coverage</summary>
    {opened && panel}
  </details>;
}

export function ProviderEvidenceStatus({ evidence }: { evidence?: ProviderEvidence }) {
  const { owned, acquisitions, datedApprovals, payerMix, denials, namedPayers } = publicProviderEvidenceCoverage(evidence);
  const statuses = [
    owned.length ? 'Dated ownership and quantity documented' : 'No dated owned inventory count in audited sources',
    acquisitions.length ? 'Dated purchase, receipt or payment evidence documented' : datedApprovals.length
      ? 'Dated approval or service authorization on file' : 'No dated purchase, receipt or payment in audited sources',
    payerMix ? 'Published payer breakdown on file' : 'No payer breakdown in audited sources',
    namedPayers.length ? 'Published denial figures name ' + namedPayers.join(', ')
      : denials ? 'Published denial figures without payer detail' : 'No denial data in audited sources',
  ];
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><FileSearch size={20} aria-hidden="true" /> Public evidence for this provider</h2>
    <ul className="pr-source-grid">
      {metrics.map(([key, label, Icon], index) => <li className="pr-source-tile" key={key}>
        <strong className="pr-icon-heading"><Icon size={16} aria-hidden="true" /> {label}</strong>
        <p>{statuses[index]}</p>
      </li>)}
    </ul>
  </section>;
}
