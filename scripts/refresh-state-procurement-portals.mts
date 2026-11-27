import { readFile, writeFile } from 'node:fs/promises';
import { FEDERAL_STATES } from '../artifacts/api-server/src/lib/federalDiscoveryContract';

const output = process.argv[2] ?? 'artifacts/ems-territory-intelligence/public/data/state-procurement-portals.json';
const endpoint = 'https://govsentry.ai/api/public/state-portals';
const raw = process.argv[3] ? await readFile(process.argv[3], 'utf8') : await (async () => {
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw Error('GovSentry HTTP ' + response.status);
  return response.text();
})();
if (raw.length > 500_000) throw Error('Portal directory exceeds size limit.');
const data = JSON.parse(raw);
if (data.license !== 'CC BY 4.0' || !Array.isArray(data.states) || data.states.length !== FEDERAL_STATES.length) {
  throw Error('Incomplete or unlicensed state portal directory.');
}
type Portal = { name: string; url: string };
const byState: Record<string, Portal[]> = {};
function cleanUrl(value: unknown) {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url.href;
  } catch {
    return undefined;
  }
}
for (const { code, officeUrl, portals } of data.states) {
  if (!FEDERAL_STATES.includes(code) || Object.hasOwn(byState, code) || !Array.isArray(portals)) throw Error('Invalid state portal scope.');
  const office = cleanUrl(officeUrl);
  const links: Portal[] = [];
  const seen = new Set<string>();
  for (const portal of [...portals, { name: 'State procurement office', url: office }]) {
    const url = cleanUrl(portal?.url);
    if (!url || seen.has(url) || typeof portal.name !== 'string' || !portal.name.trim() || portal.name.length > 120) continue;
    seen.add(url);
    links.push({ name: portal.name.trim(), url });
  }
  if (!links.length) throw Error('Missing safe state procurement URL.');
  byState[code] = links;
}
await writeFile(output, JSON.stringify({ schemaVersion: 1, source: 'GovSentry', license: 'CC BY 4.0', byState }) + '\n');
console.log(JSON.stringify({ states: Object.keys(byState).length, portals: Object.values(byState).reduce((sum, rows) => sum + rows.length, 0) }));
