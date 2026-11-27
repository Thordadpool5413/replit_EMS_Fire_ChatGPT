import test from 'node:test';
import assert from 'node:assert/strict';
import { providerPurchases } from './providerProcurement';
import type { ResearchCandidate } from './nationalCompetitiveResearch';

const purchase: ResearchCandidate = {
  key: 'chicago:123:01', nativeId: '123', number: '123', source: 'chicago',
  role: 'contracting-department', organization: 'Fire Department', state: 'IL',
  title: 'Portable defibrillators', sourceType: 'Purchase order / revision',
  amount: 0, vendor: 'Source Vendor', publishedDay: '2026-01-05', fiscalYear: null,
  deadlineLocal: null, description: null, periodStart: null, periodEnd: null,
  contractRevision: '01', sourceUrl: 'https://data.cityofchicago.org/',
};

test('procurement follows buyer or issuer identity and preserves separate revisions', () => {
  const revision = { ...purchase, key: 'chicago:123:02', contractRevision: '02' };
  const vendor: ResearchCandidate = { ...purchase, role: 'supplier', source: 'federal-contracts' };
  const sameNameWrongState = { ...purchase, state: 'NY' };
  const unrelated = { ...purchase, organization: 'North Chicago Fire Department' };
  assert.deepEqual(providerPurchases([purchase, purchase, revision, vendor, sameNameWrongState, unrelated], 'FDID:IL:CS931'), [purchase, revision]);
  assert.deepEqual(providerPurchases([purchase], 'FDID:IL:LA312'), []);
  assert.deepEqual(providerPurchases([purchase, { ...purchase, amount: 10 }], 'FDID:IL:CS931'), []);
});
