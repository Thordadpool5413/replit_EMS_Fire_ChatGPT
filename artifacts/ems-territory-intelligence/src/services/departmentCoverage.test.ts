import test from 'node:test';
import assert from 'node:assert/strict';
import { countDepartment } from './departmentCoverage';
import { departmentCouncilRecords } from '../data/departmentCouncilRecords';
import { departmentAwards } from '../../build/departmentAwards';
import type { DirectoryProvider } from './providerCatalog';

test('an approval, trade-in proposal and collection rate retain separate meanings', () => {
  const get = (key: string) => departmentCouncilRecords.find((r) => r.registryKey === key)!;
  const approved = countDepartment(undefined, get('FDID:FL:10062'), false);
  assert.equal(approved.device, 1);
  assert.equal(approved.inventory, 0);
  assert.equal(approved.purchase, 0);
  assert.equal(countDepartment(undefined, get('FDID:ME:C0260'), false).inventory, 1);
  assert.equal(countDepartment(undefined, get('FDID:NH:80230'), false).denials, 0);
  const mix = countDepartment(undefined, get('FDID:WA:31M08'), false);
  assert.equal(mix.payerMix, 1);
  assert.equal(mix.denials, 0);
});
test('municipal-only payees and ambiguous operator identities stay out of profile awards', () => {
  const rows: DirectoryProvider[] = ['city of euclid', 'city of euclid'].map((name, i) => ({
    ref: { state: 'OH', source: 'registry', id: 'usfa:OH:' + i },
    name,
    city: 'Euclid',
    kind: 'fire',
    zip: '',
    county: '',
  }));
  const edition = departmentAwards('OH', rows);
  assert.deepEqual(edition.byProvider, {});
  assert.ok(edition.counters.grantRows > 0);
  const known = departmentAwards('OH', []);
  assert.equal(known.counters.matched, 0);
});
