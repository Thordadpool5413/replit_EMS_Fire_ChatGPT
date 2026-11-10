import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../../types';
import { AgencyIntelligenceBrief, getAgencyServiceMode } from './AgencyIntelligenceBrief';
import { buildEquipmentLines, getDocumentedOffers, offerTotal, offerValue, summarizeEvidence } from './equipmentInsights';
import type { DocumentedTradeInOffer } from './equipmentInsights';

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
  assert.match(html, /Recorded monitor/);
  assert.match(html, /0 years/);
  assert.match(html, /0 units/);
  assert.equal((html.match(/equipment-line-monitor/g) ?? []).length, 1);
  assert.match(html, /Budget cycle recorded as ending in June/);
  assert.doesNotMatch(html, /brief-finding-claims|Medicare denied amount/);
});

test('technology and buy-back precede operational figures without duplicate hardware summary', () => {
  const html = render(record());
  assert(html.indexOf('profile-equipment-summary') < html.indexOf('profile-buyback-insights'));
  assert(html.indexOf('profile-buyback-insights') < html.indexOf('baseline-operational-metrics'));
  assert.match(html, /No current quote recorded/);
  assert.match(html, /Prepare for a quote/);
  assert.match(html, /Cash buy-back/);
  assert.match(html, /Vendor replacement credit/);
  assert.doesNotMatch(html, /Fleet &amp; hardware/);
});

test('alternative quotes remain independent even when their kind and currency match', () => {
  const quote = {
    id: 'cash-one', provider: 'Provider one', kind: 'cash-buyback' as const,
    eligibleDevice: 'Monitor', currency: 'USD', perUnitValue: 1000, eligibleQuantity: 2,
    offerDate: '2020-01-01', expiryDate: '2099-12-31',
  };
  const html = render(record({ documentedTradeInOffers: [quote, { ...quote, id: 'cash-two', provider: 'Provider two' }] }));
  assert.match(html, /Provider one/);
  assert.match(html, /Provider two/);
  assert.match(html, /USD 2,000/);
  assert.doesNotMatch(html, /USD 4,000|Within-dates total/);
  assert.match(html, /Offers may cover the same devices/);
});

test('software records are never split or vendor/model guessed', () => {
  const agency = record({ installedFleet: { defibBrand: 'Unknown brand', epcrCadSoftware: 'Combined system' } as Agency['installedFleet'] });
  const lines = buildEquipmentLines(agency);
  assert.equal(lines.find(l => l.key === 'monitor')?.value, 'Unknown brand');
  assert.equal(lines.find(l => l.key === 'epcrcad')?.value, 'Combined system');
  assert.match(lines.find(l => l.key === 'epcrcad')!.label, /combined record/);
  assert.equal(lines.find(l => l.key === 'dispatch')?.value, 'Not reported');
  assert.equal(lines.find(l => l.key === 'billing')?.value, 'Not reported');
});

test('source metadata is available in touch-opened details and does not certify current use', () => {
  const agency = record({factEvidence: {verifiedHardware: {
    reviewed: true, sourceName: 'Equipment ledger', sourceRecordId: 'ledger',
    sourceUrl: 'https://example.org/ledger', reportingPeriod: 'FY2024',
    geographicLevel: 'agency', geographicId: 'test-agency', reviewedAt: '2026-11-10',
  }}});
  const evidence = summarizeEvidence(agency, 'verifiedHardware');
  assert.equal(evidence.state, 'reviewed');
  assert.match(evidence.stateLabel, /does not confirm current use/);
  const html = render(agency);
  assert.match(html, /equipment-source-basis/);
  assert.match(html, /Equipment ledger/);
  assert.match(html, /FY2024/);
  assert.match(html, /Scope agency test-agency/);
  assert.equal(summarizeEvidence(record(), 'verifiedHardware').state, 'none');
});

const quote: DocumentedTradeInOffer = {
  id: 'quote', kind: 'vendor-credit', provider: 'Recorded vendor',
  eligibleDevice: 'Recorded model', perUnitValue: 2500, eligibleQuantity: 2,
  currency: 'USD', sourceName: 'Written offer', offerDate: '2026-11-01', expiryDate: '2026-12-01',
};

test('quoted totals use eligible units, never the entire installed fleet', () => {
  assert.equal(offerTotal(quote), 5000);
  for (const invalid of [
    {...quote, eligibleQuantity: undefined}, {...quote, eligibleQuantity: -1},
    {...quote, eligibleQuantity: 1.5}, {...quote, perUnitValue: NaN},
    {...quote, currency: undefined}, {...quote, eligibleDevice: undefined},
    {...quote, perUnitValue: Number.MAX_VALUE, eligibleQuantity: 2},
  ]) assert.equal(offerTotal(invalid), null);
  assert.equal(offerTotal({...quote, eligibleQuantity: 0}), 0);
  assert.equal(offerValue(2500), '2,500 · currency not stated');
  assert.equal(offerValue(2500, 'CAD'), 'CAD 2,500');
  const html = render(record({
    installedFleet: {defibUnitsCount: 100} as Agency['installedFleet'],
    documentedTradeInOffers: [quote],
  }));
  assert.match(html, /USD 5,000/);
  assert.doesNotMatch(html, /USD 250,000|No current quote recorded/);
  assert.match(html, /Vendor replacement credit/);
  assert.match(html, /Written offer/);
});

test('malformed offers and unsafe source URLs are not trusted', () => {
  const agency = record({documentedTradeInOffers: [
    {id: 'x', kind: 'cash-buyback', provider: 'Buyer', sourceUrl: 'javascript:alert(1)', perUnitValue: -9, eligibleQuantity: 1.5},
    {kind: 'cash-buyback', provider: 'Missing identifier'},
    {id: 'bad', kind: 'invalid', provider: 'Other'},
    {id: 'empty', kind: 'cash-buyback', provider: ' '},
  ] as unknown as DocumentedTradeInOffer[]});
  const offers = getDocumentedOffers(agency);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].sourceUrl, undefined);
  assert.equal(offers[0].eligibleQuantity, null);
  assert.equal(offers[0].perUnitValue, null);
  assert.doesNotMatch(render(agency), /javascript:|USD/);
});
