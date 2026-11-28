import type { ProviderProfileRef } from '../navigation/providerProfileUrl';

export type DirectoryProvider = {
  ref: ProviderProfileRef;
  name: string;
  city: string;
  zip: string;
  county: string;
  countyBasis?: 'Census 2020 ZIP area';
  kind: 'ems' | 'fire' | 'combined';
  address?: string;
  point?: [number, number];
  pointBasis?: string;
  pointAddress?: string;
  aliases?: string[];
  otherPlaces?: { county: string; city: string; basis: string }[];
};

const pending = new Map<string, Promise<DirectoryProvider[]>>();

export function loadProviderCatalog(state: string) {
  if (!/^[A-Z]{2}$/.test(state)) return Promise.reject(new Error('Invalid state'));
  let task = pending.get(state);
  if (!task) {
    task = fetch((import.meta.env?.BASE_URL ?? '/') + 'data/providers/' + state + '.json', {
      signal: AbortSignal.timeout(30000),
    })
      .then(async (response) => {
        if (!response.ok) throw Error('Department directory unavailable for ' + state);
        const rows = (await response.json()) as DirectoryProvider[];
        if (!Array.isArray(rows) || rows.some((row) => row.ref?.state !== state || !row.name))
          throw Error('Invalid department directory');
        return rows;
      })
      .catch((error) => {
        pending.delete(state);
        throw error;
      });
    pending.set(state, task);
  }
  return task;
}

export function filterProviders(
  rows: DirectoryProvider[],
  scope: {
    category: 'all' | 'ems' | 'fire';
    countyFips?: string;
    city?: string;
    zip?: string;
    query?: string;
    unassignedOnly?: boolean;
  },
) {
  const words = (scope.query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const city = scope.city?.trim().toLowerCase();
  return rows.filter((row) => {
    if (scope.unassignedOnly && (row.county || row.otherPlaces?.length)) return false;
    const places = [{ county: row.county, city: row.city }, ...(row.otherPlaces ?? [])];
    if (
      (scope.countyFips || city) &&
      !places.some(
        (p) =>
          (!scope.countyFips || p.county === scope.countyFips) && (!city || p.city.toLowerCase() === city),
      )
    )
      return false;
    if (scope.zip && !row.zip.startsWith(scope.zip)) return false;
    if (scope.category !== 'all' && row.kind !== 'combined' && row.kind !== scope.category) return false;
    const searchable = [
      row.name,
      row.ref.id,
      row.city,
      row.zip,
      row.address,
      ...(row.aliases ?? []),
      ...places.map((p) => p.city),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => searchable.includes(word));
  });
}
