import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import type { NerisCatalogDepartment } from '../src/services/nerisStationCatalog';
import type { ArchivedStation } from '../src/services/stationHistory';
import { departmentProfile, profileSourceKey } from '../src/services/departmentIdentity';

type Site = {
  OBJECTID: number;
  NAME: string;
  TELEPHONE: string;
  PHONELOC: string;
  ADDRESS: string;
  CITY: string;
  STATE: string;
  ZIP: string;
  FDID: string;
  CONTDATE: number | null;
  NUMTRKS: number;
  NUMABUL: number;
  TOTAL_VEHI: number;
  FRST_MBRS: number;
  EMS_MBRS: number;
  TOTALPERS: number;
};
const root = new URL('../../../scripts/data/evidence/primary-hifld-fire/2026-11-26/', import.meta.url);
export async function historicSites() {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const bytes = await readFile(new URL('original.zip', root));
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.archiveSha256)
    throw Error('Station source archive mismatch');
  const shards = unzipSync(bytes, { filter: (entry) => /^source\/pages\/\d+\.json$/.test(entry.name) });
  const states = new Map<string, Site[]>();
  let count = 0;
  for (const data of Object.values(shards)) {
    const records = JSON.parse(strFromU8(data)).features as { attributes: Site }[];
    for (const { attributes: r } of records) {
      const list = states.get(r.STATE) ?? [];
      list.push(r);
      states.set(r.STATE, list);
      count++;
    }
  }
  if (count !== manifest.sourceCount) throw Error('Station source count mismatch');
  return states;
}
const words = (s: string | null | undefined) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const streetWords: Record<string, string> = {
  road: 'rd',
  avenue: 'ave',
  street: 'st',
  boulevard: 'blvd',
  drive: 'dr',
  highway: 'hwy',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
};
function siteKey(street: string | null, city: string | null, zip: string | null) {
  if (!street || !/^\d/.test(street) || !city || !zip) return;
  return [
    words(street)
      .split(' ')
      .map((w) => streetWords[w] || w)
      .join(' '),
    words(city),
    zip.slice(0, 5),
  ].join('/');
}
function operatorName(s: string) {
  return words(s)
    .replace(/^(city|town|village) of /, '')
    .replace(/\bdept\b/g, 'department')
    .replace(/\bvol\b/g, 'volunteer')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function namesAgree(site: string, department: string) {
  const name = operatorName(department),
    full = operatorName(site);
  return (
    /[a-z]/.test(name.replace(/\b(fire|department|rescue|district|volunteer|station|county)\b/g, '')) &&
    (full === name || full.startsWith(name + ' '))
  );
}

export function matchHistoricStations(
  state: string,
  sites: Site[],
  parents: NerisCatalogDepartment[],
  agencyNames: Map<string, string>,
) {
  const sourceSites = new Map<string, { key: string; id: string; parent: string }[]>();
  for (const parent of parents) {
    const key = profileSourceKey(departmentProfile({ state, source: 'neris', id: parent.id }));
    for (const station of parent.stations) {
      if (station.parentNameConflict || !station.physicalStreetFormat) continue;
      const k = siteKey(station.address[0], station.address[2], station.address[4]);
      if (!k) continue;
      const list = sourceSites.get(k) ?? [];
      list.push({ key, id: station.id, parent: parent.name });
      sourceSites.set(k, list);
    }
  }
  const results: Record<string, ArchivedStation[]> = {};
  for (const r of sites) {
    const k = siteKey(r.ADDRESS, r.CITY, r.ZIP);
    const matched = k ? sourceSites.get(k) : undefined;
    const site = matched?.length === 1 ? matched[0] : undefined;
    const claimed = r.FDID.trim() ? 'FDID:' + state + ':' + r.FDID.trim() : undefined;
    const own = claimed && agencyNames.get(claimed);
    const exact = !!own && namesAgree(r.NAME, own);
    const paired = !!site && namesAgree(r.NAME, site.parent) && (!claimed || claimed === site.key);
    if ((!exact && !paired) || (exact && site && site.key !== claimed)) continue;
    const key = exact ? claimed! : site!.key;
    if (!agencyNames.has(key)) continue;
    const digits = r.TELEPHONE.replace(/\D/g, '');
    const phone =
      r.PHONELOC === 'YES' && /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? r.TELEPHONE : undefined;
    const figures: Record<string, number> = {};
    for (const [label, value] of Object.entries({
      Trucks: r.NUMTRKS,
      Ambulances: r.NUMABUL,
      'Total vehicles': r.TOTAL_VEHI,
      'Fire personnel': r.FRST_MBRS,
      'EMS personnel': r.EMS_MBRS,
      'Total personnel': r.TOTALPERS,
    })) {
      if (Number.isSafeInteger(value) && value > 0) figures[label] = value;
    }
    if (!phone && !Object.keys(figures).length) continue;
    const date =
      r.CONTDATE && Number.isFinite(new Date(r.CONTDATE).getTime())
        ? new Date(r.CONTDATE).toISOString().slice(0, 10)
        : undefined;
    (results[key] ??= []).push({
      sourceId: r.OBJECTID,
      name: r.NAME,
      address: [r.ADDRESS, r.CITY, r.STATE, r.ZIP]
        .map((v) => v.trim())
        .filter(Boolean)
        .join(', '),
      phone,
      date,
      figures,
      stationId: paired ? site?.id : undefined,
    });
  }
  return results;
}
