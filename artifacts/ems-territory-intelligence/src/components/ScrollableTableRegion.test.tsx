import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScrollableTableRegion } from './ScrollableTableRegion';

test('wide tables render inside a labeled, focusable scroll region', () => {
  const html = renderToStaticMarkup(
    <ScrollableTableRegion label="Equipment table" testId="region-equipment">
      <table><tbody><tr><td>Value</td></tr></tbody></table>
    </ScrollableTableRegion>,
  );
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Equipment table, scrolls horizontally"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /data-testid="region-equipment"/);
  assert.match(html, /<td>Value<\/td>/);
});

test('the swipe hint is decorative and does not duplicate the accessible name', () => {
  const html = renderToStaticMarkup(
    <ScrollableTableRegion label="Contracts"><table /></ScrollableTableRegion>,
  );
  assert.match(html, /class="pi-table-region__hint" aria-hidden="true"/);
});

test('original wrapper sizing classes are preserved', () => {
  const html = renderToStaticMarkup(
    <ScrollableTableRegion label="Grants" className="border rounded-lg" maxHeightClassName="max-h-64">
      <table />
    </ScrollableTableRegion>,
  );
  assert.match(html, /class="pi-table-region border rounded-lg"/);
  assert.match(html, /pi-table-region__scroller overflow-x-auto max-h-64/);
});
