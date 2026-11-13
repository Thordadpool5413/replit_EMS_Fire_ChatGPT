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
  assert(!html.includes('Source details are not attached'));
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
  assert(html.includes('Population'));
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

test('directory cards can suppress only general explanations without hiding source metadata', () => {
  const html = renderToStaticMarkup(<CountyFigureSourceDetails countyFips="12001" showValues={false} showGeneralNotes={false}
    sources={{ population: { source: 'County population record', sourceUrl: 'https://example.org/population',
      vintage: '2025', scope: 'County', reportingPeriod: '2024' } }} />);
  for (const value of ['County population record', 'https://example.org/population', '2025', 'County', '2024']) {
    assert(html.includes(value), `Source information lost: ${value}`);
  }
  assert(!html.includes('data standard'));
  assert(!html.includes('does not establish'));
  assert(!html.includes('<details'));
});

test('empty source footers are omitted without duplicating the figures above', () => {
  const html = renderToStaticMarkup(<CountyFigureSourceDetails countyFips="12001" showValues={false} showGeneralNotes={false} record={{population: 123456}} />);
  assert.equal(html, '');
});

test('brief variant leads with primary figures and cites only supplied source metadata', () => {
  const html = renderToStaticMarkup(<CountyFigureSourceDetails countyFips="12001" variant="brief" showGeneralNotes={false}
    record={{ population: 278468, annualEmergencyTransports: 0, annualCardiacArrestIncidents: 312 }}
    sources={{ population: { source: 'Census ACS', vintage: '2023' } }} />);
  assert.equal((html.match(/data-figure-key=/g) ?? []).length, 8);
  const pos = (k: string) => html.indexOf(`data-figure-key="${k}"`);
  assert(pos('population') < pos('averageTransportMinutes') && pos('averageTransportMinutes') < pos('annualCardiacArrestIncidents'));
  assert(pos('annualCardiacArrestIncidents') < pos('annualEmergencyTransports'));
  assert(html.includes('Census ACS') && html.includes('2023'));
  assert(!html.includes('Not provided'));
  assert(!html.includes('<table'));
});
