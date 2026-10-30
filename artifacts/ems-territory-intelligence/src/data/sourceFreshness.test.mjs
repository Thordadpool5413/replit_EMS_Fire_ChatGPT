import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySourceFreshness } from './sourceFreshness.ts';

const oneHour = 60 * 60 * 1000;
const now = Date.parse('2026-10-30T12:00:00.000Z');

test('marks a successful check inside its freshness window current', () => {
  assert.equal(
    classifySourceFreshness(now - oneHour, now, 24 * oneHour).status,
    'current'
  );
});

test('marks a successful check outside its freshness window stale', () => {
  assert.equal(
    classifySourceFreshness(now - 25 * oneHour, now, 24 * oneHour).status,
    'stale'
  );
});

test('does not call data current when its check time is missing', () => {
  assert.equal(
    classifySourceFreshness(undefined, now, 24 * oneHour).status,
    'unknown'
  );
});

test('reports a failed refresh separately from the last successful check', () => {
  const result = classifySourceFreshness(now - oneHour, now, 24 * oneHour, true);
  assert.equal(result.status, 'error');
  assert.equal(result.ageMs, oneHour);
});
