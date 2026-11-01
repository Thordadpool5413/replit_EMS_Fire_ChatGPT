import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NationalAmbulanceReference } from '../components/NationalAmbulanceReference';
import { getNationalRsnatReference } from './nationalAmbulanceReference';

test('national RSNAT reference derives its percentage from reported paid and denied line counts', () => {
  const metric = getNationalRsnatReference();
  assert.equal(metric.paidClaimLines, 721767);
  assert.equal(metric.deniedClaimLines, 31031);
  assert.equal(metric.outcomeClaimLines, 752798);
  assert.equal(metric.ratePct, (31031 / (721767 + 31031)) * 100);
  assert.equal(metric.ratePct.toFixed(2), '4.12');
  assert.equal(metric.unit, 'claim lines');
  assert.equal(metric.geography, 'national-program');
  assert.equal(metric.periodStart, '2023-10-01');
  assert.equal(metric.periodEnd, '2024-09-30');
  assert.ok(!('npi' in metric));
  assert.ok(!('countyFips' in metric));
  assert.ok(!('stateCode' in metric));
});

test('reference displays counts, source, period, math, and limitations without local attribution', () => {
  const markup = renderToStaticMarkup(React.createElement(NationalAmbulanceReference));
  for (const text of [
    '4.12%', '31,031', '721,767', '752,798', 'FY2024',
    'not a state, county, or provider rate', 'Claim lines are not unique claims',
    'not an all-emergency-ambulance or final post-appeal rate', '#page=6',
  ]) {
    assert.ok(markup.includes(text), `Missing reference detail: ${text}`);
  }
});
