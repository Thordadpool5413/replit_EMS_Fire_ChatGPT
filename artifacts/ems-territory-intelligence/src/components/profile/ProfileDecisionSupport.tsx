import React, { useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, FileSearch, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import type { Agency } from '../../types';
import { buildRecommendations, safeSourceUrl } from './decisionSupport';
import type { ProfileResearchState } from './useProfileResearch';
import { SignalForm, signalKindLabel } from './SignalForm';
import { ResearchStatus } from './ResearchStatus';

/** "Why this agency deserves attention": explainable recommendations + user-cited signals. */
export const ProfileDecisionSupport: React.FC<{ agency: Agency; research: ProfileResearchState }> = ({ agency, research }) => {
  const { data, commit, blocked } = research;
  const recs = useMemo(() => buildRecommendations(agency, data), [agency, data]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const save = (s: Parameters<typeof SignalForm>[0]['initial'] & object) => {
    const exists = data.signals.some(x => x.id === s.id);
    const err = commit({ ...data, signals: exists ? data.signals.map(x => x.id === s.id ? s : x) : [...data.signals, s] });
    if (!err) setEditing(null);
    return err;
  };
  const remove = (id: string) => { if (window.confirm('Remove this cited signal?')) commit({ ...data, signals: data.signals.filter(s => s.id !== id) }); };

  return (
    <section className="aib-block pds" data-testid="profile-decision-support" aria-labelledby="pds-title">
      <h3 id="pds-title" className="aib-label"><Target className="aib-icon" aria-hidden="true" />Why this agency deserves attention</h3>
      <p className="aib-scope">Each item shows its evidence, confidence and source. None of these prove buying intent.</p>
      {recs.length === 0 ? (
        <div className="pds-empty" data-testid="empty-recommendations">
          <FileSearch className="aib-icon" aria-hidden="true" />
          <div><p className="pds-empty-t">No sourced opportunity signals yet</p><p className="aib-scope">Add a cited warranty, contract, replacement, procurement or grant source below. Do not infer intent from inventory alone.</p></div>
        </div>
      ) : (
        <ol className="pds-recs">
          {recs.map(r => (
            <li key={r.id} className="pds-rec" data-testid={`recommendation-${r.id}`}>
              <div className="pds-rec-head">
                <p className="pds-rec-t">{r.title}</p>
                <span className={`pds-chip is-${r.confidence.toLowerCase()}`} data-testid={`confidence-${r.id}`}>{r.confidence} confidence</span>
              </div>
              <dl className="pds-kv">
                <div><dt>Evidence</dt><dd>{r.evidence}</dd></div>
                <div><dt>Why</dt><dd>{r.rationale}</dd></div>
                {r.timing && <div><dt><CalendarClock className="aib-icon" aria-hidden="true" />Timing</dt><dd>{r.timing}</dd></div>}
                {(r.sourceUrl || r.sourceName) && <div><dt>Source</dt><dd>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{r.sourceName || 'Source'}<ExternalLink className="pds-ext" aria-hidden="true" /></a> : r.sourceName}</dd></div>}
                <div className="is-next"><dt>Next action</dt><dd>{r.nextAction}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
      )}

      <div className="pds-sub-row">
        <p className="aib-sub">Your cited signals · {data.signals.length}</p>
        {editing !== 'new' && <button type="button" className="pds-btn" disabled={blocked} onClick={() => setEditing('new')} data-testid="button-add-signal"><Plus className="aib-icon" aria-hidden="true" />Add signal</button>}
      </div>
      <ResearchStatus research={research} />
      {editing === 'new' && <SignalForm disabled={blocked} onSave={save} onCancel={() => setEditing(null)} />}
      {data.signals.length > 0 && (
        <ul className="pds-list">
          {data.signals.map(s => editing === s.id ? (
            <li key={s.id}><SignalForm initial={s} disabled={blocked} onSave={save} onCancel={() => setEditing(null)} /></li>
          ) : (
            <li key={s.id} className="pds-item" data-testid={`signal-${s.id}`}>
              <div className="min-w-0">
                <p className="aib-eq-label">{signalKindLabel(s.kind)}{s.date ? ` · ${s.date}` : ''}</p>
                <p className="aib-eq-value">{s.title}</p>
                <p className="aib-src-meta">{safeSourceUrl(s.sourceUrl) ? <a href={safeSourceUrl(s.sourceUrl)} target="_blank" rel="noopener noreferrer">{s.sourceName}</a> : s.sourceName}</p>
              </div>
              <div className="pds-item-actions">
                <button type="button" className="pds-icon-btn" aria-label={`Edit ${s.title}`} disabled={blocked} onClick={() => setEditing(s.id)} data-testid={`button-edit-signal-${s.id}`}><Pencil className="aib-icon" aria-hidden="true" /></button>
                <button type="button" className="pds-icon-btn" aria-label={`Remove ${s.title}`} disabled={blocked} onClick={() => remove(s.id)} data-testid={`button-remove-signal-${s.id}`}><Trash2 className="aib-icon" aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
export default ProfileDecisionSupport;
