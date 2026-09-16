import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEquidistantScore,
  rankEquidistantPlaces,
  formatEquidistantBadge,
  formatMatchTag,
  calculateMeetingRadius,
  isWithinMeetingArea,
  filterMeetingPlaces,
  DEFAULT_MEET_RADIUS_FACTOR,
  DEFAULT_MEET_MAX_RESULTS,
} from '../src/utils/equidistant-ranking.ts';
import type { Place, Coordinates } from '../src/types.ts';

test('calculateEquidistantScore prioritizes balanced travel times over long equal ones', () => {
  const balanced = calculateEquidistantScore(20, 22); // |20-22| + 0.5 * 22 = 2 + 11 = 13
  const farEqual = calculateEquidistantScore(45, 45); // 0 + 22.5 = 22.5
  const unfair = calculateEquidistantScore(5, 35);    // 30 + 17.5 = 47.5

  assert.ok(balanced < farEqual, '20m/22m should score better than 45m/45m');
  assert.ok(farEqual < unfair, '45m/45m should score better than highly unfair 5m/35m');
});

test('calculateEquidistantScore is symmetric with respect to participant order', () => {
  assert.equal(calculateEquidistantScore(18, 24), calculateEquidistantScore(24, 18));
  assert.equal(calculateEquidistantScore(10, 40), calculateEquidistantScore(40, 10));
});

test('calculateEquidistantScore matches the exact formula |A - B| + 0.5 * max(A, B)', () => {
  assert.equal(calculateEquidistantScore(0, 0), 0);
  assert.equal(calculateEquidistantScore(10, 10), 5);
  assert.equal(calculateEquidistantScore(15, 25), 10 + 12.5); // 22.5
});

test('formatEquidistantBadge formats walking and transit route icons and travel times', () => {
  assert.equal(
    formatEquidistantBadge({ minutes: 12, mode: 'transit' }, { minutes: 15, mode: 'transit' }),
    '🚇 12m you · 🚇 15m friend'
  );
  assert.equal(
    formatEquidistantBadge({ minutes: 6, mode: 'walk' }, { minutes: 20, mode: 'transit' }),
    '🚶 6m you · 🚇 20m friend'
  );
  assert.equal(
    formatEquidistantBadge({ minutes: 4, mode: 'walk' }, { minutes: 5, mode: 'walk' }),
    '🚶 4m you · 🚶 5m friend'
  );
});

test('formatMatchTag generates appropriate labels for best and fair matches', () => {
  assert.equal(formatMatchTag(0, true), '★ Best match (Δ 0m)');
  assert.equal(formatMatchTag(2, true), '★ Best match (Δ 2m)');
  assert.equal(formatMatchTag(5, false), 'Fair match (Δ 5m)');
});

test('rankEquidistantPlaces ranks central cafes highest between Gràcia and Poblenou', () => {
  const GRACIA: Coordinates = { latitude: 41.4026, longitude: 2.1589 };
  const POBLENOU: Coordinates = { latitude: 41.4010, longitude: 2.2030 };

  const mockPlaces: Place[] = [
    { id: '1', name: 'Centre Cafe', chain: 'SandwiChez', address: 'Eixample', latitude: 41.3950, longitude: 2.1750 },
    { id: '2', name: 'Gracia Cafe', chain: '365', address: 'Gracia', latitude: 41.4020, longitude: 2.1590 },
    { id: '3', name: 'Badalona Outskirts', chain: 'Granier', address: 'Badalona', latitude: 41.4500, longitude: 2.2470 },
  ];

  const results = rankEquidistantPlaces(mockPlaces, GRACIA, POBLENOU);
  assert.equal(results.length, 3);
  assert.equal(results[0].place.id, '1', 'Middle cafe should be ranked first');
  assert.ok(results[0].isBestMatch, 'First result should have isBestMatch true');
  assert.match(results[0].badgeLabel, /you · .* friend/);
  assert.equal(results[0].deltaMinutes, Math.abs(results[0].timeA - results[0].timeB));
  assert.ok(results[0].score <= results[1].score);
});

test('rankEquidistantPlaces applies secondary tie-breaking by combined distance when scores are equal', () => {
  const originA: Coordinates = { latitude: 41.3800, longitude: 2.1600 };
  const originB: Coordinates = { latitude: 41.3800, longitude: 2.1800 };

  // Place Near is directly on the midpoint segment between A and B
  const placeNear: Place = {
    id: 'near',
    name: 'Direct Midpoint',
    chain: 'SandwiChez',
    address: 'Midpoint Street',
    latitude: 41.3800,
    longitude: 2.1700,
  };
  // Place Offset is on the perpendicular bisector, yielding identical travel times (13m & 13m)
  // but slightly longer combined straight-line distance (1.670km vs 1.669km)
  const placeOffset: Place = {
    id: 'offset',
    name: 'Offset Midpoint',
    chain: '365',
    address: 'Offset Street',
    latitude: 41.3803,
    longitude: 2.1700,
  };

  const results = rankEquidistantPlaces([placeOffset, placeNear], originA, originB);
  assert.equal(results.length, 2);
  assert.equal(results[0].score, results[1].score, 'Scores must be identical to test tie-breaking');
  assert.equal(results[0].timeA, 13);
  assert.equal(results[0].timeB, 13);
  assert.equal(results[1].timeA, 13);
  assert.equal(results[1].timeB, 13);
  assert.equal(results[0].place.id, 'near', 'Place with lower combined distance should rank first on tie-break');
});

test('rankEquidistantPlaces strictly prioritizes score over distance when scores differ', () => {
  const originA: Coordinates = { latitude: 41.3900, longitude: 2.1700 };
  const originB: Coordinates = { latitude: 41.3900, longitude: 2.1900 };

  // Better score, but slightly higher combined distance
  const placeBetterScore: Place = {
    id: 'better',
    name: 'Better Score Cafe',
    chain: 'SandwiChez',
    address: 'Street 1',
    latitude: 41.3900,
    longitude: 2.1800,
  };
  // Slightly worse score (asymmetric), but physically close to originA
  const placeCloserToA: Place = {
    id: 'closer-a',
    name: 'Asymmetric Cafe',
    chain: '365',
    address: 'Street 2',
    latitude: 41.3900,
    longitude: 2.1720,
  };

  const results = rankEquidistantPlaces([placeCloserToA, placeBetterScore], originA, originB);
  assert.ok(results[0].score < results[1].score);
  assert.equal(results[0].place.id, 'better');
});

test('rankEquidistantPlaces marks top 3 as best matches and subsequent as fair matches', () => {
  const originA: Coordinates = { latitude: 41.4000, longitude: 2.1700 };
  const originB: Coordinates = { latitude: 41.4000, longitude: 2.1900 };

  const places: Place[] = [
    { id: '1', name: 'Cafe 1', chain: 'Chain', address: 'Addr 1', latitude: 41.4000, longitude: 2.1800 },
    { id: '2', name: 'Cafe 2', chain: 'Chain', address: 'Addr 2', latitude: 41.4001, longitude: 2.1801 },
    { id: '3', name: 'Cafe 3', chain: 'Chain', address: 'Addr 3', latitude: 41.4002, longitude: 2.1802 },
    { id: '4', name: 'Cafe 4', chain: 'Chain', address: 'Addr 4', latitude: 41.4050, longitude: 2.1850 },
    { id: '5', name: 'Cafe 5', chain: 'Chain', address: 'Addr 5', latitude: 41.4100, longitude: 2.1900 },
  ];

  const results = rankEquidistantPlaces(places, originA, originB);
  assert.equal(results.length, 5);
  assert.equal(results[0].isBestMatch, true);
  assert.equal(results[1].isBestMatch, true);
  assert.equal(results[2].isBestMatch, true);
  assert.equal(results[3].isBestMatch, false);
  assert.equal(results[4].isBestMatch, false);

  assert.match(results[0].matchTag, /^★ Best match/);
  assert.match(results[3].matchTag, /^Fair match/);
});

test('rankEquidistantPlaces handles empty array gracefully', () => {
  const originA: Coordinates = { latitude: 41.4000, longitude: 2.1700 };
  const originB: Coordinates = { latitude: 41.4000, longitude: 2.1900 };

  const results = rankEquidistantPlaces([], originA, originB);
  assert.deepEqual(results, []);
});

test('calculateMeetingRadius computes proportional radius with minimum buffer', () => {
  const dist3km = 3.68;
  const r3km = calculateMeetingRadius(dist3km);
  // With factor 0.58, 3.68 * 0.58 = 2.1344km
  assert.ok(Math.abs(r3km - (dist3km * DEFAULT_MEET_RADIUS_FACTOR)) < 1e-4);

  // For very small distance (e.g. 200m), minimum buffer D/2 + 0.25 should apply
  const distSmall = 0.2;
  const rSmall = calculateMeetingRadius(distSmall);
  assert.equal(rSmall, distSmall / 2 + 0.25);
});

test('isWithinMeetingArea checks whether point is within radius from both origins', () => {
  const originA: Coordinates = { latitude: 41.4000, longitude: 2.1600 };
  const originB: Coordinates = { latitude: 41.4000, longitude: 2.1800 };
  const mid: Coordinates = { latitude: 41.4000, longitude: 2.1700 };
  const distant: Coordinates = { latitude: 41.4500, longitude: 2.1700 };

  const radius = 1.2; // km
  assert.ok(isWithinMeetingArea(mid, originA, originB, radius), 'Midpoint must be within radius of both');
  assert.ok(!isWithinMeetingArea(distant, originA, originB, radius), 'Distant point must not be in intersection area');
});

test('filterMeetingPlaces filters out non-meeting cafes and caps results to maxResults', () => {
  const originA: Coordinates = { latitude: 41.4026, longitude: 2.1589 }; // Gràcia
  const originB: Coordinates = { latitude: 41.4010, longitude: 2.2030 }; // Poblenou

  const mockPlaces: Place[] = [
    { id: 'mid1', name: 'Midpoint Cafe 1', chain: 'Sandwichez', address: 'Eixample', latitude: 41.4000, longitude: 2.1800 },
    { id: 'mid2', name: 'Midpoint Cafe 2', chain: '365 Café', address: 'Eixample', latitude: 41.4015, longitude: 2.1810 },
    { id: 'far-badalona', name: 'Far Away Cafe', chain: 'Granier', address: 'Badalona', latitude: 41.4500, longitude: 2.2470 },
    { id: 'far-aeroport', name: 'Airport Cafe', chain: 'El Fornet', address: 'El Prat', latitude: 41.3000, longitude: 2.0800 },
  ];

  const filtered = filterMeetingPlaces(mockPlaces, originA, originB);
  assert.equal(filtered.length, 2, 'Only the 2 midpoint cafes should pass the filter');
  assert.equal(filtered[0].place.id, 'mid2');
  assert.equal(filtered[1].place.id, 'mid1');
  assert.ok(filtered[0].isBestMatch, 'First result is tagged as best match');
});

test('filterMeetingPlaces respects maxResults parameter', () => {
  const originA: Coordinates = { latitude: 41.4000, longitude: 2.1700 };
  const originB: Coordinates = { latitude: 41.4000, longitude: 2.1900 };

  const mockPlaces: Place[] = Array.from({ length: 20 }, (_, i) => ({
    id: `cafe-${i}`,
    name: `Cafe ${i}`,
    chain: '365 Café',
    address: 'Street',
    latitude: 41.4000 + i * 0.0001,
    longitude: 2.1800,
  }));

  const filtered = filterMeetingPlaces(mockPlaces, originA, originB, { maxResults: 5 });
  assert.equal(filtered.length, 5);
});

test('filterMeetingPlaces returns empty array on empty input', () => {
  const originA: Coordinates = { latitude: 41.4000, longitude: 2.1700 };
  const originB: Coordinates = { latitude: 41.4000, longitude: 2.1900 };

  assert.deepEqual(filterMeetingPlaces([], originA, originB), []);
});

