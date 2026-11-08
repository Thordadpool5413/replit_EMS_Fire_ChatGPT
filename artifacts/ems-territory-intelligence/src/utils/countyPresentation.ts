/** Normalize display identity within one county, without merging different places. */
export const normalizePlaceName = (name: string): string =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

export function uniquePlaceNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = normalizePlaceName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((name) => name.trim().replace(/\s+/g, ' '));
}

/** Counts represent matched records with distinct native IDs, not distinct labels. */
export function uniqueAgencyRecords<T extends { id: string }>(records: readonly T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record.id?.trim() || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function formatCoordinates(
  latitude: number | undefined,
  longitude: number | undefined,
  decimals = 3,
): string {
  if (latitude == null || longitude == null
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return 'Not reported';
  const precision = Math.min(6, Math.max(0, Math.trunc(decimals)));
  return `${Math.abs(latitude).toFixed(precision)}°${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(precision)}°${longitude < 0 ? 'W' : 'E'}`;
}
