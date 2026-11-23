import React, { useState } from 'react';
import { AlertTriangle, ClipboardCheck, HeartPulse, Monitor, Pencil, Plus, Repeat, Trash2, Wind } from 'lucide-react';
import type { Agency, DocumentedTradeInOffer } from '../../types';
import { preparationGaps, quoteState, type DeviceCheck } from './decisionSupport';
import { NOT_REPORTED, TRADE_IN_CHECKLIST, buildEquipmentLines, getDocumentedOffers, offerKindLabel, offerTotal, offerValue } from './equipmentInsights';
import type { ProfileResearchState } from './useProfileResearch';
import { DeviceCheckForm } from './DeviceCheckForm';
import { QuoteForm } from './QuoteForm';

const DEVICES = [
  { key: 'monitor' as const, line: 'monitor', label: 'Monitor / defibrillator', icon: Monitor },
  { key: 'cpr' as const, line: 'cpr', label: 'Mechanical CPR', icon: HeartPulse },
  { key: 'vent' as const, line: 'vent', label: 'Transport ventilator', icon: Wind },
];
const ownershipLabel: Record<DeviceCheck['ownership'], string> = { unknown: 'Unknown', owned: 'Agency-owned', leased: 'Leased', restricted: 'Restricted' };

const QuoteCard: React.FC<{ o: DocumentedTradeInOffer; local: boolean; blocked: boolean; onEdit?: () => void; onRemove?: () => void }> = ({ o, local, blocked, onEdit, onRemove }) => {
  const state = quoteState(o);
  const expired = state.startsWith('Expired');
  const usable = state.startsWith('Within') || state.startsWith('Expires today');
  const total = offerTotal(o);
  return (
    <li className="pds-quote" data-testid={`offer-${o.id}`} data-kind={o.kind} data-state={expired ? 'expired' : usable ? 'dated' : 'check'}>
      <div className="pds-rec-head">
        <p className="pds-rec-t">{o.provider}</p>
        <span className="pds-chip">{local ? 'Your record' : 'Agency record'}</span>
      </div>
      <p className={`pds-quote-total${expired ? ' is-struck' : ''}`}>{total == null ? 'Total not calculated' : offerValue(total, o.currency)}<span>{offerKindLabel(o.kind)}</span></p>
      <p className={`pds-state${usable ? '' : ' is-warn'}`} data-testid={`status-quote-${o.id}`}>{!usable && <AlertTriangle className="aib-icon" aria-hidden="true" />}{state}</p>
      <dl className="pds-kv">
        <div><dt>Device</dt><dd>{o.eligibleDevice || NOT_REPORTED}</dd></div>
        <div><dt>Per unit</dt><dd>{offerValue(o.perUnitValue, o.currency)}</dd></div>
        <div><dt>Eligible qty</dt><dd>{o.eligibleQuantity ?? NOT_REPORTED}</dd></div>
        <div><dt>{expired ? 'Quoted total (expired)' : 'Quoted total'}</dt><dd className={expired ? 'is-struck' : ''}>{total == null ? 'Not calculated' : offerValue(total, o.currency)}</dd></div>
        <div><dt>Dates</dt><dd>{o.offerDate || 'Date not stated'} to {o.expiryDate || 'expiry not stated'}</dd></div>
        <div><dt>Conditions</dt><dd>{o.conditions ? <><AlertTriangle className="aib-icon pds-inline" aria-hidden="true" />{o.conditions}</> : 'Not stated; confirm with provider'}</dd></div>
        <div><dt>Source</dt><dd>{o.sourceUrl ? <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">{o.sourceName || 'Quote document'}</a> : o.sourceName || 'Not stated'}</dd></div>
      </dl>
      {local && (
        <div className="pds-item-actions">
          <button type="button" className="pds-btn" disabled={blocked} onClick={onEdit} data-testid={`button-edit-quote-${o.id}`}><Pencil className="aib-icon" aria-hidden="true" />Edit</button>
          <button type="button" className="pds-btn" disabled={blocked} onClick={onRemove} data-testid={`button-remove-quote-${o.id}`}><Trash2 className="aib-icon" aria-hidden="true" />Remove</button>
        </div>
      )}
    </li>
  );
};

export const BuybackDecisionSupport: React.FC<{ agency: Agency; research: ProfileResearchState }> = ({ agency, research }) => {
  const { data, commit, blocked } = research;
  const lines = buildEquipmentLines(agency);
  const agencyOffers = getDocumentedOffers(agency);
  const [editDevice, setEditDevice] = useState<string | null>(null);
  const [editQuote, setEditQuote] = useState<string | 'new' | null>(null);

  const saveDevice = (key: 'monitor' | 'cpr' | 'vent') => (c: DeviceCheck) => {
    const err = commit({ ...data, devices: { ...data.devices, [key]: c } });
    if (!err) setEditDevice(null);
    return err;
  };
  const saveQuote = (o: DocumentedTradeInOffer) => {
    const exists = data.offers.some(x => x.id === o.id);
    const err = commit({ ...data, offers: exists ? data.offers.map(x => x.id === o.id ? o : x) : [...data.offers, o] });
    if (!err) setEditQuote(null);
    return err;
  };
  const removeQuote = (id: string) => { if (window.confirm('Remove this quote record?')) commit({ ...data, offers: data.offers.filter(o => o.id !== id) }); };

  const all = [...agencyOffers.map(o => ({ o, local: false })), ...data.offers.map(o => ({ o, local: true }))];
  const groups = (['cash-buyback', 'vendor-credit'] as const).map(kind => {
    const items = all.filter(x => x.o.kind === kind);
    return { kind, items };
  });

  return (
    <section className="aib-block aib-buyback" data-testid="profile-buyback-insights" aria-labelledby="aib-buyback-title">
      <h3 id="aib-buyback-title" className="aib-label"><Repeat className="aib-icon" aria-hidden="true" />Buy-back decision support</h3>
      <p className="aib-scope">Checks record what is known. They do not make any device eligible; only the provider can.</p>

      <p className="aib-sub"><ClipboardCheck className="aib-icon" aria-hidden="true" />Device checks</p>
      <ul className="pds-list">
        {DEVICES.map(({ key, line, label, icon: Icon }) => {
          const check = data.devices[key];
          const gaps = preparationGaps(check);
          const recorded = lines.find(l => l.key === line)?.value ?? NOT_REPORTED;
          return (
            <li key={key} className="pds-device" data-testid={`device-check-${key}`} data-ready={gaps.length === 0 ? 'yes' : undefined}>
              <div className="pds-device-head">
                <Icon className="aib-icon" aria-hidden="true" />
                <div className="min-w-0"><p className="aib-eq-label">{label}</p><p className={`aib-eq-value${recorded === NOT_REPORTED ? ' is-missing' : ''}`}>{recorded}</p></div>
                {editDevice !== key && <button type="button" className="pds-btn" disabled={blocked} onClick={() => setEditDevice(key)} data-testid={`button-edit-device-${key}`}><ClipboardCheck className="aib-icon" aria-hidden="true" />{check ? 'Edit' : 'Record'}</button>}
              </div>
              {check && editDevice !== key && (
                <p className="aib-src-meta">Qty {check.eligibleQuantity ?? 'not set'} · {ownershipLabel[check.ownership]}{check.condition ? ` · ${check.condition}` : ''}{check.accessories ? ` · ${check.accessories}` : ''}</p>
              )}
              {gaps.length > 0
                ? <p className="pds-gaps" data-testid={`gaps-${key}`}><span>Still needed:</span> {gaps.join(', ')}</p>
                : <p className="pds-gaps is-done" data-testid={`gaps-${key}`}>Preparation facts recorded.</p>}
              {editDevice === key && <DeviceCheckForm device={key} initial={check} disabled={blocked} onSave={saveDevice(key)} onCancel={() => setEditDevice(null)} />}
            </li>
          );
        })}
      </ul>

      <div className="pds-sub-row">
        <p className="aib-sub"><Repeat className="aib-icon" aria-hidden="true" />Documented quotes</p>
        {editQuote !== 'new' && <button type="button" className="pds-btn" disabled={blocked} onClick={() => setEditQuote('new')} data-testid="button-add-quote"><Plus className="aib-icon" aria-hidden="true" />Add quote</button>}
      </div>
      {editQuote === 'new' && <QuoteForm disabled={blocked} onSave={saveQuote} onCancel={() => setEditQuote(null)} />}
      {all.length === 0 ? (
        <p className="aib-noquote" data-testid="text-no-current-quote">No current quote recorded</p>
      ) : (
        <div className="pds-compare">
          {groups.map(g => (
            <div key={g.kind} className="pds-col" data-testid={`quote-group-${g.kind}`}>
              <p className="pds-col-t">{offerKindLabel(g.kind)}</p>
              {g.items.length === 0 ? <p className="aib-scope">None recorded.</p> : (
                <ul className="pds-list">
                  {g.items.map(({ o, local }) => editQuote === o.id
                    ? <li key={o.id}><QuoteForm initial={o} disabled={blocked} onSave={saveQuote} onCancel={() => setEditQuote(null)} /></li>
                    : <QuoteCard key={o.id} o={o} local={local} blocked={blocked} onEdit={() => setEditQuote(o.id)} onRemove={() => removeQuote(o.id)} />)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="aib-scope">Compare each quote independently. Offers may cover the same devices and are never added together—even in the same currency. Credit only applies to a purchase from that vendor.</p>
      <details className="aib-sources">
        <summary><ClipboardCheck className="aib-icon" aria-hidden="true" /> Prepare for a quote · {TRADE_IN_CHECKLIST.length} checks</summary>
        <ul className="aib-check">{TRADE_IN_CHECKLIST.map(c => <li key={c}>{c}</li>)}</ul>
      </details>
      <details className="aib-sources">
        <summary>General knowledge: cash vs credit</summary>
        <ul className="aib-explain">
          <li><strong>Cash buy-back</strong> is a payment for released equipment. Confirm ownership, inspection, fees and the provider’s eligibility rules.</li>
          <li><strong>Vendor replacement credit</strong> reduces a qualifying purchase price. It is not cash and cannot also be counted as separate savings.</li>
          <li><strong>Illustrative scenarios</strong> in Purchasing are planning assumptions, not written or guaranteed offers.</li>
        </ul>
      </details>
      {research.saveError && <p className="pds-error" role="alert" data-testid="error-buyback-save">{research.saveError}</p>}
      {blocked && <p className="pds-error" role="alert">Saving is blocked until the unreadable saved record is recovered above.</p>}
      <p className="pds-local"><span>Your checks and quotes are saved only in this browser.</span></p>
    </section>
  );
};
export default BuybackDecisionSupport;
