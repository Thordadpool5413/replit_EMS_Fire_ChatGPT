import test from 'node:test';
import assert from 'node:assert/strict';
import type { Agency } from '../types';
import { createAgencyDirectoryLoader, mergeDirectoryAgency } from './agencyDirectoryLoader';
const record = (id: string, revision = 1) => ({ id, _revision: revision, isCloudPersisted: true }) as Agency;

test('fresh national session loads every page, shares in-flight reads and replays on remount', async () => {
  const calls: (string | undefined)[] = [];
  const loader = createAgencyDirectoryLoader(async cursor => {
    calls.push(cursor);
    return cursor ? { agencies: [record('TX') ] } : { agencies: [record('FL')], cursor: 'FL' };
  });
  const received = new Map<string, Agency>();
  const statuses: string[] = [];
  const stop = loader.subscribe((page, status) => { page.forEach(a => received.set(a.id,a)); statuses.push(status.status); });
  const stop2 = loader.subscribe(() => {});
  await loader.retry();
  assert.deepEqual(calls, [undefined, 'FL']);
  assert.deepEqual([...received.keys()], ['FL', 'TX']);
  assert.equal(statuses.at(-1), 'ready');
  stop(); stop2();
  let replay: Agency[] = [];
  loader.subscribe(page => { replay = page; });
  await loader.retry();
  assert.equal(calls.length, 2);
  assert.equal(replay.length, 2);
});

test('failure retains partial data, reports unavailable and retries the failed page', async () => {
  let fail = true;
  const calls: (string | undefined)[] = [];
  const loader = createAgencyDirectoryLoader(async cursor => {
    calls.push(cursor);
    if (!cursor) return { agencies: [record('FL')], cursor: 'FL' };
    if (fail) throw new Error('offline');
    return { agencies: [record('TX')] };
  });
  const progress: Array<{status: string; loaded: number}> = [];
  loader.subscribe((_page, status) => progress.push(status));
  await loader.retry();
  assert.deepEqual(progress.at(-1), { status: 'unavailable', loaded: 1 });
  fail = false;
  await loader.retry();
  assert.deepEqual(calls, [undefined, 'FL', 'FL']);
  assert.deepEqual(progress.at(-1), { status: 'ready', loaded: 2 });
});

test('an empty successful cloud response is ready; an initial failure is unavailable', async () => {
  for (const fail of [false,true]) {
    const loader = createAgencyDirectoryLoader(async () => { if(fail) throw new Error('denied'); return { agencies: [] }; });
    let latest = '';
    loader.subscribe((_page, status) => {latest = status.status;});
    await loader.retry();
    assert.equal(latest, fail ? 'unavailable' : 'ready');
  }
});

test('late national pages preserve newer live revisions and partial equipment fields', () => {
  const current = { ...record('one', 3), installedFleet: {defibBrand:'ZOLL X Series',mechanicalCPR:'AutoPulse'} } as Agency;
  assert.equal(mergeDirectoryAgency(current,record('one',2)),current);
  const merged = mergeDirectoryAgency(current, { ...record('one',4),installedFleet: { defibBrand: 'LIFEPAK 15' } } as Agency);
  assert.equal(merged.installedFleet.defibBrand,'LIFEPAK 15');
  assert.equal(merged.installedFleet.mechanicalCPR,'AutoPulse');
});

test('public directory refresh preserves browser-local field and contact notes', () => {
  const current = {
    ...record('public-note-preservation', 1),
    fieldNotes: [{ id: 'local-field-note', notes: 'keep local note' }],
    followUpTasks: [{ id: 'local-follow-up', notes: 'keep local task' }],
    keyContacts: [{ id: 'contact-1', name: 'Agency contact', notes: 'keep contact note' }],
  } as Agency;
  const publicResponse = {
    ...record('public-note-preservation', 2),
    keyContacts: [{ id: 'contact-1', name: 'Agency contact' }],
  } as Agency;

  const merged = mergeDirectoryAgency(current, publicResponse);
  assert.deepEqual(merged.fieldNotes, current.fieldNotes);
  assert.deepEqual(merged.followUpTasks, current.followUpTasks);
  assert.equal(merged.keyContacts[0].notes, 'keep contact note');
});
