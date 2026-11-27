import { gunzipSync, strFromU8 } from 'fflate';
import type { BulkCandidate } from './bulkRegistryStore';

const base = () => (import.meta.env?.BASE_URL ?? '/') + 'registry/nppes/';
type Part = { file: string; state: string; count: number; sha256: string };
let index: Promise<{ chunks: Part[] }> | undefined;
const states = new Map<string, Promise<Map<string, BulkCandidate>>>();

async function requiredFile(name: string) {
  const res = await fetch(base() + name, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw Error('NPPES source records unavailable');
  return res;
}

export function loadNpiDetails(state: string) {
  let task = states.get(state);
  if (!task) {
    index ??= requiredFile('index.json')
      .then((r) => r.json())
      .catch((error) => {
        index = undefined;
        throw error;
      });
    task = index!
      .then(async (edition) => {
        const rows = new Map<string, BulkCandidate>();
        for (const part of edition.chunks.filter((row) => row.state === state)) {
          if (!/^part-\d{3}\.gz\.b64$/.test(part.file)) throw Error('Invalid NPPES source');
          const data = Uint8Array.from(atob(await (await requiredFile(part.file)).text()), (character) =>
            character.charCodeAt(0),
          );
          const bytes = gunzipSync(data);
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))]
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          if (digest !== part.sha256) throw Error('NPPES source edition mismatch');
          const lines = strFromU8(bytes).trim().split('\n');
          if (lines.length !== part.count) throw Error('NPPES source count mismatch');
          for (const line of lines) {
            const row: BulkCandidate = JSON.parse(line);
            if (row.kind !== 'candidate' || row.location.state !== state || rows.has(row.npi))
              throw Error('NPPES source identity mismatch');
            rows.set(row.npi, row);
          }
        }
        return rows;
      })
      .catch((error) => {
        states.delete(state);
        throw error;
      });
    states.set(state, task);
  }
  return task;
}

let headquarters: Promise<Record<string, string>> | undefined;
export function loadHeadquartersCounties() {
  return (headquarters ??= fetch(
    (import.meta.env?.BASE_URL ?? '/') + 'data/neris-headquarters-counties.json',
  )
    .then(async (r) => {
      if (!r.ok) throw Error('NERIS headquarters index unavailable');
      const data = await r.json();
      if (data.source !== 'NERIS' || !data.byDepartment) throw Error('Invalid headquarters index');
      return data.byDepartment as Record<string, string>;
    })
    .catch((error) => {
      headquarters = undefined;
      throw error;
    }));
}
