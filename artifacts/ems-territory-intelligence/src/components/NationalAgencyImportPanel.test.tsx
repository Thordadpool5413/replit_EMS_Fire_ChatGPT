import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { NationalAgencyImportPanel } from './NationalAgencyImportPanel';

test('national import waits for the full saved directory and does not write during review setup', () => {
  let createCalls = 0;
  const html = renderToStaticMarkup(
    <NationalAgencyImportPanel
      agencies={[]}
      directoryStatus={{ status: 'loading', loaded: 0 }}
      online
      onImportProfiles={async () => {
        createCalls += 1;
        return { createdIds: [], alreadyPresent: 0 };
      }}
    />,
  );

  assert.match(html, /National registry import/);
  assert.match(html, /Loading all saved records/);
  assert.match(html, /<button[^>]*disabled=""[^>]*data-testid="button-scan-registry-snapshots"/);
  assert.match(html, /data-testid="status-scan-blocked"/);
  assert.doesNotMatch(html, /dialog-import-confirmation/);
  assert.equal(createCalls, 0);
});
