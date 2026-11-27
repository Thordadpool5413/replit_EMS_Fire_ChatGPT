import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAggregatePayerCsv, payerHeaders } from './aggregatePayerImport';

const registry = 'FDID:GA:10601';
const header = payerHeaders.join(',') + '\n';
const sample = registry + ',2025-01-01,2025-12-31,Medicare FFS,100,80,15,0,200000,100000';

test('payer imports bind to the exact registry identity and preserve zero versus missing counts', () => {
  const [row] = parseAggregatePayerCsv(header + sample, [registry]);
  assert.equal(row.final, 0);
  assert.equal(row.initial, 15);
  assert.equal(row.adjudicated, 80);
  const [partial] = parseAggregatePayerCsv(header + registry + ',2025-01-01,2025-12-31,Medicaid FFS,30,,,,,', [registry]);
  assert.equal(partial.adjudicated, null);
  assert.throws(() => parseAggregatePayerCsv(header + sample, ['FDID:GA:10602']), /matching registry key/);
});
test('payer imports reject invalid cohorts, duplicate summaries and extra columns', () => {
  assert.throws(() => parseAggregatePayerCsv(header + sample.replace(',80,15,', ',10,15,'), [registry]), /denominator/);
  assert.throws(() => parseAggregatePayerCsv(header + sample + '\n' + sample, [registry]), /Duplicate/);
  assert.throws(() => parseAggregatePayerCsv(payerHeaders.join(',') + ',patient_name\n' + sample + ',x', [registry]), /extra columns/);
});
