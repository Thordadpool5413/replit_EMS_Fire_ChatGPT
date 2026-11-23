/**
 * Financial Intelligence: reported payer data separated from ONE selected planning scenario.
 * Every scenario shows its assumptions and a reconciling breakdown. Nothing here is an agency outcome.
 * Trade-in credit is applied once (capital scenario) and never added to operating savings.
 */
import React, { useMemo, useState } from 'react';
import { ScrollableTableRegion } from '../ScrollableTableRegion';
import { AlertTriangle, Ban, Calculator, Coins, FileBarChart, HandCoins, Percent, Receipt, ServerCog, Wallet, Wrench } from 'lucide-react';
import type { Agency } from '../../types';
import type { AgencyTcoComparison } from '../../data/clinicalAndCompetitiveIntelligence';
import type { ServiceMode } from './AgencyIntelligenceBrief';
import { safeSourceUrl } from '../../services/factReviewStore';

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const usd = (v: number | null | undefined) => (isNum(v) ? `$${Math.round(v).toLocaleString()}` : 'Not reported');
const pct = (v: number | null | undefined) => (isNum(v) ? `${v.toLocaleString()}%` : 'Not reported');

/** Monitor benchmark models available for an explicitly selected comparison. */
export const MONITOR_BENCHMARKS = [
  { id: 'lp15-intel', label: 'Stryker LIFEPAK 15' },
  { id: 'lp35-intel', label: 'Stryker LIFEPAK 35' },
  { id: 'philips-mrx-tempus', label: 'Philips HeartStart MRx / Tempus Pro' },
] as const;

/**
 * Returns a benchmark id only when the recorded monitor text names the actual model.
 * A brand alone (for example "Stryker" or "Philips") is not a model match.
 */
export const matchBenchmarkModelId = (agency: Agency): string | null => {
  const t = (agency.installedFleet?.defibBrand || '').toLowerCase().replace(/[\s-]+/g, ' ');
  if (/\b(lifepak|lp) ?35\b/.test(t)) return 'lp35-intel';
  if (/\b(lifepak|lp) ?15\b/.test(t)) return 'lp15-intel';
  if (/\bmrx\b|\btempus\b/.test(t)) return 'philips-mrx-tempus';
  return null;
};
export const isBenchmarkIncumbentRecognized = (agency: Agency) => matchBenchmarkModelId(agency) != null;

type Scenario = 'operating' | 'capital' | 'recovery';

export interface FinancialIntelligenceProps {
  agency: Agency;
  mode: ServiceMode;
  tcoModel: AgencyTcoComparison | null;
  /** True when the recorded model matched; false means any comparison model is the user's selected assumption. */
  benchmarkMatched: boolean;
  selectedBenchmarkId: string | null;
  onSelectBenchmark: (id: string | null) => void;
  /** Units included in the comparison (<= reported units). Reported inventory is not eligibility. */
  includedUnits: number | null;
  onIncludedUnits: (v: number | null) => void;
  unitMsrp: number;
  tradeInPerUnit: number;
  capturePct: number;
  onUnitMsrp: (v: number) => void;
  onTradeIn: (v: number) => void;
  onCapturePct: (v: number) => void;
  /** Denied amount only when scope, period and source are all recorded; otherwise null. */
  recoveryPool: number | null;
}

const Assumption: React.FC<{ id: string; label: string; value: number; min: number; max: number; step: number; suffix?: string; prefix?: string; onChange: (v: number) => void }> = ({ id, label, value, min, max, step, suffix, prefix, onChange }) => (
  <label className="afi-assumption" htmlFor={id}>
    <span>{label}</span>
    <span className="afi-assumption-input">
      {prefix && <i>{prefix}</i>}
      <input
        id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
        data-testid={`input-${id}`}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }}
      />
      {suffix && <i>{suffix}</i>}
    </span>
  </label>
);

export const FinancialIntelligence: React.FC<FinancialIntelligenceProps> = ({
  agency, mode, tcoModel, benchmarkMatched, selectedBenchmarkId, onSelectBenchmark, includedUnits, onIncludedUnits, unitMsrp, tradeInPerUnit, capturePct, onUnitMsrp, onTradeIn, onCapturePct, recoveryPool,
}) => {
  const cms = agency.cmsData ?? ({} as Agency['cmsData']);
  const units = agency.installedFleet?.defibUnitsCount;
  const hasUnits = isNum(units) && Number.isInteger(units) && units > 0;
  const unitReason = !isNum(units) ? 'Reported monitor unit count is missing.'
    : units === 0 ? 'Reported monitor count is 0; there are no recorded units to compare.'
    : 'Reported monitor unit count is not a positive whole number. Confirm the recorded quantity before using a scenario.';
  const recognized = Boolean(selectedBenchmarkId);
  const transports = mode !== 'fire';

  const payers = [
    { key: 'medicare', label: 'Medicare', value: cms.medicarePayerPct, tone: 'navy' },
    { key: 'medicaid', label: 'Medicaid', value: cms.medicaidPayerPct, tone: 'blue' },
    { key: 'commercial', label: 'Commercial', value: cms.commercialPayerMixPct, tone: 'teal' },
    { key: 'selfpay', label: 'Self-pay', value: cms.selfPayPayerPct, tone: 'red' },
  ];
  const reported = payers.filter((p) => isNum(p.value));
  const payerSum = reported.reduce((s, p) => s + (p.value as number), 0);
  const allReported = reported.length === payers.length;
  const invalidPayer = reported.some(p => (p.value as number) < 0 || (p.value as number) > 100);
  const payerDiscrepancy = invalidPayer || payerSum > 100.5 || (allReported && payerSum < 99.5);

  const scenarios = useMemo(() => {
    const list: Array<{ id: Scenario; label: string; available: boolean; why: string }> = [
      { id: 'operating', label: '5-year operating cost', available: Boolean(tcoModel && hasUnits && recognized), why: !hasUnits ? unitReason : !recognized ? 'Recorded monitor model does not match a benchmark. Select a comparison model below to run it as an assumption.' : '' },
      { id: 'capital', label: 'Replacement capital', available: hasUnits, why: unitReason },
      { id: 'recovery', label: 'Claims recovery', available: transports && recoveryPool != null, why: !transports ? 'Not applicable to a non-transport fire department.' : 'Denied amount with scope, period and source is not recorded.' },
    ];
    return list;
  }, [tcoModel, hasUnits, unitReason, recognized, transports, recoveryPool]);
  const firstAvailable = scenarios.find((s) => s.available)?.id ?? 'capital';
  const [scenario, setScenario] = useState<Scenario>(firstAvailable);
  const active = scenarios.find((s) => s.id === scenario)!;

  const n = hasUnits ? (includedUnits ?? units) : null;
  const effectiveTradeIn = Math.min(tradeInPerUnit, unitMsrp);
  const tradeInClamped = tradeInPerUnit > unitMsrp;
  const gross = n != null ? n * unitMsrp : null;
  const credit = n != null ? n * effectiveTradeIn : null;
  const net = gross != null && credit != null ? gross - credit : null;
  const zollOperating = tcoModel ? tcoModel.zollServiceTotal + tcoModel.zollBatteryTotal + tcoModel.zollConsumablesTotal : null;
  const recovery = recoveryPool != null ? Math.round(recoveryPool * (capturePct / 100)) : null;

  return (
    <div className="afi" data-testid="financial-intelligence">
      {transports ? (
        <section className="afi-reported" aria-labelledby="afi-reported-title">
          <header className="afi-head">
            <h3 id="afi-reported-title"><Receipt aria-hidden="true" className="h-4 w-4" />Reported payer &amp; billing data</h3>
            <span className="afi-kind" data-kind="reported">Reported</span>
          </header>
          <dl className="afi-lead" data-testid="financial-lead-figures">
            <div><dt>Medicare billed / yr</dt><dd className={isNum(cms.medicareBilledAnnual) ? '' : 'is-missing'}>{usd(cms.medicareBilledAnnual)}</dd></div>
            <div><dt>Medicare allowed / yr</dt><dd className={isNum(cms.medicareAllowedAnnual) ? '' : 'is-missing'}>{usd(cms.medicareAllowedAnnual)}</dd></div>
            <div><dt>Medicaid billed / yr</dt><dd className={isNum(cms.medicaidBilledAnnual) ? '' : 'is-missing'}>{usd(cms.medicaidBilledAnnual)}</dd></div>
          </dl>
          <p className="afi-note">{(safeSourceUrl(agency.factEvidence?.cmsClaims?.sourceUrl) || agency.factEvidence?.cmsClaims?.sourceName) ? <>Source: {safeSourceUrl(agency.factEvidence?.cmsClaims?.sourceUrl)
            ? <a href={safeSourceUrl(agency.factEvidence?.cmsClaims?.sourceUrl)} target="_blank" rel="noopener noreferrer">{agency.factEvidence?.cmsClaims?.sourceName || 'Claim source'}</a>
            : agency.factEvidence?.cmsClaims?.sourceName}. </> : null}
            Claim-source period: {agency.factEvidence?.cmsClaims?.reportingPeriod || 'not reported'}.</p>
          <div className="afi-payer-bar" role="img" aria-label={`Reported payer shares: ${payers.map((p) => `${p.label} ${pct(p.value)}`).join(', ')}`}>
            {reported.map((p) => (
              <span key={p.key} data-tone={p.tone} style={{ width: `${Math.min(100, ((p.value as number) / Math.max(100, payerSum)) * 100)}%` }} />
            ))}
          </div>
          <dl className="afi-payers">
            {payers.map((p) => (
              <div key={p.key} data-tone={p.tone} data-testid={`payer-${p.key}`}>
                <dt><Percent aria-hidden="true" className="afi-ico" />{p.label}</dt>
                <dd className={isNum(p.value) ? '' : 'is-missing'}>{pct(p.value)}</dd>
              </div>
            ))}
          </dl>
          {payerDiscrepancy && (
            <p className="afi-flag" role="status" data-testid="payer-discrepancy">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              {invalidPayer ? 'At least one reported share is outside 0–100%.' : `Reported shares total ${payerSum.toLocaleString()}%, not 100%.`} Shares may use different periods or denominators; flag this in Evidence before relying on it.
            </p>
          )}
          {!allReported && reported.length > 0 && !payerDiscrepancy && (
            <p className="afi-note">Only {reported.length} of 4 payer shares are reported; the remainder is unknown, not zero.</p>
          )}
          <dl className="afi-rows afi-rows--icons">
            <div><dt><Wallet aria-hidden="true" className="afi-ico" />Commercial underpayment / trip</dt><dd>{usd(agency.qualityMetrics?.commercialUnderpaymentPerTrip)}</dd></div>
            <div><dt><Ban aria-hidden="true" className="afi-ico" />Top denial reason</dt><dd>{cms.topDenialReason || 'Not reported'}</dd></div>
            <div><dt><FileBarChart aria-hidden="true" className="afi-ico" />GADCS status</dt><dd>{cms.gadcsReportingStatus || 'Not reported'}</dd></div>
            <div><dt><ServerCog aria-hidden="true" className="afi-ico" />Billing software</dt><dd>{agency.installedFleet?.billingSoftware || 'Not reported'}</dd></div>
          </dl>
        </section>
      ) : (
        <section className="afi-reported" aria-label="Billing applicability">
          <p className="afi-note">Fire department without recorded ambulance transport: ambulance billing and payer mix are not applicable. Equipment capital and operating scenarios remain available.</p>
        </section>
      )}

      <section className="afi-scenario" aria-labelledby="afi-scenario-title">
        <header className="afi-head">
          <h3 id="afi-scenario-title"><Calculator aria-hidden="true" className="h-4 w-4" />Planning scenario</h3>
          <span className="afi-kind" data-kind="model">Hypothetical</span>
        </header>
        <div className="afi-switch" role="radiogroup" aria-label="Select one comparison">
          {scenarios.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={scenario === s.id}
              className={scenario === s.id ? 'is-active' : ''} onClick={() => setScenario(s.id)}
              data-testid={`button-scenario-${s.id}`}>
              {s.id === 'operating' ? <Wrench aria-hidden="true" className="h-3.5 w-3.5" /> : s.id === 'capital' ? <Coins aria-hidden="true" className="h-3.5 w-3.5" /> : <FileBarChart aria-hidden="true" className="h-3.5 w-3.5" />}
              {s.label}
            </button>
          ))}
        </div>

        {!active.available ? (
          <p className="afi-unavailable" role="status" data-testid="scenario-unavailable">Not calculated. {active.why}</p>
        ) : scenario === 'operating' && tcoModel ? (
          <div className="afi-body">
            <p className="afi-note">{benchmarkMatched ? `Benchmark matched to the recorded model: ${agency.installedFleet.defibBrand}.` : `Selected comparison assumption: recorded monitor "${agency.installedFleet.defibBrand}" compared with ${tcoModel.incumbentModel}.`}</p>
            <p className="afi-result"><span><Wrench aria-hidden="true" className="afi-ico" />Illustrative 5-year operating difference</span><strong>{usd(tcoModel.fiveYearOperatingSavings)}</strong></p>
            <ScrollableTableRegion label="Operating cost comparison"><table className="afi-table">
              <thead><tr><th>Cost driver ({tcoModel.unitCount} of {units} reported units)</th><th>{tcoModel.incumbentModel}</th><th>{tcoModel.zollModel}</th><th>Difference</th></tr></thead>
              <tbody>
                <tr><td>Service contracts, 60 months</td><td>{usd(tcoModel.incumbentServiceTotal)}</td><td>{usd(tcoModel.zollServiceTotal)}</td><td>{usd(tcoModel.incumbentServiceTotal - tcoModel.zollServiceTotal)}</td></tr>
                <tr><td>Battery replacements</td><td>{usd(tcoModel.incumbentBatteryTotal)}</td><td>{usd(tcoModel.zollBatteryTotal)}</td><td>{usd(tcoModel.incumbentBatteryTotal - tcoModel.zollBatteryTotal)}</td></tr>
                <tr><td>Electrodes and consumables</td><td>{usd(tcoModel.incumbentConsumablesTotal)}</td><td>{usd(tcoModel.zollConsumablesTotal)}</td><td>{usd(tcoModel.incumbentConsumablesTotal - tcoModel.zollConsumablesTotal)}</td></tr>
                <tr className="is-total"><td>Total</td><td>{usd(tcoModel.incumbentOperatingTotal)}</td><td>{usd(zollOperating)}</td><td>{usd(tcoModel.fiveYearOperatingSavings)}</td></tr>
              </tbody>
            </table></ScrollableTableRegion>
            <p className="afi-note">Benchmark per-unit rates from the app's competitive library, not agency spending. Trade-in credit is not included here; it is applied once in Replacement capital.</p>
            <details className="afi-more"><summary>Cumulative by year</summary>
              <ol className="afi-cumulative" aria-label="Cumulative operating difference by year, excluding trade-in">
                {[1, 2, 3, 4, 5].map((yr) => {
                  const v = Math.round((tcoModel.fiveYearOperatingSavings * yr) / 5);
                  const w = tcoModel.fiveYearOperatingSavings > 0 ? (v / tcoModel.fiveYearOperatingSavings) * 100 : 0;
                  return (<li key={yr}><span>Year {yr}</span><span className="afi-cum-track"><span style={{ width: `${Math.max(0, w)}%` }} /></span><b>{usd(v)}</b></li>);
                })}
              </ol>
              <p className="afi-note">Linear by year; same inputs as the table, trade-in excluded. Year 5 equals the table total.</p>
            </details>
          </div>
        ) : scenario === 'capital' ? (
          <div className="afi-body">
            <p className="afi-result"><span><HandCoins aria-hidden="true" className="afi-ico" />Illustrative net replacement capital</span><strong>{usd(net)}</strong></p>
            {gross != null && gross > 0 && net != null && credit != null && (
              <div className="afi-split" role="img" aria-label={`Of gross ${usd(gross)}: net ${usd(net)}, assumed trade-in ${usd(credit)}`}>
                <span className="afi-split-net" style={{ width: `${(net / gross) * 100}%` }} />
                <span className="afi-split-credit" style={{ width: `${(credit / gross) * 100}%` }} />
              </div>
            )}
            {gross != null && gross > 0 && <p className="afi-split-key"><span data-k="net">Net</span><span data-k="credit">Assumed trade-in</span></p>}
            <ScrollableTableRegion label="Replacement capital calculation"><table className="afi-table">
              <tbody>
                <tr><td>Reported monitor units (inventory)</td><td colSpan={3}>{isNum(units) ? units.toLocaleString() : 'Not reported'}</td></tr>
                <tr><td>Units included in this scenario</td><td colSpan={3}>{n != null ? n.toLocaleString() : 'Not reported'}</td></tr>
                <tr><td>Gross = units x per-unit price</td><td colSpan={3}>{usd(gross)}</td></tr>
                <tr><td>Less trade-in = included units x per-unit credit</td><td colSpan={3}>-{usd(credit)}</td></tr>
                <tr className="is-total"><td>Net capital</td><td colSpan={3}>{usd(net)}</td></tr>
              </tbody>
            </table></ScrollableTableRegion>
          </div>
        ) : (
          <div className="afi-body">
            <p className="afi-result"><span><Coins aria-hidden="true" className="afi-ico" />Illustrative annual claims recovery</span><strong>{usd(recovery)}</strong></p>
            <ScrollableTableRegion label="Claims recovery calculation"><table className="afi-table">
              <tbody>
                <tr><td>Recorded denied amount / yr</td><td colSpan={3}>{usd(recoveryPool)}</td></tr>
                <tr><td>x capture assumption</td><td colSpan={3}>{capturePct}%</td></tr>
                <tr className="is-total"><td>Recovery</td><td colSpan={3}>{usd(recovery)}</td></tr>
              </tbody>
            </table></ScrollableTableRegion>
            <p className="afi-note">Denied claims are not all recoverable. Scope and period: {cms.medicareDenialClaimScope || 'not recorded'} · {cms.medicareDenialReportingPeriod || 'not recorded'}.</p>
          </div>
        )}

        <fieldset className="afi-assumptions">
          <legend>Assumptions, editable</legend>
          {scenario === 'capital' && <>
            <Assumption id="assume-unit-price" label="Per-unit price" prefix="$" value={unitMsrp} min={0} max={200000} step={500} onChange={onUnitMsrp} />
            <Assumption id="assume-trade-in" label="Trade-in per unit" prefix="$" value={tradeInPerUnit} min={0} max={50000} step={250} onChange={onTradeIn} />
            {tradeInClamped && <p className="afi-flag" role="status"><AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />Trade-in exceeds per-unit price; capped at {usd(unitMsrp)} per unit.</p>}
          </>}
          {(scenario === 'capital' || scenario === 'operating') && hasUnits && (
            <Assumption id="assume-included-units" label={`Units included (of ${units})`} value={n ?? units} min={0} max={units} step={1} onChange={(v) => {const whole = Math.floor(v); onIncludedUnits(whole === units ? null : whole);}} />
          )}
          {hasUnits && <p className="afi-note">Whole devices only; fractional scenario-unit entries are rounded down. Reported inventory is never changed.</p>}
          {scenario === 'operating' && !benchmarkMatched && (
            <label className="afi-assumption" htmlFor="assume-benchmark">Comparison model (assumption)
              <select id="assume-benchmark" data-testid="select-benchmark-model" value={selectedBenchmarkId ?? ''} onChange={(e) => onSelectBenchmark(e.target.value || null)}>
                <option value="">None selected</option>
                {MONITOR_BENCHMARKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
          )}
          {scenario === 'recovery' && <Assumption id="assume-capture" label="Capture rate" suffix="%" value={capturePct} min={0} max={100} step={1} onChange={onCapturePct} />}
          {scenario === 'operating' && <p className="afi-note">Benchmark rates are fixed library values: service {usd(tcoModel?.matchedIntel.incumbentAnnualServicePerUnit)} vs {usd(tcoModel?.matchedIntel.zollAnnualServicePerUnit)} per unit-year; batteries {usd(tcoModel?.matchedIntel.incumbentBattery5YrCostPerUnit)} vs {usd(tcoModel?.matchedIntel.zollBattery5YrCostPerUnit)} per unit over 5 years; consumables {usd(tcoModel?.matchedIntel.incumbentConsumableAnnualPerUnit)} vs {usd(tcoModel?.matchedIntel.zollConsumableAnnualPerUnit)} per unit-year.</p>}
        </fieldset>
      </section>
    </div>
  );
};

export default FinancialIntelligence;
