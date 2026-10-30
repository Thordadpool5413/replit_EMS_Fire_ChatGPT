import { useEffect, useState } from 'react';
import {
  classifySourceFreshness,
  type SourceFreshnessStatus
} from '../data/sourceFreshness';

const statusText: Record<SourceFreshnessStatus, string> = {
  current: 'Recently checked',
  stale: 'Stale',
  unknown: 'Freshness unknown',
  error: 'Refresh failed'
};

const statusStyles: Record<SourceFreshnessStatus, string> = {
  current: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  stale: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  unknown: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
};

interface SourceFreshnessIndicatorProps {
  sourceName: string;
  checkedAt?: string | number | null;
  sourceUpdatedAt?: string | null;
  staleAfterMs: number;
  requestFailed?: boolean;
  sourceUpdateNote?: string;
  className?: string;
}

function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimestamp(value: string | number): string {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return String(value);
  return new Date(timestamp).toLocaleString();
}

export function SourceFreshnessIndicator({
  sourceName,
  checkedAt,
  sourceUpdatedAt,
  staleAfterMs,
  requestFailed = false,
  sourceUpdateNote,
  className = ''
}: SourceFreshnessIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const freshness = classifySourceFreshness(checkedAt, now, staleAfterMs, requestFailed);
  const lastSuccessfulResultIsStale =
    freshness.ageMs !== undefined && freshness.ageMs > staleAfterMs;
  const checkedText = freshness.checkedAtMs !== undefined
    ? `Last checked ${formatTimestamp(freshness.checkedAtMs)} (${formatAge(freshness.ageMs ?? 0)})`
    : 'Last-checked time is not recorded';

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-[11px] leading-snug ${statusStyles[freshness.status]} ${className}`}
      role="group"
      aria-label={`${sourceName}: ${statusText[freshness.status]}. ${checkedText}`}
    >
      <span className="font-semibold">{statusText[freshness.status]}</span>
      <span>{sourceName} · {checkedText}</span>
      {freshness.status === 'stale' && (
        <span>Refresh this source before relying on the cached result.</span>
      )}
      {freshness.status === 'error' && (
        <span>
          {lastSuccessfulResultIsStale
            ? 'The last successful result is stale.'
            : 'Showing the last successful result, if one is available.'}
        </span>
      )}
      {sourceUpdatedAt
        ? <span>Source record updated {formatTimestamp(sourceUpdatedAt)}.</span>
        : sourceUpdateNote && <span>{sourceUpdateNote}</span>}
    </div>
  );
}
