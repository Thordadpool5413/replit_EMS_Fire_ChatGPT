import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HomeMapFailureFallback,
  HomeMapUnavailableFallback,
  TerritoryMapFailureFallback,
} from './HomeMapFallbacks';

test('map failure keeps an accessible directory action available', () => {
  const onBrowseDirectory = () => {};
  const failure = renderToStaticMarkup(<HomeMapFailureFallback onBrowseDirectory={onBrowseDirectory} />);
  const unavailable = renderToStaticMarkup(<HomeMapUnavailableFallback onBrowseDirectory={onBrowseDirectory} />);

  for (const html of [failure, unavailable]) {
    assert.match(html, /role="alert"/);
    assert.match(html, /Agency information is still available|Agency records remain accessible/);
    assert.match(html, /<button type="button"[^>]*>Browse agency directory<\/button>/);
    assert.doesNotMatch(html, /disabled|tabindex="-1"/i);
  }
  assert.match(failure, /The map could not be displayed/);
  assert.match(unavailable, /The national map is unavailable/);
});

test('county and state map failures keep records reachable below', () => {
  const html = renderToStaticMarkup(<TerritoryMapFailureFallback title="County boundary map unavailable" />);
  assert.match(html, /County boundary map unavailable/);
  assert.match(html, /County and agency records remain accessible below/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<button type="button"/);
  assert.match(html, /Go to directory/);
});
