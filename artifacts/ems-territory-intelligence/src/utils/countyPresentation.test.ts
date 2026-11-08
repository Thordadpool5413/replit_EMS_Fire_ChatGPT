import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCoordinates, normalizePlaceName, uniqueAgencyRecords, uniquePlaceNames } from './countyPresentation';

test('case and whitespace variants collapse within a county while canonical labels remain', () => {
  assert.deepEqual(uniquePlaceNames(['Gainesville', 'High Springs', 'High springs', '  High   Springs ', '', 'Archer']), [
    'Gainesville', 'High Springs', 'Archer',
  ]);
  assert.equal(normalizePlaceName(' HIGH   SPRINGS '), 'high springs');
  assert.deepEqual(uniquePlaceNames(['St. Mary', 'Saint Mary']), ['St. Mary', 'Saint Mary']);
});

test('agency counts use distinct IDs, not names or sums of city matches', () => {
  const first = { id: 'agency-a', name: 'Rescue' };
  const second = { id: 'agency-b', name: 'Rescue' };
  assert.deepEqual(uniqueAgencyRecords([first, first, second, { id: '', name: 'Unknown' }]), [first, second]);
});

test('coordinates use hemispheres without double negative notation', () => {
  assert.equal(formatCoordinates(29.686, -82.354), '29.686°N, 82.354°W');
  assert.equal(formatCoordinates(-33.9, 151.2, 2), '33.90°S, 151.20°E');
  assert.equal(formatCoordinates(0, 0), '0.000°N, 0.000°E');
  assert.equal(formatCoordinates(undefined, -82), 'Not reported');
  assert.equal(formatCoordinates(91, -82), 'Not reported');
  assert.equal(formatCoordinates(29, Number.NaN), 'Not reported');
});
