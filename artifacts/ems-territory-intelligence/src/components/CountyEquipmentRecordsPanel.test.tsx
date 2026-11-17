import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../types';
import { CountyEquipmentRecordsPanel } from './CountyEquipmentRecordsPanel';
import { buildEquipmentGeography } from '../utils/equipmentGeography';

const states = [{ code: 'FL', state: 'Florida' }];
const counties = [
  { stateCode: 'FL', countyFips: '12005', countyName: 'Bay County' },
  { stateCode: 'FL', countyFips: '12057', countyName: 'Hillsborough County' },
];

function agency(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agency-1',
    name: 'Bay County EMS',
    stateCode: 'FL',
    county: 'Bay',
    countyFips: '12005',
    agencyType: 'EMS',
    installedFleet: { defibBrand: 'ZOLL X Series' },
    ...overrides,
  } as unknown as Agency;
}

test('empty county panel says equipment is not reported, not absent', () => {
  const coverage = buildEquipmentGeography(
    [],
    states,
    counties,
    { presence: 'all', family: 'all' },
    { includeAgencyRecords: true },
  ).byCounty['12005'];
  const html = renderToStaticMarkup(
    <CountyEquipmentRecordsPanel countyName="Bay County" stateName="Florida" coverage={coverage} />,
  );

  assert.match(html, /No directory agency records are assigned/);
  assert.match(html, /Equipment status is not reported/);
  assert.match(html, /does not establish that equipment is absent/);
});

test('county panel retains evidence dates and service-area context without duplicating totals', () => {
  const record = agency({
    serviceAreaGeographyIds: ['12057'],
    sourceFacts: [{
      id: 'equipment-fact-1',
      fieldKey: 'equipmentSuppliers',
      value: 'Philips HeartStart MRx',
      sourceName: 'County inventory',
      sourceRecordId: 'source-99',
      sourceUrl: 'https://example.gov/records/source-99',
      reportingPeriod: '2024',
      geographicLevel: 'agency',
      geographicId: 'agency-1',
      basis: 'source-reported',
      enteredAt: '2025-02-01T00:00:00.000Z',
    }],
    factEvidence: {
      defibrillatorBiomedicalFleet: {
        reviewed: true,
        sourceKind: 'public-record',
        sourceName: 'County equipment roster',
        sourceRecordId: 'inventory-42',
        sourceUrl: 'https://example.gov/records/inventory-42',
        reportingPeriod: '2025',
        reviewedAt: '2026-01-15T00:00:00.000Z',
      },
    },
  });
  const result = buildEquipmentGeography(
    [record],
    states,
    counties,
    { presence: 'all', family: 'all' },
    { includeAgencyRecords: true },
  );
  const html = renderToStaticMarkup(
    <CountyEquipmentRecordsPanel
      countyName="Bay County"
      stateName="Florida"
      coverage={result.byCounty['12005']}
      onSelectAgency={() => undefined}
    />,
  );

  assert.equal(result.byCounty['12005'].total, 1);
  assert.equal(result.byCounty['12057'].total, 0);
  assert.equal(result.byCounty['12005'].sourceFactRecordCount, 1);
  assert.match(html, /ZOLL X Series/);
  assert.match(html, /Philips HeartStart MRx/);
  assert.match(html, /Source fact · not assumed current/);
  assert.match(html, /County equipment roster/);
  assert.match(html, /Reporting period: 2025/);
  assert.match(html, /County inventory/);
  assert.match(html, /Service-area references · not used for county totals/);
  assert.match(html, /Open agency profile/);
});
