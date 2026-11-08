import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CountyFigureSourceDetails } from './CountyFigureSourceDetails';

test('all eight county figures remain visible without disclosures, including zeroes', () => {
  const html = renderToStaticMarkup(<CountyFigureSourceDetails countyFips="12001" record={{
    population: 0, averageTransportMinutes: 0, annualCardiacArrestIncidents: 0,
    annualEmergencyTransports: 0, seniorPopPct: 0, medianIncome: 0, povertyRatePct: 0,
    primaryCathLabDistanceMiles: 0,
  }} />);
  assert.equal((html.match(/data-figure-key=/g) ?? []).length, 8);
  assert(!html.includes('<details'));
  assert(!html.includes('Not reported'));
  assert.equal((html.match(/Source details are not attached/g) ?? []).length, 1);
  assert(html.includes('county FIPS 12001'));
});

test('source, vintage, scope and reporting period remain associated with their figure', () => {
  const html = renderToStaticMarkup(<CountyFigureSourceDetails countyFips="12001" sources={{
    population: { source: 'Population reference', sourceUrl: 'https://example.org/county', vintage: '2025',
      scope: 'County equivalent', reportingPeriod: 'Calendar year 2024' },
    povertyRatePct: { source: 'Poverty reference', sourceUrl: 'javascript:alert(1)' },
  }} />);
  for (const text of ['Population reference', 'https://example.org/county', '2025', 'County equivalent', 'Calendar year 2024', 'Poverty reference']) {
    assert(html.includes(text), `Missing source metadata: ${text}`);
  }
  assert(!html.includes('href="javascript:'));
  assert(html.includes('Average EMS transport time'));
  assert(!html.includes('<details'));
});

test('summary metrics can be shown above without duplicating their values in details', () => {
  const html = renderToStaticMarkup(<CountyFigureSourceDetails countyFips="12001" record={{ population: 123456,
    annualEmergencyTransports: 1500 }} omitValuesFor={['population', 'averageTransportMinutes', 'annualCardiacArrestIncidents']} />);
  assert.equal((html.match(/data-figure-key=/g) ?? []).length, 5);
  assert(!html.includes('123,456'));
  assert(html.includes('1,500'));
  assert(html.includes('Not reported'));
});
