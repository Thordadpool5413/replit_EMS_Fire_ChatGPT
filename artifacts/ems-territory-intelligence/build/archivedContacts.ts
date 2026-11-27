import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import type { DepartmentContact } from '../src/services/departmentBrief';

const evidenceRoot = new URL('../../../scripts/data/evidence/', import.meta.url);
async function archive<T>(folder: string, member: string): Promise<T> {
  const root = new URL(folder + '/2026-11-26/', evidenceRoot);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const bytes = await readFile(new URL('original.zip', root));
  const hash = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');
  if (hash(bytes) !== manifest.archiveSha256) throw Error('Contact source archive edition mismatch');
  const data = unzipSync(bytes, { filter: (entry) => entry.name === member })[member];
  if (!data || hash(data) !== manifest.members[member]?.sha256)
    throw Error('Contact report edition mismatch');
  return JSON.parse(strFromU8(data));
}
type FireReport = {
  baselineReconciliation: { primaryKey: string; outcome: string; nativeSourceRowNumbers: number[] }[];
  rows: { sourceRowNumber: number; native: Record<string, string> }[];
};
type NpiReport = {
  sourceDate: string;
  records: {
    key: string;
    npi: string;
    name: string;
    telephone: string;
    primaryAddress: { state: string };
    deactivationDate: string;
    reactivationDate: string;
    native: Record<string, string>;
  }[];
};
export async function archivedContacts() {
  const result = new Map<string, DepartmentContact>();
  const fire = await archive<FireReport>('usfa-native-national', 'source/native-usfa.json');
  const sourceRows = new Map(fire.rows.map((r) => [r.sourceRowNumber, r.native]));
  for (const link of fire.baselineReconciliation) {
    if (link.outcome !== 'exact-fdid-state-name-city-zip' || link.nativeSourceRowNumbers.length !== 1)
      continue;
    const row = sourceRows.get(link.nativeSourceRowNumbers[0]);
    if (!row || link.primaryKey !== 'FDID:' + row['HQ state'] + ':' + row.FDID)
      throw Error('USFA contact identity mismatch');
    result.set(link.primaryKey, {
      agency: row['Fire dept name'],
      state: row['HQ state'],
      label: 'USFA National Fire Department Registry',
      date: '2026-11-26',
      phone: row['HQ phone'] || undefined,
      fax: row['HQ fax'] || undefined,
      website: row.Website || undefined,
      organization: row['Organization Type'] || undefined,
      emergencyManagement: row['Primary agency for emergency mgmt'] || undefined,
      mailing:
        [
          row['Mail addr1'],
          row['Mail addr2'],
          row['Mail PO box'],
          row['Mail city'],
          row['Mail state'],
          row['Mail zip'],
        ]
          .filter(Boolean)
          .join(', ') || undefined,
    });
  }
  const cms = await archive<NpiReport>('primary-nppes-native', 'source/native-primary.json');
  for (const row of cms.records) {
    if (
      row.key !== 'NPI:' + row.npi ||
      row.native.NPI !== row.npi ||
      row.native['Entity Type Code'] !== '2'
    )
      throw Error('CMS contact identity mismatch');
    if (
      row.deactivationDate &&
      (!row.reactivationDate || Date.parse(row.deactivationDate) >= Date.parse(row.reactivationDate))
    )
      continue;
    const licenses = new Set<string>();
    for (let i = 1; i <= 15; i++) {
      if (!row.native['Healthcare Provider Taxonomy Code_' + i]?.startsWith('3416')) continue;
      const id = row.native['Provider License Number_' + i],
        state = row.native['Provider License Number State Code_' + i];
      if (id && !/^(?:n\/?a|none|unknown|<unavail>)$/i.test(id))
        licenses.add([id, state].filter(Boolean).join(' · '));
    }
    result.set(row.key, {
      agency: row.name,
      state: row.primaryAddress.state,
      label: 'CMS NPPES business practice record',
      date: cms.sourceDate,
      phone: row.telephone || undefined,
      licenses: licenses.size ? [...licenses] : undefined,
    });
  }
  return result;
}
