import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTexasLocationCatalog } from './texasLocationReview';
import { loadTexasReviewRoster } from './texasEmsReviewRoster';

test('the full license archive validates historical locations without admitting unrelated public profiles', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'https://repo.fixture');
    const body = await readFile(new URL('../../public' + url.pathname, import.meta.url), 'utf8');
    return new Response(body);
  };
  try {
    const [locations, directory] = await Promise.all([loadTexasLocationCatalog(), loadTexasReviewRoster()]);
    assert.equal(locations.candidates.length, 11);
    assert.ok(locations.candidates.some((row) => row.parentReviewKey === 'TX-DSHS:license:1000494'));
    assert.ok(!directory.records.some((row) => row.sourceKey === 'TX-DSHS:license:300102'));
  } finally {
    globalThis.fetch = previous;
  }
});
