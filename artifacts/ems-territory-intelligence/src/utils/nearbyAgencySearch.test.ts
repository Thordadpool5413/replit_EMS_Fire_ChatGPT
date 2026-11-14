import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Agency } from '../types';
import { distanceMilesBetween, findNearbyAgencies } from './nearbyAgencySearch';

const agencyAt = (id: string, name: string, latitude: number, longitude: number): Agency =>
  ({ id, name, latitude, longitude } as Agency);

test('distance calculation returns zero for the same point and a sensible one-degree distance', () => {
  assert.equal(distanceMilesBetween({ lat: 40, lng: -75 }, { lat: 40, lng: -75 }), 0);
  assert.ok(Math.abs(distanceMilesBetween({ lat: 40, lng: -75 }, { lat: 41, lng: -75 }) - 69) < 1);
});

test('nearby agencies are radius-filtered and sorted by straight-line distance', () => {
  const far = agencyAt('far', 'Far station', 40.5, -75);
  const closest = agencyAt('closest', 'Closest station', 40.01, -75);
  const middle = agencyAt('middle', 'Middle station', 40.1, -75);
  const results = findNearbyAgencies([far, middle, closest], { lat: 40, lng: -75 }, 10);

  assert.deepEqual(results.map(({ agency }) => agency.id), ['closest', 'middle']);
  assert.ok(results[0].distanceMiles < results[1].distanceMiles);
});

test('nearby search omits missing, invalid, and unmapped-zero coordinates', () => {
  const results = findNearbyAgencies([
    agencyAt('valid', 'Valid location', 40.02, -75),
    agencyAt('zero', 'Unmapped location', 0, 0),
    agencyAt('invalid', 'Invalid location', 95, -75),
  ], { lat: 40, lng: -75 }, 25);

  assert.deepEqual(results.map(({ agency }) => agency.id), ['valid']);
});

test('nearby search returns no matches until a valid device location is available', () => {
  const agencies = [agencyAt('one', 'One', 40, -75)];
  assert.deepEqual(findNearbyAgencies(agencies, null, 25), []);
  assert.deepEqual(findNearbyAgencies(agencies, { lat: 95, lng: 0 }, 25), []);
});

test('the valid geographic origin is accepted as a device location but not as an agency map point', () => {
  const nearby = agencyAt('near', 'Near the origin', 0.01, 0);
  const unmapped = agencyAt('unmapped', 'Unmapped', 0, 0);
  const results = findNearbyAgencies([nearby, unmapped], { lat: 0, lng: 0 }, 1);

  assert.deepEqual(results.map(({ agency }) => agency.id), ['near']);
});
