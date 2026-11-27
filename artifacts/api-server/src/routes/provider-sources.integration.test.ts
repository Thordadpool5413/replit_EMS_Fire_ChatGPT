import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { parseProviderSourceRows, providerSourceHeadings } from '@workspace/api-zod/provider-sources';
import { pipelineIdentity } from '../lib/workingPipeline';

const registry = 'FDID:FL:61091';
const key = 'ci-provider-source-snapshots';
const agency = { id: key, name: 'Fixture provider', stateCode: 'FL', registryIdentity: {
  sourceName: 'USFA NFDR', stateCode: 'FL', identifier: '61091', name: 'Fixture provider',
  sourceUrl: 'https://apps.usfa.fema.gov/registry/search',
} };
const csv = (kind: keyof typeof providerSourceHeadings, row: string) => providerSourceHeadings[kind].join(',') + '\n' + row;
const billing = csv('billing', registry + ',2025-01-01,2025-12-31,Commercial,BlueCross,100,80,15,0,200000,100000');
const inventory = csv('inventory', registry + ',2025-11-04,aed,ZOLL,AED 3,1,station,Station 1');
const purchases = csv('purchases', registry + ',2025-11-04,paid,Invoice 1,aed,ZOLL,AED 3,Supplier,1,185000');

test('source templates enforce registry identity, evidence scope, stage and denial denominator', () => {
  assert.equal(parseProviderSourceRows(billing, 'billing', registry)[0].final, 0);
  assert.equal(parseProviderSourceRows(inventory, 'inventory', registry)[0].owned, 1);
  assert.equal(parseProviderSourceRows(purchases, 'purchases', registry)[0].event, 'paid');
  assert.throws(() => parseProviderSourceRows(billing, 'billing', 'FDID:FL:61191'), /exact registry key/);
  assert.throws(() => parseProviderSourceRows(billing.replace(',80,15,', ',10,15,'), 'billing', registry), /denominator/);
  assert.throws(() => parseProviderSourceRows(billing.replace('registry_key', 'patient_name'), 'billing', registry), /template/);
  assert.throws(() => parseProviderSourceRows(inventory.replace('Station 1', ''), 'inventory', registry), /scope/);
  assert.throws(() => parseProviderSourceRows(purchases.replace(',paid,', ',present,') , 'purchases', registry), /event/);
  assert.throws(() => parseProviderSourceRows(inventory + '\n' + inventory.split('\n')[1], 'inventory', registry), /Duplicate/);
});

test('private provider evidence survives reloads and revisions with access and identity controls', async () => {
  assert.equal(process.env.ATLAS_EVIDENCE_CI, '1');
  assert.equal(process.env.DATABASE_URL, 'postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci');
  process.env.ATLAS_AGENCY_EDITOR_IDS = 'provider-source-editor';
  process.env.ATLAS_AGENCY_VIEWER_IDS = 'provider-source-viewer';
  const { db, pool, agencyRecordsTable, sessionsTable, providerSourceSnapshotsTable } = await import('@workspace/db');
  const { eq } = await import('drizzle-orm');
  const { authMiddleware } = await import('../middlewares/authMiddleware');
  const { default: router } = await import('./provider-sources');
  const app = express().use(express.json()).use(authMiddleware).use(router);
  const server = app.listen(0, '127.0.0.1');
  const users = ['provider-source-editor', 'provider-source-viewer', 'provider-source-outsider'];
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const api = 'http://127.0.0.1:' + address.port + '/agencies/' + key + '/source-snapshots/';
    for (const id of users) await db.insert(sessionsTable).values({ sid: 'ci-' + id, sess: { user: { id }, access_token: 'local-test-only' }, expire: new Date(Date.now() + 120_000) });
    await db.insert(agencyRecordsTable).values({ id: key, stateCode: agency.stateCode, payload: agency });
    const binding = pipelineIdentity(agency)!.binding;
    const body = { binding, expectedRevision: 0, source: 'Agency fixture', cohort: 'Ground ambulance', denialDefinition: 'entire claim denied', attested: true, csv: billing };
    async function request(kind: string, actor?: string, data?: object, origin?: string) {
      const r = await fetch(api + kind, {
        method: data ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ci-' + actor } : {}), ...(origin ? { Origin: origin } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      assert.match(r.headers.get('cache-control') ?? '', /no-store/);
      return { status: r.status, body: await r.json() };
    }
    const [editor, viewer, outsider] = users;
    assert.equal((await request('billing')).status, 401);
    assert.equal((await request('billing', outsider)).status, 403);
    assert.equal((await request('billing', viewer, body)).status, 403);
    assert.equal((await request('billing', editor, body, 'https://another.example')).status, 403);
    assert.equal((await request('billing', editor, { ...body, denialDefinition: 'not provided' })).status, 400);
    assert.equal((await request('billing', editor, body)).status, 201);
    assert.equal((await request('billing', editor, body)).status, 200);
    const saved = await request('billing', viewer);
    assert.equal(saved.body.snapshot.rows[0].final, 0);
    assert.equal(saved.body.snapshot.rows[0].payerName, 'BlueCross');
    assert.equal(saved.body.canWrite, false);
    assert.equal((await request('billing', editor, { ...body, source: 'Stale edit' })).status, 409);
    assert.equal((await request('billing', editor, { ...body, expectedRevision: 1, source: 'New revision' })).status, 201);
    assert.equal((await request('billing?revision=1', viewer)).body.snapshot.source, 'Agency fixture');
    for (const [kind, sheet] of [['inventory', inventory], ['purchases', purchases]] as const) {
      assert.equal((await request(kind, editor, { ...body, csv: sheet })).status, 201);
      assert.equal((await request(kind, viewer)).body.snapshot.rows.length, 1);
    }
    await db.update(agencyRecordsTable).set({ payload: { ...agency, registryIdentity: { ...agency.registryIdentity, identifier: '61191' } } }).where(eq(agencyRecordsTable.id, key));
    assert.equal((await request('billing', viewer)).body.snapshot, null);
    assert.equal((await request('billing?revision=1', viewer)).status, 404);
    assert.equal((await request('billing', editor, body)).status, 409);
  } finally {
    await db.delete(providerSourceSnapshotsTable).where(eq(providerSourceSnapshotsTable.agencyId, key));
    await db.delete(agencyRecordsTable).where(eq(agencyRecordsTable.id, key));
    for (const id of users) await db.delete(sessionsTable).where(eq(sessionsTable.sid, 'ci-' + id));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
