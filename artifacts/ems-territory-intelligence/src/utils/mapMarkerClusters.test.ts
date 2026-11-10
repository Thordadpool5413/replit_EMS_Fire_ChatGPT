import assert from 'node:assert/strict';
import test from 'node:test';
import { groupOverlappingMapMarkers } from './mapMarkerClusters';

const marker = (id: string, latitude: number, longitude: number) => ({
  id,
  latitude,
  longitude,
});

test('handles an empty plotted territory', () => {
  assert.deepEqual(groupOverlappingMapMarkers([], 10), []);
});

test('preserves a single agency including zero-valued coordinates', () => {
  const agency = marker('single', 0, 0);
  assert.deepEqual(groupOverlappingMapMarkers([agency], 12), [[agency]]);
});

test('keeps separated agencies individually inspectable without mutating input', () => {
  const agencies = Object.freeze([
    Object.freeze(marker('chicago', 41.88, -87.63)),
    Object.freeze(marker('springfield', 39.8, -89.65)),
    Object.freeze(marker('peoria', 40.69, -89.59)),
  ]);
  const groups = groupOverlappingMapMarkers(agencies, 10);
  assert.deepEqual(groups, agencies.map((agency) => [agency]));
  assert.equal(new Set(groups.flat()).size, agencies.length);
});

test('retains every agency in a transitive overlap chain', () => {
  const agencies = [
    marker('left', 41.88, -87.63),
    marker('middle', 41.88, -87.615),
    marker('right', 41.88, -87.6),
  ];
  assert.deepEqual(groupOverlappingMapMarkers(agencies, 12), [agencies]);
});

test('groups overlapping marker badges at common territory zoom levels', () => {
  const groups = groupOverlappingMapMarkers(
    [
      marker('agency-a', 41.88, -87.63),
      marker('agency-b', 41.88, -87.625),
      marker('agency-c', 41.88, -87.5),
    ],
    12,
  );

  assert.deepEqual(
    groups.map((group) => group.map(({ id }) => id)),
    [['agency-a', 'agency-b'], ['agency-c']],
  );
});

test('separates close locations again when zoom makes their badges distinct', () => {
  const groups = groupOverlappingMapMarkers(
    [
      marker('agency-a', 41.88, -87.63),
      marker('agency-b', 41.88, -87.625),
    ],
    17,
  );

  assert.equal(groups.length, 2);
});

test('keeps markers at identical coordinates in one inspectable group', () => {
  const groups = groupOverlappingMapMarkers(
    [
      marker('agency-a', 0, 0),
      marker('agency-b', 0, 0),
    ],
    13,
  );

  assert.deepEqual(groups.map((group) => group.length), [2]);
});
