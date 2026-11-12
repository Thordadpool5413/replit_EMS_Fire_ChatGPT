import React from 'react';
import { ArrowRight, ExternalLink, SearchCheck, ShieldCheck, Target } from 'lucide-react';
import type { Agency } from '../../types';
import type { CommandSection } from './ProfileCommandOverview';
import { buildRecommendations } from './decisionSupport';
import { useProfileResearch } from './useProfileResearch';

/** A read-only opening brief. Editing and the complete findings remain in Meeting prep. */
export const ProfileAttentionSummary: React.FC<{
  agency: Agency;
  onNavigate: (section: CommandSection) => void;
}> = ({ agency, onNavigate }) => {
  const research = useProfileResearch(agency.id);
  const recommendations = buildRecommendations(agency, research.data);
  // Sourced records precede inventory-only discovery prompts. Neither establishes intent.
  const ordered = [...recommendations].sort((a, b) =>
    Number(b.id !== 'record-age') - Number(a.id !== 'record-age'));
  const highlights = ordered.slice(0, 3);
  return (
    <section className="profile-attention" data-testid="profile-attention-summary" aria-labelledby="profile-attention-title">
      <header className="profile-attention-head">
        <div>
          <h2 id="profile-attention-title"><Target aria-hidden="true" />Why focus on this provider?</h2>
          <p>Recorded reasons to investigate—not a claim of buying intent.</p>
        </div>
        <button type="button" className="acp-link" onClick={() => onNavigate('meeting')} data-testid="button-overview-findings">
          All findings<ArrowRight aria-hidden="true" />
        </button>
      </header>
      {research.loadError && <p role="status" className="profile-attention-notice">{research.loadError}</p>}
      {highlights.length ? (
        <ol className="profile-attention-list">
          {highlights.map(item => (
            <li key={item.id} data-confidence={item.confidence.toLowerCase()}>
              <div className="profile-attention-label">
                {item.id === 'record-age' ? <SearchCheck aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                <h3>{item.title}</h3>
                <span>{item.confidence} confidence</span>
              </div>
              <p className="profile-attention-evidence">{item.evidence}</p>
              <p>{item.rationale}</p>
              {item.timing && <p className="profile-attention-timing">{item.timing}</p>}
              {(item.sourceUrl || item.sourceName) && <p className="profile-attention-source">Source: {item.sourceUrl
                ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName || 'Recorded source'}<ExternalLink aria-hidden="true" /></a>
                : item.sourceName}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="profile-attention-empty">
          <SearchCheck aria-hidden="true" />
          <div><h3>No documented opportunity signal yet</h3><p>Start with the recorded equipment and operating scale above. Confirm current systems, purchasing authority and plans before assigning priority.</p></div>
        </div>
      )}
      <footer>
        <button type="button" className="acp-link" onClick={() => onNavigate('equipment')}>Inspect equipment<ArrowRight aria-hidden="true" /></button>
        <button type="button" className="acp-link" onClick={() => onNavigate('deal_story')}>Deal story & discovery<ArrowRight aria-hidden="true" /></button>
      </footer>
    </section>
  );
};
