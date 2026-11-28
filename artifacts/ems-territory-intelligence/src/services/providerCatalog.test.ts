import { matchedWorkspaceAgency, savedDepartmentRef } from './matchedWorkspaceFacts';
import type { Agency } from '../types';
import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentProfile, departmentAliases } from './departmentIdentity';
import { filterProviders, type DirectoryProvider } from './providerCatalog';
import { countyViewport, worldPoint } from './countyMapProjection';

test('a municipal fire and EMS service opens one profile from a license or billing record', () => {
  for (const [source, id, target] of [
    ['state-ems', '502', '19011'],
    ['state-ems', '518', '19052'],
    ['state-ems', '514', '19172'],
    ['registry', 'nppes:1265816391', '19172'],
  ] as const)
    assert.deepEqual(departmentProfile({ state: 'FL', source, id }), {
      state: 'FL',
      source: 'registry',
      id: 'usfa:FL:' + target,
    });
  assert.ok(departmentAliases('FL', 'FDID:FL:19172').includes('NPI:1265816391'));
});

test('a station municipality is paired with its own county when searching a combined department', () => {
  const row: DirectoryProvider = {
    ref: { source: 'neris', state: 'NY', id: 'FD1' },
    name: 'County Fire',
    city: 'Riverton',
    county: '36001',
    zip: '12345',
    kind: 'combined',
    aliases: ['Town Ambulance'],
    otherPlaces: [{ city: 'Kingston', county: '36003', basis: 'Reported station' }],
  };
  for (const category of ['ems', 'fire'] as const)
    assert.deepEqual(
      filterProviders([row], { category, countyFips: '36003', city: 'Kingston', query: 'Town Ambulance' }),
      [row],
    );
  assert.equal(
    filterProviders([row], { category: 'all', countyFips: '36001', city: 'Kingston' }).length,
    0,
  );
});

test('county imagery and marker coordinates fit on either side of the international date line', () => {
  const county = {
    centroid: { lat: 52, lng: -179.9 },
    bbox: [179.5, 51.8, -179.5, 52.2] as [number, number, number, number],
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [179.5, 51.8],
          [-179.5, 51.8],
          [-179.5, 52.2],
          [179.5, 52.2],
          [179.5, 51.8],
        ],
      ],
    },
  };
  const map = countyViewport(county, 1);
  assert.ok(map.tiles.length > 0 && map.tiles.length < 50);
  for (const lng of [179.5, -179.5]) {
    const [x, y] = map.project(worldPoint(52, lng, county.centroid.lng));
    assert.ok(x > 0 && x < 640 && y > 0 && y < 360);
  }
  for (const tile of map.tiles) {
    const [z, y, x] = tile.id.split('/').map(Number);
    assert.ok(x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z);
  }
});

test('saved accounts match the same department as the public license and keep generated or cross-state records separate', () => {
  const cocoa = {
    stateCode: 'FL',
    registryIdentity: {
      sourceName: 'State EMS',
      identifierKind: 'license',
      identifier: '518',
      stateCode: 'FL',
    },
    sourceRecordAssociations: [],
  } as unknown as Agency;
  assert.deepEqual(savedDepartmentRef(cocoa), { source: 'registry', state: 'FL', id: 'usfa:FL:19052' });
  assert.equal(savedDepartmentRef({ ...cocoa, stateCode: 'GA' }), undefined);
  assert.equal(savedDepartmentRef({ ...cocoa, dataProvenanceTier: 'generated_prospect' }), undefined);
});

test('statewide county review includes only profiles without either a recorded county or a documented service area', () => {
  const row: DirectoryProvider = {
    ref: { source: 'registry', state: 'VA', id: 'usfa:VA:01300' },
    name: 'Arlington County Fire Department', city: 'Arlington', county: '', zip: '22201', kind: 'combined',
  };
  const withServiceArea = {
    ...row,
    otherPlaces: [{ county: '51610', city: 'Falls Church', basis: 'Documented fire and EMS service agreement' }],
  };
  assert.deepEqual(filterProviders([row, withServiceArea], { category: 'all', unassignedOnly: true }), [row]);
  assert.deepEqual(filterProviders([row, withServiceArea], { category: 'ems', countyFips: '51610' }), [withServiceArea]);
});

test('private records resolve to one saved account on both fire and EMS routes', () => {
  const source = { state: 'FL', source: 'state-ems', id: '518' } as const;
  const cocoa = {
    id: 'cocoa',
    stateCode: 'FL',
    registryIdentity: {
      sourceName: 'State EMS', identifierKind: 'license', identifier: '518', stateCode: 'FL',
    },
    sourceRecordAssociations: [],
  } as unknown as Agency;
  assert.equal(matchedWorkspaceAgency(source, [cocoa]), cocoa);
  assert.equal(matchedWorkspaceAgency(departmentProfile(source), [cocoa]), cocoa);
  assert.equal(matchedWorkspaceAgency(source, [cocoa, { ...cocoa, id: 'second-cocoa' }]), undefined);
  assert.equal(matchedWorkspaceAgency(source, [{ ...cocoa, stateCode: 'TX' }]), undefined);
  assert.equal(matchedWorkspaceAgency(source, [{ ...cocoa, dataProvenanceTier: 'generated_prospect' }]), undefined);
});
