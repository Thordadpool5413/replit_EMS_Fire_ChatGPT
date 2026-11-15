import type { Agency } from '../types';

const aliases: Record<string, string> = {
  ems: 'emergency medical services',
  fd: 'fire department',
  dept: 'department',
  vfd: 'volunteer fire department',
  vol: 'volunteer',
  st: 'saint',
};

export function normalizeAgencySearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => aliases[word] ?? word)
    .join(' ');
}

export function agencySearchScore(agency: Agency, query: string): number {
  const normalizedQuery = normalizeAgencySearch(query);
  if (!normalizedQuery) return 1;

  const names = [agency.name, ...(agency.alternateNames ?? [])].map(normalizeAgencySearch);
  if (names.includes(normalizedQuery)) return 100;

  const searchableFields = [
    agency.name,
    ...(agency.alternateNames ?? []),
    agency.agencyType,
    agency.providerCategory,
    agency.city,
    agency.county,
    agency.state,
    agency.stateCode,
    agency.zipCode,
    agency.fdid,
    agency.npiNumber,
    ...(agency.keyContacts ?? []).map((contact) => contact.name),
  ];
  const words = normalizeAgencySearch(searchableFields.filter(Boolean).join(' ')).split(' ');
  const queryWords = normalizedQuery.split(' ');

  // Very short terms (for example FL or a two-letter initial) must be whole-word
  // matches. Longer terms may match at the beginning of a word.
  if (!queryWords.every((token) => words.some((word) =>
    token.length < 3 ? word === token : word.startsWith(token),
  ))) {
    return 0;
  }

  const nameWords = names.flatMap((name) => name.split(' '));
  const nameMatch = queryWords.every((token) => nameWords.some((word) =>
    token.length < 3 ? word === token : word.startsWith(token),
  ));
  return nameMatch ? 80 : 50;
}
