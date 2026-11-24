import type { Agency } from '../types';
import type { SourceDirectoryRecord } from './nationalSourceDirectory';

export function registryIdentifierText(row: SourceDirectoryRecord): string {
  if (row[1] === 'USFA') {
    const fdid = row[0].split(':').slice(2).join(':');
    return !fdid || /^location-/i.test(fdid) ? 'FDID not reported' : 'FDID ' + fdid + ' (' + row[3] + ')';
  }
  return 'NPI ' + row[0].slice('nppes:'.length);
}

/** Match explicit confirmed associations only. Ambiguous matches never merge or open an incorrect account. */
export function findLinkedRegistryAgency(row: SourceDirectoryRecord, agencies: Agency[]): Agency | undefined {
  const id = row[1] === 'USFA' ? row[0].split(':').slice(2).join(':') : row[0].slice('nppes:'.length);
  if (!id || (row[1] === 'USFA' && /^location-/i.test(id))) return undefined;
  const matched = agencies.filter(a => a.stateCode?.toUpperCase() === row[3] && (a.sourceRecordAssociations ?? []).some(s => {
    if (s.decision !== 'confirmed') return false;
    if (row[1] === 'NPPES') return /NPPES|NPI/i.test(s.sourceName) && s.sourceRecordId === id;
    if (!/USFA|NFDR/i.test(s.sourceName)) return false;
    return s.sourceRecordId === row[0] || s.sourceRecordId === id || s.sourceRecordId === row[3] + ':' + id || s.sourceRecordId === row[3] + '-' + id || s.sourceFields?.fdid === id;
  }));
  return matched.length === 1 ? matched[0] : undefined;
}
