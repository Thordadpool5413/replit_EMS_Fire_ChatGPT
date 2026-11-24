import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileFilterDisclosure } from './MobileFilterDisclosure';
import { describeActiveFilters } from '../utils/filterSummary';
import { MISSING_INPUT_COPY } from '../utils/missingInputCopy';
import { readFileSync } from 'node:fs';

test('collapsed disclosure names applied filters and keeps controls mounted', () => {
  const html = renderToStaticMarkup(
    <MobileFilterDisclosure testId="t" filters={[{ label: 'EMS', active: true }, { label: 'TX', active: true }, { label: 'x', active: false }]}>
      <select aria-label="keep"><option>a</option></select>
    </MobileFilterDisclosure>,
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /data-testid="t-count"[^>]*>2</);
  assert.match(html, /EMS · TX/);
  assert.match(html, /aria-label="keep"/);
  assert.match(html, /data-open="false"/);
});

test('one disclosure identifies every control group it expands', () => {
  const html = renderToStaticMarkup(
    <MobileFilterDisclosure testId="t" filters={[]} additionalControlsId="other-controls">
      <span>First group</span>
    </MobileFilterDisclosure>,
  );
  assert.match(html, /aria-controls="[^"]+ other-controls"/);
});

test('no active filters reads as none applied', () => {
  assert.equal(describeActiveFilters([{ label: 'EMS', active: false }]), 'No filters applied');
  const html = renderToStaticMarkup(<MobileFilterDisclosure testId="t" filters={[]}><span /></MobileFilterDisclosure>);
  assert.match(html, /None applied/);
  assert.doesNotMatch(html, /t-count/);
});

test('extra context (sort/view) is shown but not counted as a filter', () => {
  const html = renderToStaticMarkup(
    <MobileFilterDisclosure testId="t" open filters={[{ label: 'Fire', active: true }]} extraContext={['Sort: fleet age', 'Table view']}><span /></MobileFilterDisclosure>,
  );
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /data-testid="t-count"[^>]*>1</);
  assert.match(html, /Fire · Sort: fleet age · Table view/);
});

test('missing-input copy explains the gap without a value or a bare placeholder', () => {
  for (const text of Object.values(MISSING_INPUT_COPY)) {
    assert.doesNotMatch(text, /not calculated|\$|\d/i, text);
    assert.ok(text.length <= 60, text);
  }
});

test('surfaces no longer render bare Not calculated', () => {
  for (const f of ['PredictiveLeadQueue', 'NationalGeographicExplorer']) {
    const src = readFileSync(new URL(`./${f}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /'Not calculated'/, f);
  }
});

test('home map keeps its original controls without equipment filter panels', () => {
  const src = readFileSync(new URL('./HomeHubView.tsx', import.meta.url), 'utf8');
  const countyMap = readFileSync(new URL('./RealWorldCountyBoundaryMap.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /status-national-registry-directory|status-agency-directory-load/);
  assert.match(src, /data-testid="button-browse-national-records"/);
  assert.match(src, /data-testid="select-state-map-metric"/);
  assert.doesNotMatch(src, /EquipmentMapFilter|EquipmentCoverageLegend|EquipmentRecordBar|home-equipment-state-counts/);
  assert.match(countyMap, /EquipmentMapFilter/, 'County equipment controls stay available in the county map');
});

test('county views omit mapped-place lists and unrelated registry and equipment panels', () => {
  const src = readFileSync(new URL('./RealWorldCountyBoundaryMap.tsx', import.meta.url), 'utf8');
  const selectedCountyStart = src.indexOf('<section className="cv-panel county-geo county-reference-panel county-city-directory-panel"');
  const selectedCountyEnd = src.indexOf('{unmatchedSection}', selectedCountyStart);
  assert.ok(selectedCountyStart >= 0 && selectedCountyEnd > selectedCountyStart, 'selected county reference panel is present');
  const selectedCountyView = src.slice(selectedCountyStart, selectedCountyEnd);

  assert.match(selectedCountyView, /County reference/);
  assert.match(selectedCountyView, /<CountyFigureSourceDetails/);
  assert.doesNotMatch(selectedCountyView, /Places in \{activeCountyNode\.countyName\}|cv-place-list|cv-place-row|button-place-/);
  assert.doesNotMatch(selectedCountyView, /stateNode\.stateName\} · FIPS/);
  assert.doesNotMatch(selectedCountyView, /NationalSourceDirectory|CountyEquipmentRecordsPanel/);
  const sections = ['county-reference-meta', 'county-reference-figures-title', 'county-reference-risk-title',
    'county-reference-sources-title'].map((id) => selectedCountyView.indexOf(id));
  assert.ok(sections.every((index) => index >= 0));
  assert.deepEqual([...sections].sort((a, b) => a - b), sections, 'identity, figures, risk, and sources read in order');
  const countyInspector = src.slice(0, selectedCountyStart);
  assert.doesNotMatch(countyInspector, /ci-places|Places &amp; ZIP codes/, 'state-map county preview also omits the places section');
  const styles = readFileSync(new URL('./CountyInspector.css', import.meta.url), 'utf8');
  assert.match(styles, /\.cv-pin\[data-selected="true"\][\s\S]*cv-pin-ring/);
});

test('county card keeps primary figures visible, removes place lists, and retains Census context', () => {
  const src = readFileSync(new URL('./CountyDirectoryCard.tsx', import.meta.url), 'utf8');
  const order = ['className="cb-name"', 'className="cfs-lead"', 'className="cfs-ledger"', 'className="cb-risk"', 'className="cb-geo"', '<CountyFigureSourceDetails'].map(k => src.indexOf(k));
  order.forEach(i => assert.ok(i >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(src.includes('data-testid={`panel-acs-county-context-'));
  assert.ok(src.includes('Official Census context'));
  assert.doesNotMatch(src, /Mapped places|county-profile-city-list|county-profile-place-button|onSelectPlace/);
  assert.match(src, /ZIP\{zips\.length === 1 \? '' : 's'\}/, 'county ZIP references remain available');
  // Core county figures stay visible; the optional ACS source context may collapse.
  const withoutAcsDisclosure = src.replace(/<details[^>]*data-testid=\{`panel-acs-county-context-[\s\S]*?<\/details>/, '');
  assert.doesNotMatch(withoutAcsDisclosure, /<details/);
});
