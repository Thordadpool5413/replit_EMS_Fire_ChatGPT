import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../../types';
import { ProfileAttentionSummary } from './ProfileAttentionSummary';
const render = (overrides: Partial<Agency> = {}) => renderToStaticMarkup(
  <ProfileAttentionSummary agency={{id:'focus-test',name:'Test EMS',installedFleet:{},competitorContract:{},...overrides} as Agency} onNavigate={() => {}} />
);
test('opening focus summary is concise and keeps preparation out of the overview', () => {
  const html = render();
  assert.match(html, /Why focus on this provider/);
  assert.match(html, /No documented opportunity signal yet/);
  assert.match(html, /All findings/);
  assert.match(html, /Deal story &amp; discovery/);
  assert.doesNotMatch(html, /profile-meeting-brief|button-add-signal|Recommended next action/);
});
test('recorded equipment age stays a low-confidence discovery prompt, never buying intent', () => {
  const html = render({installedFleet:{defibBrand:'Recorded monitor',defibAgeYears:9} as Agency['installedFleet']});
  assert.match(html, /Recorded monitor age: 9 years/);
  assert.match(html, /Low confidence/);
  assert.match(html, /not evidence of failure/);
  assert.doesNotMatch(html, /Source: |No source mapped|Not mapped/);
});
