export function isPulseIqScoreWithinRange(
  score: number | null | undefined,
  minimum: number | null,
  maximum: number | null,
): boolean {
  if (minimum === null && maximum === null) return true;
  if (typeof score !== 'number' || !Number.isFinite(score)) return false;
  if (minimum !== null && score < minimum) return false;
  if (maximum !== null && score > maximum) return false;
  return true;
}
