import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistanceMeters,
  buildSearchQuery,
  matchCandidate,
  parseArgs,
} from '../scripts/audit-google-places.mjs';

// Re-export formulas for compatibility with tests expecting exports from this module
export { haversineDistanceMeters, buildSearchQuery, matchCandidate };

test('haversineDistanceMeters computes accurate distance between Barcelona locations', () => {
  // Plaça Catalunya to Arc de Triomf is ~900-1000m
  const dist = haversineDistanceMeters(41.3870, 2.1700, 41.3910, 2.1806);
  assert.ok(dist > 900 && dist < 1100, `Expected ~1000m, got ${dist}`);
});

test('haversineDistanceMeters returns 0 for identical coordinates', () => {
  assert.equal(haversineDistanceMeters(41.3870, 2.1700, 41.3870, 2.1700), 0);
});

test('buildSearchQuery formats clean query stripping district suffixes', () => {
  const query = buildSearchQuery('365 Café', '365 Café - Balmes 206', 'Carrer Balmes, 206 · Sarrià-Sant Gervasi');
  assert.equal(query, '365 Café Carrer Balmes, 206 Barcelona');
});

test('buildSearchQuery formats query when no middle-dot delimiter is present', () => {
  const query = buildSearchQuery('Santagloria', 'Santagloria', 'Carrer de Provença 250');
  assert.equal(query, 'Santagloria Carrer de Provença 250 Barcelona');
});

test('buildSearchQuery falls back to name when chain is empty', () => {
  const query = buildSearchQuery('', 'Nomad Coffee Lab', 'Carrer de Pujades, 95 · Poblenou');
  assert.equal(query, 'Nomad Coffee Lab Carrer de Pujades, 95 Barcelona');
});

test('matchCandidate returns NOT_FOUND when candidate list is empty', () => {
  const result = matchCandidate(41.3870, 2.1700, []);
  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.best, null);
});

test('matchCandidate returns NOT_FOUND when candidates lack coordinates', () => {
  const result = matchCandidate(41.3870, 2.1700, [{} as any, { location: null } as any]);
  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.best, null);
});

test('matchCandidate returns closest candidate within 150m with OPERATIONAL status', () => {
  const candidates = [
    { id: 'far', location: { latitude: 41.3880, longitude: 2.1710 }, businessStatus: 'OPERATIONAL' },
    { id: 'close', location: { latitude: 41.3871, longitude: 2.1701 }, businessStatus: 'OPERATIONAL' },
  ];
  const result = matchCandidate(41.3870, 2.1700, candidates);
  assert.equal(result.status, 'OPERATIONAL');
  assert.equal(result.best.id, 'close');
  assert.ok(result.best.distanceMeters < 30);
});

test('matchCandidate categorizes CLOSED_PERMANENTLY and CLOSED_TEMPORARILY', () => {
  const closedPerm = [
    { id: 'perm', location: { latitude: 41.3871, longitude: 2.1701 }, businessStatus: 'CLOSED_PERMANENTLY' },
  ];
  const resultPerm = matchCandidate(41.3870, 2.1700, closedPerm);
  assert.equal(resultPerm.status, 'CLOSED_PERMANENTLY');

  const closedTemp = [
    { id: 'temp', location: { latitude: 41.3871, longitude: 2.1701 }, businessStatus: 'CLOSED_TEMPORARILY' },
  ];
  const resultTemp = matchCandidate(41.3870, 2.1700, closedTemp);
  assert.equal(resultTemp.status, 'CLOSED_TEMPORARILY');
});

test('matchCandidate detects DISTANCE_MISMATCH when closest candidate exceeds 150m', () => {
  const candidates = [
    { id: 'far', location: { latitude: 41.3910, longitude: 2.1806 }, businessStatus: 'OPERATIONAL' },
  ];
  const result = matchCandidate(41.3870, 2.1700, candidates, 150);
  assert.equal(result.status, 'DISTANCE_MISMATCH');
  assert.equal(result.best.id, 'far');
  assert.ok(result.best.distanceMeters > 150);
});

test('parseArgs correctly parses CLI flags', () => {
  const flags = parseArgs(['--apply', '--api-key=testkey123', '--limit=25', '--cache-file=custom-cache.json']);
  assert.equal(flags.apply, true);
  assert.equal(flags.apiKey, 'testkey123');
  assert.equal(flags.limit, 25);
  assert.ok(flags.cacheFile.endsWith('custom-cache.json'));
});
