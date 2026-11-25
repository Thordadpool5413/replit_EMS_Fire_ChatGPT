import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAgencyWorkspaceAccess } from './agencyWorkspaceAccess';

const response = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('workspace access distinguishes editor, viewer, signed-out, and unassigned users', async () => {
  assert.equal(await loadAgencyWorkspaceAccess(async () => response(200, { role: 'editor' })), 'editor');
  assert.equal(await loadAgencyWorkspaceAccess(async () => response(200, { role: 'viewer' })), 'viewer');
  assert.equal(await loadAgencyWorkspaceAccess(async () => response(401)), 'sign-in-required');
  assert.equal(await loadAgencyWorkspaceAccess(async () => response(200, { role: null })), 'no-access');
});

test('workspace access fails closed on forbidden, invalid, and unavailable responses', async () => {
  assert.equal(await loadAgencyWorkspaceAccess(async () => response(403)), 'no-access');
  assert.equal(await loadAgencyWorkspaceAccess(async () => response(503)), 'unavailable');
  assert.equal(await loadAgencyWorkspaceAccess(async () => new Response('not json', { status: 200 })), 'unavailable');
  assert.equal(await loadAgencyWorkspaceAccess(async () => { throw new Error('offline'); }), 'unavailable');
});
