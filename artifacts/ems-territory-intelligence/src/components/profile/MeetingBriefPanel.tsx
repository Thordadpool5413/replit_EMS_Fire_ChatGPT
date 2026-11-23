import React, { useMemo, useState } from 'react';
import { Copy, Cpu, Download, ExternalLink, FileText, MessageSquareText, Radar } from 'lucide-react';
import type { Agency } from '../../types';
import { buildMeetingBrief, type ProfileResearch } from './decisionSupport';

/** Deterministic meeting brief: recorded equipment, sourced signals and exactly five discovery questions. */
export const MeetingBriefPanel: React.FC<{ agency: Agency; research: ProfileResearch }> = ({ agency, research }) => {
  const brief = useMemo(() => buildMeetingBrief(agency, research), [agency, research]);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([brief.text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${agency.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-meeting-brief.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ tone: 'ok', text: 'Text file downloaded.' });
    } catch { setStatus({ tone: 'error', text: 'Download failed in this browser.' }); }
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(brief.text);
      setStatus({ tone: 'ok', text: 'Brief copied.' });
    } catch { setStatus({ tone: 'error', text: 'Clipboard is unavailable here. Use Download text instead.' }); }
  };
  return (
    <section id="meeting-preparation-section" className="aib-block pds-meeting scroll-mt-32" data-testid="profile-meeting-brief" aria-labelledby="pds-meeting-title">
      <div className="pds-sub-row">
        <h3 id="pds-meeting-title" className="aib-label"><FileText className="aib-icon" aria-hidden="true" />Meeting brief</h3>
        <div className="pds-item-actions">
          <button type="button" className="pds-btn" onClick={copy} data-testid="button-copy-meeting-brief"><Copy className="aib-icon" aria-hidden="true" />Copy</button>
          <button type="button" className="pds-btn" onClick={download} data-testid="button-download-meeting-brief"><Download className="aib-icon" aria-hidden="true" />Download text</button>
        </div>
      </div>
      {status && <p className={status.tone === 'error' ? 'pds-error' : 'pds-ok'} role={status.tone === 'error' ? 'alert' : 'status'} data-testid="status-meeting-brief">{status.text}</p>}
      <p className="aib-scope">Generated from recorded fields and cited sources.</p>
      <div className="pds-meeting-grid">
        <div>
          <p className="aib-sub"><Cpu className="aib-icon" aria-hidden="true" />Recorded equipment</p>
          <ul className="pds-brief-list">{brief.equipment.map(e => <li key={e.key}><span>{e.label}</span><strong>{e.value}{e.quantity ? ` · ${e.quantity}` : ''}</strong></li>)}</ul>
          <p className="aib-sub"><Radar className="aib-icon" aria-hidden="true" />Sourced signals</p>
          {brief.recommendations.length === 0 ? <p className="aib-scope">No documented opportunity signals. Do not infer buying intent.</p> : (
            <ul className="pds-brief-list">{brief.recommendations.map(r => (
              <li key={r.id}><span>{r.confidence} · {r.timing || 'No date'}</span><strong>{r.title}</strong>
                {r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{r.sourceName || 'Source'}<ExternalLink className="pds-ext" aria-hidden="true" /></a> : r.sourceName ? <em>{r.sourceName}</em> : null}
              </li>))}</ul>
          )}
        </div>
        <div>
          <p className="aib-sub"><MessageSquareText className="aib-icon" aria-hidden="true" />Five discovery questions</p>
          <ol className="pds-questions" data-testid="list-discovery-questions">{brief.questions.map((q, i) => <li key={i} data-testid={`discovery-question-${i + 1}`}>{q}</li>)}</ol>
        </div>
      </div>
    </section>
  );
};
export default MeetingBriefPanel;
