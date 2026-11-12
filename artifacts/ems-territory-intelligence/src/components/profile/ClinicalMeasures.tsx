/**
 * Reported clinical measures only. No defaults, no simulated uplift, no projected survivors.
 * No target ticks: the app has no sourced target for these measures.
 * Each rate states its own denominator definition; annual arrest volume is shown as context, not as a denominator.
 */
import React from 'react';
import { Activity } from 'lucide-react';
import type { Agency } from '../../types';

const safeUrl = (v?: string) => { try { const u = new URL(v ?? ''); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined; } catch { return undefined; } };
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const ClinicalMeasures: React.FC<{ agency: Agency }> = ({ agency }) => {
  const q = agency.qualityMetrics ?? ({} as Agency['qualityMetrics']);
  const ev = agency.factEvidence?.clinicalOutcomes;
  const rows: Array<{ key: string; label: string; def: string; value: unknown }> = [
    { key: 'utstein', label: 'Utstein survival', def: 'Of bystander-witnessed arrests with a shockable first rhythm, share surviving to hospital discharge', value: agency.utsteinSurvivalRate },
    { key: 'bystander', label: 'Bystander CPR', def: 'Of non-EMS-witnessed arrests, share receiving CPR before EMS arrival', value: agency.bystanderCPRRate },
    { key: 'cpc', label: 'Good neurological survival', def: 'Of included arrests, share discharged with CPC 1-2 (CARES definition)', value: q.caresGoodNeurologicalSurvivalPct },
    { key: 'stemi', label: '12-lead within 10 min', def: 'Of chest-pain patients, share with 12-lead ECG within 10 minutes (NEMSQA Cardiac-01)', value: q.nemsqaStemi12LeadAcquisitionPct },
    { key: 'ccf', label: 'Chest compression fraction', def: 'Of CPR time in resuscitations, share with compressions active', value: q.nemsqaChestCompressionFractionPct },
    { key: 'etco2', label: 'ETCO2 ventilation compliance', def: 'Of ventilated patients, share with ETCO2 maintained 35-45 mmHg', value: q.nemsqaEtco2VentilationCompliancePct },
    { key: 'peds', label: 'Pediatric respiratory support', def: 'Of pediatric respiratory-distress patients, share given respiratory support (NEMSQA Pediatrics-01)', value: q.nemsqaPediatricRespiratorySupportPct },
    { key: 'stroke', label: 'Stroke last-known-well', def: 'Of suspected-stroke patients, share with last-known-well documented (NEMSQA Stroke-01)', value: q.nemsqaStrokeLkwDocumentedPct },
    { key: 'pain', label: 'Trauma pain management', def: 'Of trauma patients with pain, share assessed and addressed (NEMSQA Trauma-01)', value: q.nemsqaPainManagementEffectivePct },
  ];
  const reported = rows.filter((r) => isNum(r.value));
  const missing = rows.filter((r) => !isNum(r.value));

  return (
    <section className="acm" aria-labelledby="acm-title" data-testid="clinical-measures">
      <header className="afi-head">
        <h3 id="acm-title"><Activity aria-hidden="true" className="h-4 w-4" />Reported clinical measures</h3>
        <span className="afi-kind" data-kind="reported">Reported</span>
      </header>
      <p className="afi-note">
        {ev?.sourceName ? <>Source: {safeUrl(ev.sourceUrl) ? <a href={safeUrl(ev.sourceUrl)} target="_blank" rel="noopener noreferrer">{ev.sourceName}</a> : ev.sourceName}{ev.reportingPeriod ? ` · ${ev.reportingPeriod}` : ' · period not stated'}</> : 'Unconfirmed record entries.'}
        {' '}Context only: {isNum(agency.annualCardiacArrestCalls) ? `${agency.annualCardiacArrestCalls.toLocaleString()} cardiac arrest responses / yr recorded` : 'annual arrest volume not reported'}. This volume is not the denominator of the rates below; case counts per measure are not recorded.
      </p>
      {reported.length === 0 ? (
        <p className="afi-unavailable">No clinical measures are recorded for this agency.</p>
      ) : (
        <ul className="acm-bars">
          {reported.map((r) => (
            <li key={r.key} data-testid={`clinical-${r.key}`}>
              <div className="acm-label"><span>{r.label}</span><small>{r.def}</small></div>
              <div className="acm-track" role="img" aria-label={`${r.label} ${r.value}%`}>
                <span className="acm-fill" style={{ width: `${Math.min(100, Math.max(0, r.value as number))}%` }} />
              </div>
              <span className="acm-val">{(r.value as number).toLocaleString()}%{((r.value as number)<0||(r.value as number)>100)&&<small>Outside 0–100%; review value</small>}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="afi-note">No targets are shown because no sourced target is recorded. {missing.length > 0 && `Not reported: ${missing.map((m) => m.label).join(', ')}.`}</p>
    </section>
  );
};

export default ClinicalMeasures;
