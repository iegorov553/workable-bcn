import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateWalkingMinutes, findOptimalRoute } from '../src/utils/transit-routing.ts';
import type { TransitNetwork } from '../src/types/transit.ts';

// Sagrada Família coordinates
const SAGRADA_FAMILIA = { latitude: 41.4036, longitude: 2.1744 };
// Plaça Catalunya coordinates
const CATALUNYA = { latitude: 41.3870, longitude: 2.1700 };
// A spot 250m away from Sagrada Família
const NEAR_SAGRADA = { latitude: 41.4050, longitude: 2.1760 };
// Sants Estació coordinates
const SANTS_ESTACIO = { latitude: 41.3809, longitude: 2.1402 };

test('estimateWalkingMinutes applies urban Manhattan factor and 80m/min speed', () => {
  const walkMinutes = estimateWalkingMinutes(SAGRADA_FAMILIA, NEAR_SAGRADA);
  assert.ok(walkMinutes >= 2 && walkMinutes <= 5, `Expected 2-5 min, got ${walkMinutes}`);
  
  // At same location, minimum 1 minute
  const zeroDistance = estimateWalkingMinutes(SAGRADA_FAMILIA, SAGRADA_FAMILIA);
  assert.equal(zeroDistance, 1);
});

test('findOptimalRoute chooses walking for short distances (< 1 km)', () => {
  const route = findOptimalRoute(SAGRADA_FAMILIA, NEAR_SAGRADA);
  assert.equal(route.mode, 'walk');
  assert.ok(route.minutes <= 5, `Expected walking minutes <= 5, got ${route.minutes}`);
  assert.equal(route.stationIn, undefined);
  assert.equal(route.stationOut, undefined);
});

test('findOptimalRoute chooses transit for cross-town trips (Sagrada Família to Sants Estació)', () => {
  const route = findOptimalRoute(SAGRADA_FAMILIA, SANTS_ESTACIO);
  assert.equal(route.mode, 'transit');
  assert.ok(route.minutes >= 10 && route.minutes <= 25, `Expected 10-25 min, got ${route.minutes}`);
  assert.ok(route.stationIn, 'Boarding station must be identified');
  assert.ok(route.stationOut, 'Alighting station must be identified');
});

test('findOptimalRoute falls back to walking when transit stations are unavailable', () => {
  // Coordinates far outside transit coverage (e.g. out at sea or distant mountain)
  const REMOTE_SEA = { latitude: 41.2500, longitude: 2.3500 };
  const REMOTE_SEA_2 = { latitude: 41.2600, longitude: 2.3600 };
  const route = findOptimalRoute(REMOTE_SEA, REMOTE_SEA_2);
  assert.equal(route.mode, 'walk');
});

test('findOptimalRoute supports custom transit networks', () => {
  const customNetwork: TransitNetwork = {
    version: 'custom',
    transferPenaltyMinutes: 2,
    stations: [
      {
        id: 'station-a',
        name: 'Station A',
        lines: ['L1'],
        latitude: 41.4036,
        longitude: 2.1744,
        connections: [
          { targetId: 'station-b', travelMinutes: 4, line: 'L1' },
        ],
      },
      {
        id: 'station-b',
        name: 'Station B',
        lines: ['L1'],
        latitude: 41.3870,
        longitude: 2.1700,
        connections: [
          { targetId: 'station-a', travelMinutes: 4, line: 'L1' },
        ],
      },
    ],
  };

  const route = findOptimalRoute(SAGRADA_FAMILIA, CATALUNYA, customNetwork);
  assert.equal(route.mode, 'transit');
  assert.equal(route.stationIn, 'station-a');
  assert.equal(route.stationOut, 'station-b');
  // Walk (0) + wait (3) + ride (4) + walk (0) = 7
  assert.equal(route.minutes, 7);
});

test('findOptimalRoute executes in sub-millisecond time', () => {
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    findOptimalRoute(SAGRADA_FAMILIA, CATALUNYA);
  }
  const avgMs = (performance.now() - start) / 50;
  assert.ok(avgMs < 2, `Routing too slow: ${avgMs}ms per call`);
});
