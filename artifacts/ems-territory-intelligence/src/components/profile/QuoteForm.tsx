import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { DocumentedTradeInOffer } from '../../types';
import { calendarDate, safeSourceUrl } from './decisionSupport';
import { ResearchField, newId } from './ResearchField';

type Draft = { kind: DocumentedTradeInOffer['kind']; provider: string; eligibleDevice: string; perUnitValue: string; currency: string; eligibleQuantity: string; offerDate: string; expiryDate: string; conditions: string; sourceName: string; sourceUrl: string };
const toDraft = (o?: DocumentedTradeInOffer): Draft => ({
  kind: o?.kind ?? 'cash-buyback', provider: o?.provider ?? '', eligibleDevice: o?.eligibleDevice ?? '',
  perUnitValue: o?.perUnitValue != null ? String(o.perUnitValue) : '', currency: o?.currency ?? '',
  eligibleQuantity: o?.eligibleQuantity != null ? String(o.eligibleQuantity) : '', offerDate: o?.offerDate ?? '', expiryDate: o?.expiryDate ?? '',
  conditions: o?.conditions ?? '', sourceName: o?.sourceName ?? '', sourceUrl: o?.sourceUrl ?? '',
});

type Props = { initial?: DocumentedTradeInOffer; disabled?: boolean; onSave: (o: DocumentedTradeInOffer) => string | undefined; onCancel: () => void };
export const QuoteForm: React.FC<Props> = ({ initial, disabled, onSave, onCancel }) => {
  const [id] = useState(() => initial?.id ?? newId('quote'));
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [error, setError] = useState<string>();
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: k === 'currency' ? e.target.value.toUpperCase() : e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const unit = d.perUnitValue.trim() === '' ? null : Number(d.perUnitValue);
    const qty = d.eligibleQuantity.trim() === '' ? null : Number(d.eligibleQuantity);
    if (!d.provider.trim() || !d.eligibleDevice.trim()) return setError('Provider and device are required.');
    if (unit != null && (!Number.isFinite(unit) || unit < 0)) return setError('Amount per unit must be zero or more.');
    if (unit != null && !/^[A-Z]{3}$/.test(d.currency.trim())) return setError('Add a three-letter currency code (for example USD) for the quoted amount.');
    if (d.currency && !/^[A-Z]{3}$/.test(d.currency.trim())) return setError('Currency must be a three-letter code.');
    if (qty != null && (!Number.isSafeInteger(qty) || qty < 0)) return setError('Eligible quantity must be a whole number.');
    if (d.offerDate && !calendarDate(d.offerDate) || d.expiryDate && !calendarDate(d.expiryDate)) return setError('Check the quote dates.');
    if (d.offerDate && d.expiryDate && d.expiryDate < d.offerDate) return setError('Expiry cannot be before the quote date.');
    if (!d.sourceName.trim() || !safeSourceUrl(d.sourceUrl.trim())) return setError('A documented quote needs a source name and full http(s) link.');
    const offer: DocumentedTradeInOffer = {
      id, kind: d.kind, provider: d.provider.trim(), eligibleDevice: d.eligibleDevice.trim(), perUnitValue: unit, eligibleQuantity: qty,
      currency: d.currency.trim() || undefined, offerDate: d.offerDate || undefined, expiryDate: d.expiryDate || undefined,
      conditions: d.conditions.trim() || undefined, sourceName: d.sourceName.trim(), sourceUrl: d.sourceUrl.trim(),
    };
    setError(onSave(offer));
  };
  const p = `q-${id}`;
  return (
    <form className="pds-form" onSubmit={submit} data-testid="form-quote" noValidate>
      <div className="pds-form-grid">
        <ResearchField id={`${p}-kind`} label="Quote type"><select value={d.kind} onChange={set('kind')} data-testid="select-quote-kind"><option value="cash-buyback">Cash buy-back</option><option value="vendor-credit">Vendor replacement credit</option></select></ResearchField>
        <ResearchField id={`${p}-prov`} label="Provider"><input value={d.provider} onChange={set('provider')} data-testid="input-quote-provider" /></ResearchField>
        <ResearchField id={`${p}-dev`} label="Device covered"><input value={d.eligibleDevice} onChange={set('eligibleDevice')} data-testid="input-quote-device" /></ResearchField>
        <ResearchField id={`${p}-amt`} label="Amount per unit"><input type="number" inputMode="decimal" min={0} step="0.01" value={d.perUnitValue} onChange={set('perUnitValue')} data-testid="input-quote-amount" /></ResearchField>
        <ResearchField id={`${p}-cur`} label="Currency" hint="Three letters, e.g. USD."><input value={d.currency} onChange={set('currency')} maxLength={3} autoCapitalize="characters" data-testid="input-quote-currency" /></ResearchField>
        <ResearchField id={`${p}-qty`} label="Eligible quantity"><input type="number" inputMode="numeric" min={0} step={1} value={d.eligibleQuantity} onChange={set('eligibleQuantity')} data-testid="input-quote-quantity" /></ResearchField>
        <ResearchField id={`${p}-od`} label="Quote date"><input type="date" value={d.offerDate} onChange={set('offerDate')} data-testid="input-quote-date" /></ResearchField>
        <ResearchField id={`${p}-ed`} label="Expiry date"><input type="date" value={d.expiryDate} onChange={set('expiryDate')} data-testid="input-quote-expiry" /></ResearchField>
        <ResearchField id={`${p}-cond`} label="Conditions"><textarea rows={2} value={d.conditions} onChange={set('conditions')} data-testid="input-quote-conditions" /></ResearchField>
        <ResearchField id={`${p}-sn`} label="Source name"><input value={d.sourceName} onChange={set('sourceName')} data-testid="input-quote-source-name" /></ResearchField>
        <ResearchField id={`${p}-su`} label="Source link"><input type="url" inputMode="url" value={d.sourceUrl} onChange={set('sourceUrl')} data-testid="input-quote-source-url" /></ResearchField>
      </div>
      {error && <p className="pds-error" role="alert" data-testid="error-quote-form">{error}</p>}
      <div className="pds-actions">
        <button type="submit" className="pds-btn is-primary" disabled={disabled} data-testid="button-save-quote"><Save className="aib-icon" aria-hidden="true" />Save quote</button>
        <button type="button" className="pds-btn" onClick={onCancel} data-testid="button-cancel-quote"><X className="aib-icon" aria-hidden="true" />Cancel</button>
      </div>
    </form>
  );
};
