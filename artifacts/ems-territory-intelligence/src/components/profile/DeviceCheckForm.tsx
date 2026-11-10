import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { DeviceCheck } from './decisionSupport';
import { ResearchField } from './ResearchField';

type Props = { device: string; initial?: DeviceCheck; disabled?: boolean; onSave: (c: DeviceCheck) => string | undefined; onCancel: () => void };
export const DeviceCheckForm: React.FC<Props> = ({ device, initial, disabled, onSave, onCancel }) => {
  const [qty, setQty] = useState(initial?.eligibleQuantity != null ? String(initial.eligibleQuantity) : '');
  const [ownership, setOwnership] = useState<DeviceCheck['ownership']>(initial?.ownership ?? 'unknown');
  const [condition, setCondition] = useState(initial?.condition ?? '');
  const [accessories, setAccessories] = useState(initial?.accessories ?? '');
  const [error, setError] = useState<string>();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = qty.trim() === '' ? null : Number(qty);
    if (n != null && (!Number.isSafeInteger(n) || n < 0)) return setError('Quantity must be a whole number or blank.');
    setError(onSave({ eligibleQuantity: n, ownership, condition: condition.trim(), accessories: accessories.trim() }));
  };
  const p = `dc-${device}`;
  return (
    <form className="pds-form" onSubmit={submit} data-testid={`form-device-check-${device}`} noValidate>
      <div className="pds-form-grid">
        <ResearchField id={`${p}-qty`} label="Quantity to release"><input type="number" inputMode="numeric" min={0} step={1} value={qty} onChange={e => setQty(e.target.value)} data-testid={`input-device-qty-${device}`} /></ResearchField>
        <ResearchField id={`${p}-own`} label="Ownership"><select value={ownership} onChange={e => setOwnership(e.target.value as DeviceCheck['ownership'])} data-testid={`select-device-ownership-${device}`}><option value="unknown">Unknown</option><option value="owned">Agency-owned</option><option value="leased">Leased</option><option value="restricted">Grant / disposal restricted</option></select></ResearchField>
        <ResearchField id={`${p}-cond`} label="Condition / service history"><input value={condition} onChange={e => setCondition(e.target.value)} data-testid={`input-device-condition-${device}`} /></ResearchField>
        <ResearchField id={`${p}-acc`} label="Accessories"><input value={accessories} onChange={e => setAccessories(e.target.value)} data-testid={`input-device-accessories-${device}`} /></ResearchField>
      </div>
      {error && <p className="pds-error" role="alert">{error}</p>}
      <div className="pds-actions">
        <button type="submit" className="pds-btn is-primary" disabled={disabled} data-testid={`button-save-device-${device}`}><Save className="aib-icon" aria-hidden="true" />Save check</button>
        <button type="button" className="pds-btn" onClick={onCancel}><X className="aib-icon" aria-hidden="true" />Cancel</button>
      </div>
    </form>
  );
};
