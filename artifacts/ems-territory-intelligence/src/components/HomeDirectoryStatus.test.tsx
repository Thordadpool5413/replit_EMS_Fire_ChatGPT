import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeDirectoryStatus, resolveHomeDirectoryNotice } from './HomeDirectoryStatus';

test('loading is not reported as an empty agency directory', () => {
  const notice = resolveHomeDirectoryNotice({ status: 'loading', loaded: 12 }, 0);
  assert.equal(notice?.kind, 'loading');
  assert.match(notice?.description ?? '', /12 records are loaded so far/);
  assert.doesNotMatch(notice?.title ?? '', /No agency records/);

  const html = renderToStaticMarkup(
    <HomeDirectoryStatus
      status={{ status: 'loading', loaded: 0 }}
      visibleAgencyCount={0}
      onBrowseDirectory={() => {}}
    />,
  );
  assert.match(html, /data-testid="home-directory-status-loading"/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /Open agency directory/);
});

test('unavailable data stays distinct and exposes retry and directory actions', () => {
  const html = renderToStaticMarkup(
    <HomeDirectoryStatus
      status={{ status: 'unavailable', loaded: 8 }}
      visibleAgencyCount={0}
      onRetry={() => {}}
      onBrowseDirectory={() => {}}
    />,
  );
  assert.match(html, /data-testid="home-directory-status-unavailable"/);
  assert.match(html, /The latest request failed/);
  assert.match(html, /8 previously loaded records remain available/);
  assert.match(html, /Retry directory/);
  assert.match(html, /Open agency directory/);
  assert.match(html, /role="alert"/);
});

test('a completed empty directory differs from zero matches in a populated directory', () => {
  const empty = resolveHomeDirectoryNotice({ status: 'ready', loaded: 0 }, 0, 46669);
  const filtered = resolveHomeDirectoryNotice({ status: 'ready', loaded: 85 }, 0);
  assert.equal(empty?.kind, 'empty');
  assert.match(empty?.title ?? '', /No saved agency profiles/);
  assert.match(empty?.description ?? '', /46,669 public USFA and NPPES registry listings/);
  assert.equal(filtered?.kind, 'filtered-empty');
  assert.match(filtered?.description ?? '', /85 agency records loaded overall/);
  const html = renderToStaticMarkup(
    <HomeDirectoryStatus status={{ status: 'ready', loaded: 0 }} visibleAgencyCount={0} publicListingCount={46669} onBrowseDirectory={() => {}} />,
  );
  assert.match(html, /Browse public registry listings/);
});

test('a populated current view does not add a misleading empty-state card', () => {
  assert.equal(resolveHomeDirectoryNotice({ status: 'ready', loaded: 85 }, 3), null);
  assert.equal(resolveHomeDirectoryNotice(undefined, 0), null);
});
