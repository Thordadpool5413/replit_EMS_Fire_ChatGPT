import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTerritoryUrl, withTerritoryUrl } from './territoryUrl';

const countiesByState: Record<string, string[]> = {
  FL: ['Miami-Dade County'],
  TX: ['Harris County'],
};
const validators = {
  isValidStateCode: (stateCode: string) => Object.hasOwn(countiesByState, stateCode),
  resolveCountyName: (stateCode: string, countyName: string) =>
    countiesByState[stateCode]?.find((county) =>
      county.toLowerCase() === countyName.toLowerCase() ||
      county.toLowerCase().replace(/ county$/, '') === countyName.toLowerCase().replace(/ county$/, ''),
    ),
};

test('parses and canonicalizes state, county, and provider scope', () => {
  assert.deepEqual(parseTerritoryUrl('?state=fl&county=miami-dade&provider=ems', validators), {
    state: 'FL',
    county: 'Miami-Dade County',
    category: 'ems',
    hasTerritorySelection: true,
  });
});

test('restores a state-wide selection without requiring a county', () => {
  assert.deepEqual(parseTerritoryUrl('?state=TX&provider=fire', validators), {
    state: 'TX',
    county: 'all',
    category: 'fire',
    hasTerritorySelection: true,
  });
});

test('falls back to the national map for unsupported states and counties', () => {
  for (const search of ['?state=XX', '?state=FL&county=Not-A-County', '?county=Miami-Dade']) {
    assert.deepEqual(parseTerritoryUrl(search, validators), {
      state: 'all',
      county: 'all',
      category: 'all',
      hasTerritorySelection: false,
    });
  }
});

test('uses the all-provider scope for unsupported provider values', () => {
  assert.deepEqual(parseTerritoryUrl('?state=FL&provider=police', validators), {
    state: 'FL',
    county: 'all',
    category: 'all',
    hasTerritorySelection: true,
  });
});

test('writes canonical share values while preserving the app path and other query values', () => {
  const result = new URL(withTerritoryUrl(
    'https://example.test/ems-territory-intelligence/?campaign=demo&state=CA',
    { state: 'FL', county: 'Miami-Dade', category: 'fire' },
    validators,
  ));

  assert.equal(result.pathname, '/ems-territory-intelligence/');
  assert.equal(result.searchParams.get('campaign'), 'demo');
  assert.equal(result.searchParams.get('state'), 'FL');
  assert.equal(result.searchParams.get('county'), 'Miami-Dade County');
  assert.equal(result.searchParams.get('provider'), 'fire');
});
