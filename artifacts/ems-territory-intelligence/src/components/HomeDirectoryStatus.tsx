import React from 'react';
import type { DirectoryLoadStatus } from '../services/agencyDirectoryLoader';

export type HomeDirectoryNotice = {
  kind: 'loading' | 'unavailable' | 'empty' | 'filtered-empty';
  title: string;
  description: string;
  loaded?: number;
};

export function resolveHomeDirectoryNotice(
  status: DirectoryLoadStatus | undefined,
  visibleAgencyCount: number,
): HomeDirectoryNotice | null {
  if (!status) return null;

  if (status.status === 'loading') {
    return {
      kind: 'loading',
      title: 'Loading agency records',
      description: status.loaded > 0
        ? `${status.loaded.toLocaleString()} records are loaded so far. The directory is still loading; this is not a confirmed empty result.`
        : 'The directory is still loading. A temporary zero count is not a confirmed empty result.',
      loaded: status.loaded,
    };
  }

  if (status.status === 'unavailable') {
    return {
      kind: 'unavailable',
      title: 'Agency directory is unavailable',
      description: status.loaded > 0
        ? `The latest request failed. ${status.loaded.toLocaleString()} previously loaded records remain available; this is not a zero-agency result.`
        : 'The latest request failed, so the number of available agencies could not be confirmed.',
      loaded: status.loaded,
    };
  }

  if (status.status === 'ready' && visibleAgencyCount === 0) {
    return status.loaded > 0
      ? {
          kind: 'filtered-empty',
          title: 'No agencies match the current view',
          description: `${status.loaded.toLocaleString()} agency records loaded overall. Try a broader provider scope or open the directory.`,
          loaded: status.loaded,
        }
      : {
          kind: 'empty',
          title: 'No agency records are available yet',
          description: 'The directory finished loading and returned zero records. Map boundaries and county data are separate.',
          loaded: 0,
        };
  }

  return null;
}

interface HomeDirectoryStatusProps {
  status?: DirectoryLoadStatus;
  visibleAgencyCount: number;
  onRetry?: () => void;
  onBrowseDirectory: () => void;
}

export function HomeDirectoryStatus({
  status,
  visibleAgencyCount,
  onRetry,
  onBrowseDirectory,
}: HomeDirectoryStatusProps) {
  const notice = resolveHomeDirectoryNotice(status, visibleAgencyCount);
  if (!notice) return null;

  return (
    <div
      className="home-map-data-status"
      data-testid={`home-directory-status-${notice.kind}`}
      role={notice.kind === 'unavailable' ? 'alert' : 'status'}
      aria-live={notice.kind === 'unavailable' ? 'assertive' : 'polite'}
      aria-busy={notice.kind === 'loading' ? 'true' : undefined}
    >
      <strong>{notice.title}</strong>
      <span>{notice.description}</span>
      {notice.kind === 'unavailable' && onRetry && (
        <button type="button" className="workspace-button min-h-11" onClick={onRetry}>
          Retry directory
        </button>
      )}
      {notice.kind !== 'loading' && (
        <button type="button" className="workspace-text-button min-h-11" onClick={onBrowseDirectory}>
          Open agency directory
        </button>
      )}
    </div>
  );
}
