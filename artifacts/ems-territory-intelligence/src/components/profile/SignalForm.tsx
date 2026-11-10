import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import { calendarDate, safeSourceUrl, type RecordedSignal, type SignalKind } from './decisionSupport';
import { ResearchField, newId } from './ResearchField';

const KINDS: { value: SignalKind; label: string }[] = [
  { value: 'warranty', label: 'Warranty' }, { value: 'contract', label: 'Contract' },
  { value: 'replacement', label: 'Replacement plan' }, { value: 'procurement', label: 'Procurement notice' }, { value: 'grant', label: 'Grant' },
];
export const signalKindLabel = (k: SignalKind) => KINDS.find(x => x.value === k)?.label ?? k;

type Props = { initial?: RecordedSignal; disabled?: boolean; onSave: (s: RecordedSignal) => string | undefined; onCancel: () => void };
export const SignalForm: React.FC<Props> = ({ initial, disabled, onSave, onCancel }) => {
  const [s, setS] = useState<RecordedSignal>(initial ?? { id: newId('sig'), kind: 'procurement', title: '', date: '', sourceName: '', sourceUrl: '', detail: '' });
  const [error, setError] = useState<string>();
  const set = (k: keyof RecordedSignal) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.title.trim()) return setError('Add a title.');
    if (!s.sourceName.trim()) return setError('Add the source name.');
    if (!safeSourceUrl(s.sourceUrl.trim())) return setError('Add a full http(s) source link.');
    if (s.date && !calendarDate(s.date)) return setError('Use a valid date or leave it blank.');
    const out: RecordedSignal = { ...s, title: s.title.trim(), sourceName: s.sourceName.trim(), sourceUrl: s.sourceUrl.trim(), detail: s.detail.trim(), date: s.date || undefined };
    const err = onSave(out);
    setError(err);
  };
  const p = `sig-${s.id}`;
  return (
    <form className="pds-form" onSubmit={submit} data-testid="form-signal" noValidate>
      <div className="pds-form-grid">
        <ResearchField id={`${p}-kind`} label="Signal type"><select value={s.kind} onChange={set('kind')} data-testid="select-signal-kind">{KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></ResearchField>
        <ResearchField id={`${p}-date`} label="Date (optional)"><input type="date" value={s.date ?? ''} onChange={set('date')} data-testid="input-signal-date" /></ResearchField>
        <ResearchField id={`${p}-title`} label="Title"><input value={s.title} onChange={set('title')} maxLength={160} data-testid="input-signal-title" /></ResearchField>
        <ResearchField id={`${p}-src`} label="Source name"><input value={s.sourceName} onChange={set('sourceName')} maxLength={160} data-testid="input-signal-source-name" /></ResearchField>
        <ResearchField id={`${p}-url`} label="Source link" hint="Full https:// address of the document you read."><input type="url" inputMode="url" value={s.sourceUrl} onChange={set('sourceUrl')} data-testid="input-signal-source-url" /></ResearchField>
        <ResearchField id={`${p}-detail`} label="What the source says"><textarea rows={2} value={s.detail} onChange={set('detail')} maxLength={600} data-testid="input-signal-detail" /></ResearchField>
      </div>
      {error && <p className="pds-error" role="alert" data-testid="error-signal-form">{error}</p>}
      <div className="pds-actions">
        <button type="submit" className="pds-btn is-primary" disabled={disabled} data-testid="button-save-signal"><Save className="aib-icon" aria-hidden="true" />Save signal</button>
        <button type="button" className="pds-btn" onClick={onCancel} data-testid="button-cancel-signal"><X className="aib-icon" aria-hidden="true" />Cancel</button>
      </div>
    </form>
  );
};
