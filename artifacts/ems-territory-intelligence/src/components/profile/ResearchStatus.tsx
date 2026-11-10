import React from 'react';
import { AlertTriangle, HardDrive } from 'lucide-react';
import type { ProfileResearchState } from './useProfileResearch';

/** Browser-local note plus load/save errors, with explicit recovery for unreadable saved data. */
export const ResearchStatus: React.FC<{ research: ProfileResearchState }> = ({ research }) => (
  <>
    <p className="pds-local" data-testid="text-research-local-note"><HardDrive className="aib-icon" aria-hidden="true" />Saved only in this browser on this device. Not sent, shared or synced.</p>
    {research.loadError && (
      <div className="pds-alert" role="alert" data-testid="error-research-load">
        <p><AlertTriangle className="aib-icon" aria-hidden="true" />{research.loadError} Saving is blocked.</p>
        <button type="button" className="pds-btn" data-testid="button-research-recover"
          onClick={() => { if (window.confirm('Discard the unreadable saved research for this agency and start empty?')) research.recover(); }}>
          Discard unreadable record and start fresh
        </button>
      </div>
    )}
    {research.saveError && !research.loadError && <p className="pds-error" role="alert" data-testid="error-research-save">{research.saveError}</p>}
  </>
);
