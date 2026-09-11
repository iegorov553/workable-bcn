import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCameraCommand } from '../src/utils/map-camera.ts';
import { requestLocation, requestLocationIfGranted, LocationRequestError, withTimeout } from '../src/utils/location-request.ts';
import { matchesSearch, parseFavorites } from '../src/utils/places.ts';
import { distanceKm } from '../src/utils/distance.ts';

test('returning to the same coordinates twice still sends two camera commands', () => {
  const calls: unknown[] = [];
  const map = { stop: () => calls.push('stop'), closePopup: () => calls.push('close'), flyTo: (...args: unknown[]) => calls.push(args) };
  applyCameraCommand(map, { latitude: 41.39, longitude: 2.17, requestId: 1 });
  applyCameraCommand(map, { latitude: 41.39, longitude: 2.17, requestId: 2 });
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[2], [[41.39, 2.17], 16, { duration: 0.45 }]);
  assert.deepEqual(calls[5], calls[2]);
});
const provider = () => ({ permission: async () => ({ granted: true, canAskAgain: true }), servicesEnabled: async () => true, current: async () => ({ coords: { latitude: 41.39, longitude: 2.17 } }) });

test('startup restores coordinates for distances with an existing permission', async () => {
  let checks = 0;
  const coords = await requestLocationIfGranted({ ...provider(), permission: async () => { checks++; return { granted: true, canAskAgain: true }; } });
  assert.deepEqual(coords, { latitude: 41.39, longitude: 2.17 });
  assert.equal(checks, 1);
  const nearby = { id: 'near', name: 'Café', chain: 'chain', address: '', latitude: 41.391, longitude: 2.17 };
  assert.ok(distanceKm(nearby, coords)! > 0);
});

test('startup without permission skips GPS and leaves manual location available', async () => {
  const unavailable = { ...provider(), permission: async () => ({ granted: false, canAskAgain: true }), current: async () => { throw Error('GPS must not be called'); } };
  assert.equal(await requestLocationIfGranted(unavailable), null);
  assert.deepEqual(await requestLocation(provider()), { latitude: 41.39, longitude: 2.17 });
});
test('permission denial never calls GPS and exposes settings for permanent denial', async () => {
  let called = false;
  await assert.rejects(requestLocation({ ...provider(), permission: async () => ({ granted: false, canAskAgain: false }), current: async () => { called = true; return {coords:{latitude:0,longitude:0}}; } }), e => e instanceof LocationRequestError && e.settingsAvailable);
  assert.equal(called, false);
});
test('disabled location services and invalid coordinates are handled', async () => {
  await assert.rejects(requestLocation({ ...provider(), servicesEnabled: async () => false }), /turned off/);
  await assert.rejects(requestLocation({ ...provider(), current: async () => ({coords:{latitude:NaN,longitude:2}}) }), /invalid coordinates/);
});
test('a stalled GPS request times out and a subsequent request succeeds', async () => {
  await assert.rejects(requestLocation({ ...provider(), current: () => new Promise(() => {}) }, 10), /15 seconds/);
  assert.deepEqual(await requestLocation(provider()), { latitude: 41.39, longitude: 2.17 });
});
test('late GPS completion after timeout does not deliver stale coordinates', async () => {
  let deliver!: (value: number) => void;
  let received = false;
  const request = withTimeout(new Promise<number>(resolve => { deliver = resolve; }), 5).then(() => { received = true; });
  await assert.rejects(request);
  deliver(42);
  await Promise.resolve();
  assert.equal(received, false);
});
test('favorites reject corrupt structures, remove stale IDs, and deduplicate', () => {
  const valid = new Set(['a','b']);
  for (const value of ['{}','null','"abc"','broken']) assert.equal(parseFavorites(value, valid).size, 0);
  assert.deepEqual([...parseFavorites('["a", "a", "removed", 7, "b"]', valid)], ['a','b']);
});
test('search ignores Catalan accents and apostrophe variants', () => {
  const place={id:'a',chain:'365 Café',name:'Café - Gràcia',address:'Carrer d’Aragó',latitude:0,longitude:0};
  assert.ok(matchesSearch(place,'gracia'));
  assert.ok(matchesSearch(place,"d'Arago"));
  assert.ok(matchesSearch(place,'cafe'));
});
test('distance stays finite at antipodes and is zero at the origin', () => {
  const place={id:'a',chain:'a',name:'a',address:'a',latitude:0,longitude:180};
  assert.ok(Number.isFinite(distanceKm(place,{latitude:0,longitude:0})));
  assert.equal(distanceKm(place,place),0);
  assert.equal(distanceKm(place,null),null);
});
