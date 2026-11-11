/** Detail-on-demand container for dense legacy research inside a profile section. */
import React from 'react';
import { ChevronDown } from 'lucide-react';

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

export const ProfileDetail: React.FC<{
  title: string;
  summary?: string;
  icon: IconType;
  tone?: 'blue' | 'teal' | 'red' | 'navy';
  kind?: 'reported' | 'model' | 'reference';
  defaultOpen?: boolean;
  testId: string;
  children: React.ReactNode;
}> = ({ title, summary, icon: Icon, tone = 'blue', kind, defaultOpen, testId, children }) => (
  <details className="acp-detail" data-tone={tone} open={defaultOpen} data-testid={testId}>
    <summary data-testid={`${testId}-toggle`}>
      <span className="acp-detail-ico"><Icon aria-hidden="true" className="h-4 w-4" /></span>
      <span className="acp-detail-text">
        <span className="acp-detail-title">{title}</span>
        {summary && <span className="acp-detail-summary">{summary}</span>}
      </span>
      {kind && <span className="afi-kind" data-kind={kind === 'model' ? 'model' : kind === 'reference' ? 'reference' : 'reported'}>{kind === 'model' ? 'Modeled' : kind === 'reference' ? 'Reference' : 'Reported'}</span>}
      <ChevronDown aria-hidden="true" className="acp-detail-chev h-4 w-4" />
    </summary>
    <div className="acp-detail-body">{children}</div>
  </details>
);

export default ProfileDetail;
