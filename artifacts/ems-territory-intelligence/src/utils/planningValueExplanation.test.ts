import test from 'node:test';
import assert from 'node:assert/strict';
import type { Agency } from '../types';
import { getPlanningValueExplanation } from './planningValueExplanation';

const agency = (overrides: Partial<Agency> = {}) =>
  ({
    id: 'agency-test',
    zollOpportunity: { projectedPipelineValue: 126000 },
    ...overrides,
  }) as Agency;

test('explains generated provider-population estimates with their model inputs', () => {
  const explanation = getPlanningValueExplanation(
    agency({
      zollOpportunity: { projectedPipelineValue: 126000 },
      planningValueModel: {
        modelId: 'national_provider_population_proxy_v1',
        populationInput: 39000,
        populationBasis: 'provider_population_proxy',
        populationPerModeledUnit: 13000,
        minimumModeledUnits: 2,
        dollarsPerModeledUnit: 42000,
        period: null,
      },
    }),
  );

  assert.equal(explanation.modeledUnits, 3);
  assert.equal(explanation.status, 'documented_method');
  assert.match(explanation.populationBasis ?? '', /not a provider-reported count/);
  assert.equal(explanation.period, null);
});

test('explains county-population proxies without calling them agency counts', () => {
  const explanation = getPlanningValueExplanation(
    agency({
      zollOpportunity: { projectedPipelineValue: 84000 },
      planningValueModel: {
        modelId: 'territory_county_population_proxy_v1',
        populationInput: 28000,
        populationBasis: 'county_population_proxy',
        populationPerModeledUnit: 14000,
        minimumModeledUnits: 2,
        dollarsPerModeledUnit: 42000,
        period: null,
      },
    }),
  );

  assert.equal(explanation.modeledUnits, 2);
  assert.equal(explanation.status, 'documented_method');
  assert.match(explanation.populationBasis ?? '', /not a verified agency service-area count/);
});

test('does not invent inputs or timing when an existing record lacks model metadata', () => {
  const explanation = getPlanningValueExplanation(agency());

  assert.equal(explanation.status, 'method_missing');
  assert.equal(explanation.modeledUnits, null);
  assert.equal(explanation.period, null);
});

test('flags estimates that do not reproduce from their attached model inputs', () => {
  const explanation = getPlanningValueExplanation(
    agency({
      zollOpportunity: { projectedPipelineValue: 130000 },
      planningValueModel: {
        modelId: 'national_provider_population_proxy_v1',
        populationInput: 39000,
        populationBasis: 'provider_population_proxy',
        populationPerModeledUnit: 13000,
        minimumModeledUnits: 2,
        dollarsPerModeledUnit: 42000,
        period: null,
      },
    }),
  );

  assert.equal(explanation.status, 'value_mismatch');
});
