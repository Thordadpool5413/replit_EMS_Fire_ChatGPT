import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../../types';
import { AgencyIntelligenceBrief, getAgencyServiceMode } from './AgencyIntelligenceBrief';

const record = (overrides: Partial<Agency> = {}): Agency => ({
  agencyType: 'Municipal EMS',
  providerCategory: 'EMS',
  annualCallVolume: 12500,
  annual911Transports: 8000,
  stationsCount: 4,
  totalAmbulances: 12,
  totalFireEngines: 0,
  totalEMSStaff: 90,
  annualCardiacArrestCalls: 0,
  populationServed: 100000,
  responseAreaSqMiles: 60,
  installedFleet: {},
  competitorContract: {},
  grantStatus: {},
  ...overrides,
} as Agency);

const render = (agency: Agency) => renderToStaticMarkup(
  <AgencyIntelligenceBrief agency={agency} renderFactTag={() => null} />,
);

test('available operational figures remain visible without evidence tags', () => {
  const html = render(record());
  assert.match(html, /12,500/);
  assert.match(html, /8,000/);
  assert.match(html, /baseline-stations/);
  assert.match(html, /<span class="aib-num">4<\/span>/);
  assert.match(html, /<span class="aib-num">12<\/span>/);
  assert.match(html, /EMS personnel/);
  assert.doesNotMatch(html, /Fire suppression engines/);
});

test('missing values and reported zeros remain distinct', () => {
  const html = render(record({ utsteinSurvivalRate: undefined }));
  assert.match(html, /<span class="aib-num">0<\/span>/);
  assert.match(html, /is-missing"><span class="aib-num">Not reported/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('EMS, fire and combined records choose the correct discipline', () => {
  assert.equal(getAgencyServiceMode(record()), 'ems');
  const fire = record({
    agencyType: 'Fire Department', providerCategory: 'FIRE',
    totalAmbulances: 0, annual911Transports: 0,
  });
  assert.equal(getAgencyServiceMode(fire), 'fire');
  assert.equal(getAgencyServiceMode(record({
    agencyType: 'Fire & EMS', providerCategory: 'FIRE',
  })), 'combined');
  const html = render(fire);
  assert.match(html, /Reported fire-rescue calls/);
  assert.match(html, /Fire suppression engines/);
  assert.equal((html.match(/data-testid="baseline-stations"/g) ?? []).length, 1);
});

test('findings use recorded inputs and pair them with a basis and next step', () => {
  const html = render(record({
    installedFleet: { defibAgeYears: 0, defibUnitsCount: 0, defibBrand: 'Recorded monitor' } as Agency['installedFleet'],
    budgetCycleEndMonth: 'June',
  }));
  assert.match(html, /recorded at 0 years \(Recorded monitor\)/);
  assert.match(html, /Installed fleet record · 0 units/);
  assert.match(html, /Confirm age, unit count and replacement timing/);
  assert.match(html, /Budget cycle recorded as ending in June/);
  assert.doesNotMatch(html, /brief-finding-claims|Medicare denied amount/);
});
