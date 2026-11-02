import type { Agency, PredictiveWeights } from '../types';
import { calculateScore } from './pulseIqScoring';

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

/**
 * Use the active calibration for lead queue ordering instead of a persisted
 * score breakdown, which may have been calculated with older weights.
 */
export function rankAgenciesByPulseIqScore(
  agencies: readonly Agency[],
  weights?: PredictiveWeights
): Agency[] {
  return rankByPulseIqScore(agencies, (agency) => calculateScore(agency, weights));
}

/**
 * Apply the lead queue's high-priority threshold to the same active score used
 * for ordering.
 */
export function isHighPriorityPulseIqAgency(
  agency: Agency,
  weights?: PredictiveWeights
): boolean {
  return calculateScore(agency, weights) >= 80;
}

export interface PulseIqTerritoryRank {
  rank: number;
  total: number;
  tiedCount: number;
  topPercent: number;
}

/**
 * Return tie-aware ranks for every item in one territory comparison set.
 * Non-finite scores match rankByPulseIqScore's zero fallback.
 */
export function getPulseIqTerritoryRanks<T>(
  items: readonly T[],
  scoreOf: (item: T) => number
): Map<T, PulseIqTerritoryRank> {
  if (items.length === 0) return new Map();

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

  const ranks = new Map<T, PulseIqTerritoryRank>();
  let groupStart = 0;
  while (groupStart < ranked.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < ranked.length && ranked[groupEnd].score === ranked[groupStart].score) {
      groupEnd += 1;
    }

    const rank: PulseIqTerritoryRank = {
      rank: groupStart + 1,
      total: ranked.length,
      tiedCount: groupEnd - groupStart,
      topPercent: Math.round((groupEnd / ranked.length) * 10_000) / 100
    };
    for (let index = groupStart; index < groupEnd; index += 1) {
      ranks.set(ranked[index].item, rank);
    }
    groupStart = groupEnd;
  }

  return ranks;
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
