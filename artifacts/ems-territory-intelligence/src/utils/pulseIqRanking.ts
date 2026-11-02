/**
 * Return a descending score order without mutating the caller's collection.
 * Original order is retained for ties so claim-record updates cannot introduce
 * nondeterministic lead ordering.
 */
export function rankByPulseIqScore<T>(
  items: readonly T[],
  scoreOf: (item: T) => number
): T[] {
  return items
    .map((item, originalIndex) => {
      const rawScore = scoreOf(item);
      return {
        item,
        originalIndex,
        score: Number.isFinite(rawScore) ? rawScore : 0
      };
    })
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .map(({ item }) => item);
}

export interface PulseIqTerritoryRank {
  rank: number;
  total: number;
  tiedCount: number;
  topPercent: number;
}

/**
 * Return a competition rank and the share of the territory covered by that
 * score's tie group. Non-finite scores match rankByPulseIqScore's zero fallback.
 */
export function getPulseIqTerritoryRank<T>(
  items: readonly T[],
  scoreOf: (item: T) => number,
  isTarget: (item: T) => boolean
): PulseIqTerritoryRank | null {
  if (items.length === 0) return null;

  const ranked = items
    .map((item, originalIndex) => {
      const rawScore = scoreOf(item);
      return {
        item,
        originalIndex,
        score: Number.isFinite(rawScore) ? rawScore : 0
      };
    })
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  const targetIndex = ranked.findIndex(({ item }) => isTarget(item));
  if (targetIndex < 0) return null;

  const targetScore = ranked[targetIndex].score;
  const higherScores = ranked.filter(({ score }) => score > targetScore).length;
  const tiedCount = ranked.filter(({ score }) => score === targetScore).length;

  return {
    rank: higherScores + 1,
    total: ranked.length,
    tiedCount,
    topPercent: Math.round(((higherScores + tiedCount) / ranked.length) * 10_000) / 100
  };
}
