import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAcsStateRollups, type AcsCountyMetricRecord } from './acsCountyRollups';

const county = (countyFips: string, stateCode = 'AA') => ({ countyFips, stateCode });
const metrics = (
  countyFips: string,
  values: Partial<Omit<AcsCountyMetricRecord, 'countyFips'>> = {},
): AcsCountyMetricRecord => ({
  countyFips,
  population: 100,
  population65Plus: 20,
  povertyUniverse: 80,
  populationBelowPoverty: 8,
  medianHouseholdIncome: 50_000,
  ...values,
});

describe('ACS county-to-state rollups', () => {
  it('sums population and derives population-weighted rates from exact county FIPS rows', () => {
    const rollup = buildAcsStateRollups(
      [county('01001'), county('01003')],
      [
        metrics('01001', {
          population: 100,
          population65Plus: 20,
          povertyUniverse: 80,
          populationBelowPoverty: 8,
          medianHouseholdIncome: 50_000,
        }),
        metrics('01003', {
          population: 300,
          population65Plus: 90,
          povertyUniverse: 200,
          populationBelowPoverty: 40,
          medianHouseholdIncome: 70_000,
        }),
      ],
      ['AA'],
    ).AA;

    assert.equal(rollup.population.value, 400);
    assert.ok(Math.abs(rollup.population65PlusShare.value! - 27.5) < 0.0001);
    assert.ok(Math.abs(rollup.povertyRate.value! - (48 / 280) * 100) < 0.0001);
    assert.equal(rollup.medianCountyHouseholdIncome.value, 60_000);
    assert.equal(rollup.population.complete, true);
    assert.equal(rollup.countyCount, 2);
  });

  it('withholds a statewide total when a county source row is missing', () => {
    const rollup = buildAcsStateRollups(
      [county('01001'), county('01003')],
      [metrics('01001')],
      ['AA'],
    ).AA;

    assert.equal(rollup.population.value, null);
    assert.equal(rollup.population.partialValue, 100);
    assert.equal(rollup.population.availableCount, 1);
    assert.equal(rollup.population.expectedCount, 2);
    assert.equal(rollup.povertyRate.value, null);
  });

  it('does not double-count duplicate county geometry or duplicate source FIPS', () => {
    const duplicateGeometry = buildAcsStateRollups(
      [county('01001'), county('01001')],
      [metrics('01001')],
      ['AA'],
    ).AA;
    assert.equal(duplicateGeometry.population.value, null);
    assert.equal(duplicateGeometry.duplicateCountyFips, true);

    const duplicateSource = buildAcsStateRollups(
      [county('01001')],
      [metrics('01001'), metrics('01001')],
      ['AA'],
    ).AA;
    assert.equal(duplicateSource.population.value, null);
    assert.equal(duplicateSource.sourceDuplicates, true);
  });

  it('retains absent metrics as missing instead of treating them as zero', () => {
    const rollup = buildAcsStateRollups(
      [county('01001')],
      [metrics('01001', { medianHouseholdIncome: null })],
      ['AA'],
    ).AA;
    assert.equal(rollup.medianCountyHouseholdIncome.value, null);
    assert.equal(rollup.medianCountyHouseholdIncome.partialValue, null);
    assert.equal(rollup.medianCountyHouseholdIncome.availableCount, 0);
  });
});
