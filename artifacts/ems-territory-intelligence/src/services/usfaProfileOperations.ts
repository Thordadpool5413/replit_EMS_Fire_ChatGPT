import { gunzipSync, strFromU8 } from 'fflate';
import { loadSourceDirectoryManifest } from './nationalSourceDirectory';

type OperationsShard = { file: string; count: number; sha256: string; decodedSha256: string; directorySha256: string };
type OperationsIndex = { schemaVersion: 1; retrievedAt: string; states: Record<string, OperationsShard> };
type OperationCount = number | null;
type OperationsRow = [string | null, OperationCount, OperationCount, OperationCount, OperationCount, OperationCount, OperationCount];
type PackedOperations = Record<string, Record<string, OperationsRow>>;

export const usfaOperationsLabels = [
  'Fire stations',
  'Career firefighters',
  'Volunteer firefighters',
  'Paid-per-call firefighters',
  'Civilian support personnel',
  'Volunteer support personnel',
] as const;

const base = () => (import.meta.env?.BASE_URL ?? '/') + 'registry/usfa-operations/';
let indexPromise: Promise<OperationsIndex> | undefined;
const shards = new Map<string, Promise<PackedOperations>>();

async function readFile(path: string) {
  const response = await fetch(base() + path, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw Error('USFA operations edition unavailable');
  return response;
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = readFile('index.json').then(async (response) => {
      const data = await response.json() as OperationsIndex;
      if (data.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.retrievedAt) || !data.states) {
        throw Error('Invalid USFA operations edition');
      }
      return data;
    }).catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  }
  return indexPromise;
}

function loadShard(shard: OperationsShard) {
  const key = shard.file + ':' + shard.sha256 + ':' + shard.decodedSha256;
  const cached = shards.get(key);
  if (cached) return cached;
  const pending = readFile(shard.file).then(async (response) => {
    const bytes = await response.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const checksum = Array.from(new Uint8Array(hash), (part) => part.toString(16).padStart(2, '0')).join('');
    const payload = new Uint8Array(bytes);
    const compressed = payload[0] === 0x1f && payload[1] === 0x8b;
    // Browsers decode Content-Encoding: gzip before exposing the response body.
    if (checksum !== (compressed ? shard.sha256 : shard.decodedSha256)) throw Error('USFA operations integrity check failed');
    return JSON.parse(strFromU8(compressed ? gunzipSync(payload) : payload)) as PackedOperations;
  }).catch((error) => {
    shards.delete(key);
    throw error;
  });
  shards.set(key, pending);
  return pending;
}

export async function loadUsfaProfileOperations(state: string, registryKey: string) {
  if (!registryKey.startsWith('FDID:' + state + ':')) return null;
  const [edition, directory] = await Promise.all([loadIndex(), loadSourceDirectoryManifest()]);
  const descriptor = edition.states[state];
  if (!descriptor) return null;
  const currentShard = directory.chunks.find((chunk) => chunk.state === state);
  if (currentShard?.sha256 !== descriptor.directorySha256 || !/^operations-\d\.json\.gz$/.test(descriptor.file)) {
    throw Error('USFA operations edition does not match the state directory');
  }
  const stateRows = (await loadShard(descriptor))[state];
  if (!stateRows || Object.keys(stateRows).length !== descriptor.count) throw Error('USFA operations count mismatch');
  const row = stateRows['usfa:' + registryKey.slice(5)];
  if (!row) return null;
  const [departmentType, ...counts] = row;
  if (counts.length !== usfaOperationsLabels.length ||
      (departmentType !== null && typeof departmentType !== 'string') ||
      counts.some((part) => part !== null && (!Number.isSafeInteger(part) || part < 0))) {
    throw Error('Invalid USFA operations record');
  }
  return {
    departmentType,
    retrievedAt: edition.retrievedAt,
    metrics: usfaOperationsLabels.flatMap((label, index) => counts[index] === null ? [] : [{ label, value: counts[index] as number }]),
  };
}
