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
