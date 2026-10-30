export type SourceFreshnessStatus = 'current' | 'stale' | 'unknown' | 'error';

export interface SourceFreshnessResult {
  status: SourceFreshnessStatus;
  checkedAtMs?: number;
  ageMs?: number;
}

export function classifySourceFreshness(
  checkedAt: string | number | null | undefined,
  nowMs: number,
  staleAfterMs: number,
  requestFailed = false
): SourceFreshnessResult {
  const checkedAtMs = typeof checkedAt === 'number'
    ? checkedAt
    : typeof checkedAt === 'string' && checkedAt.trim()
      ? Date.parse(checkedAt)
      : Number.NaN;

  if (!Number.isFinite(checkedAtMs) || checkedAtMs > nowMs + 5 * 60 * 1000) {
    return {
      status: requestFailed ? 'error' : 'unknown'
    };
  }

  const ageMs = Math.max(0, nowMs - checkedAtMs);
  if (requestFailed) return { status: 'error', checkedAtMs, ageMs };

  return {
    status: ageMs > staleAfterMs ? 'stale' : 'current',
    checkedAtMs,
    ageMs
  };
}
