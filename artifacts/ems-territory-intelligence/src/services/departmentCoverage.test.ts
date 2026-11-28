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
  const edition = departmentAwards('OH', rows, {});
  assert.deepEqual(edition.byProvider, {});
  assert.ok(edition.counters.grantRows > 0);
  const known = departmentAwards('OH', [], {});
  assert.equal(known.counters.matched, 0);
});

test('Texas grant approvals use the department name and county, without spreading one award to several profiles', () => {
  const elmwood: DirectoryProvider = {
    ref: { state: 'TX', source: 'registry', id: 'usfa:TX:AA403' },
    name: 'Elmwood Volunteer Fire Department, Inc.',
    kind: 'fire',
    city: 'Palestine',
    zip: '75803',
    county: '48001',
  };
  const sameNameElsewhere: DirectoryProvider = {
    ...elmwood,
    ref: { state: 'TX', source: 'registry', id: 'usfa:TX:OTHER' },
    county: '48003',
  };
  const counties = { '48001': 'Anderson County', '48003': 'Andrews County' };
  const edition = departmentAwards('TX', [elmwood, sameNameElsewhere], counties);
  const award = edition.byProvider['FDID:TX:AA403'].find(row => row.title.includes('Slip-On Unit'));
  assert.equal(award?.amount, 45000);
  assert.equal(award?.status, 'Awarded');
  assert.equal(edition.byProvider['FDID:TX:OTHER'], undefined);
  const ambiguous = departmentAwards('TX', [elmwood, { ...sameNameElsewhere, county: '48001' }], counties);
  assert.equal(ambiguous.byProvider['FDID:TX:AA403'], undefined);
  assert.ok(ambiguous.counters.ambiguous > 0);
});
