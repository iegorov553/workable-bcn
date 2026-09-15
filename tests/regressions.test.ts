import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCameraCommand } from '../src/utils/map-camera.ts';
import { requestLocation, requestLocationIfGranted, LocationRequestError, withTimeout } from '../src/utils/location-request.ts';
import { matchesSearch, parseFavorites } from '../src/utils/places.ts';
import { distanceKm } from '../src/utils/distance.ts';
import { rankEquidistantPlaces } from '../src/utils/equidistant-ranking.ts';
import { decodeMapPayload, encodeMapPayload, parseMapMessage } from '../src/utils/map-bridge.ts';
import type { Place, Coordinates } from '../src/types.ts';

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
test('a stalled GPS request falls back to lastKnown when available', async () => {
  const stalledWithLastKnown = {
    ...provider(),
    current: () => new Promise<never>(() => {}),
    lastKnown: async () => ({ coords: { latitude: 41.385, longitude: 2.165 }, timestamp: Date.now() - 60000 }),
  };
  const coords = await requestLocation(stalledWithLastKnown, 10);
  assert.deepEqual(coords, { latitude: 41.385, longitude: 2.165 });
});
test('a stalled GPS request with invalid lastKnown coordinates still rejects with timeout', async () => {
  const stalledWithInvalidLastKnown = {
    ...provider(),
    current: () => new Promise<never>(() => {}),
    lastKnown: async () => ({ coords: { latitude: NaN, longitude: 2.165 }, timestamp: Date.now() }),
  };
  await assert.rejects(requestLocation(stalledWithInvalidLastKnown, 10), /15 seconds/);
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

test('PlaceCard source defines and supports matchBadge, isBestMatch, and onShareFriend', () => {
  const source = readFileSync(new URL('../src/components/PlaceCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /matchBadge\?: string \| null;/);
  assert.match(source, /isBestMatch\?: boolean;/);
  assert.match(source, /onShareFriend\?: \(\) => void;/);
  assert.match(source, /isBestMatch \? s\.matchBadgeBest : s\.matchBadgeNeutral/);
  assert.match(source, /onShareFriend/);
  assert.match(source, /share-social-outline/);
});

test('MapCanvas and MapCanvas.web accept friendLocation, meetMode, and forward onMapClick', () => {
  const nativeSource = readFileSync(new URL('../src/components/MapCanvas.tsx', import.meta.url), 'utf8');
  const webSource = readFileSync(new URL('../src/components/MapCanvas.web.tsx', import.meta.url), 'utf8');

  // Verify props and click forwarding in native component
  assert.match(nativeSource, /onMapClick\?: \(coords: Coordinates\) => void;/);
  assert.match(nativeSource, /friendLocation/);
  assert.match(nativeSource, /meetMode/);
  assert.match(nativeSource, /topMatchIds/);
  assert.match(nativeSource, /showMetro/);
  assert.match(nativeSource, /orientation/);
  assert.ok(nativeSource.includes("if (message?.type === 'mapClick') onMapClick?.({ latitude: message.latitude, longitude: message.longitude });"));

  // Verify props and click forwarding in web component
  assert.match(webSource, /friendLocation/);
  assert.match(webSource, /meetMode/);
  assert.match(webSource, /topMatchIds/);
  assert.match(webSource, /showMetro/);
  assert.match(webSource, /orientation/);
  assert.ok(webSource.includes("if (message?.type === 'mapClick') onMapClick?.({ latitude: message.latitude, longitude: message.longitude });"));

  // Simulate MapCanvas message forwarding
  let receivedCoords: Coordinates | null = null;
  const mockOnMapClick = (coords: Coordinates) => {
    receivedCoords = coords;
  };
  const clickEventData = JSON.stringify({ type: 'mapClick', latitude: 41.3892, longitude: 2.1601 });
  const parsed = parseMapMessage(clickEventData);
  assert.ok(parsed && parsed.type === 'mapClick');
  if (parsed.type === 'mapClick') {
    mockOnMapClick({ latitude: parsed.latitude, longitude: parsed.longitude });
  }
  assert.deepEqual(receivedCoords, { latitude: 41.3892, longitude: 2.1601 });

  // Verify encodeMapPayload includes friendLocation, meetMode, topMatchIds, and showMetro
  const payload = encodeMapPayload({
    places: [],
    selectedId: null,
    userLocation: { latitude: 41.38, longitude: 2.15 },
    friendLocation: { latitude: 41.40, longitude: 2.18 },
    meetMode: true,
    cameraCommand: null,
    topMatchIds: ['cafe1', 'cafe2'],
    showMetro: true,
  });
  const decoded = decodeMapPayload(payload);
  assert.deepEqual(decoded.friendLocation, { latitude: 41.40, longitude: 2.18 });
  assert.equal(decoded.meetMode, true);
  assert.deepEqual(decoded.topMatchIds, ['cafe1', 'cafe2']);
  assert.equal(decoded.showMetro, true);
});

test('meet mode distance check accurately detects origins > 35 km apart', () => {
  const bcnCenter = { latitude: 41.3879, longitude: 2.1699 };
  const vilanova = { latitude: 41.2230, longitude: 1.7250 }; // ~42 km from BCN
  const badalona = { latitude: 41.4500, longitude: 2.2470 }; // ~9.4 km from BCN

  const distFar = distanceKm(bcnCenter, vilanova);
  assert.ok(distFar !== null && distFar > 35, `Vilanova should be > 35km away, got ${distFar}`);

  const distNear = distanceKm(bcnCenter, badalona);
  assert.ok(distNear !== null && distNear < 35, `Badalona should be < 35km away, got ${distNear}`);
});

test('rankEquidistantPlaces preserves catalogue stability, favorites, and deterministic ordering', () => {
  const places = JSON.parse(readFileSync(new URL('../src/data/places.json', import.meta.url), 'utf8')) as Place[];
  const userLoc: Coordinates = { latitude: 41.3809, longitude: 2.1400 }; // Sants Estació
  const friendLoc: Coordinates = { latitude: 41.4036, longitude: 2.1744 }; // Sagrada Família

  const rankedAll = rankEquidistantPlaces(places, userLoc, friendLoc);
  assert.equal(rankedAll.length, places.length, 'All places from catalogue must be present in ranked output');

  const originalIds = new Set(places.map(p => p.id));
  const rankedIds = new Set(rankedAll.map(m => m.place.id));
  assert.deepEqual(rankedIds, originalIds, 'No places should be lost or added during ranking');

  // Verify strictly non-decreasing scores
  for (let i = 1; i < rankedAll.length; i++) {
    assert.ok(
      rankedAll[i].score >= rankedAll[i - 1].score - 1e-6,
      `Places must be ordered by fairness score ascending: ${rankedAll[i - 1].score} <= ${rankedAll[i].score}`
    );
  }

  // Verify top 3 best match tagging
  const bestMatches = rankedAll.filter(m => m.isBestMatch);
  assert.equal(bestMatches.length, Math.min(3, places.length));
  for (const best of bestMatches) {
    assert.ok(best.matchTag.startsWith('★ Best match'));
  }
  const fairMatches = rankedAll.slice(3);
  for (const fair of fairMatches) {
    assert.ok(fair.matchTag.startsWith('Fair match'));
  }

  // Verify badgeLabel contains route mode emoji and participant mentions
  for (const match of rankedAll) {
    assert.match(match.badgeLabel, /(🚇|🚶) \d+m you · (🚇|🚶) \d+m friend/);
  }

  // Stability: second call produces identical ordering
  const rankedAgain = rankEquidistantPlaces(places, userLoc, friendLoc);
  assert.deepEqual(
    rankedAgain.map(m => m.place.id),
    rankedAll.map(m => m.place.id),
    'Repeated ranking must be deterministic and stable'
  );

  // Favorites preservation
  const favoriteIds = new Set([places[0].id, places[10].id, places[25].id]);
  const favoritePlaces = places.filter(p => favoriteIds.has(p.id));
  const rankedFavorites = rankEquidistantPlaces(favoritePlaces, userLoc, friendLoc);
  assert.equal(rankedFavorites.length, 3);
  assert.deepEqual(new Set(rankedFavorites.map(m => m.place.id)), favoriteIds);
});

test('NoteModal exports valid component and NoteModalProps interface', () => {
  const source = readFileSync(new URL('../src/components/NoteModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /export function NoteModal\(/);
  assert.match(source, /export type NoteModalProps =/);
  assert.match(source, /visible: boolean;/);
  assert.match(source, /place: Place \| null;/);
  assert.match(source, /initialNote\?: string;/);
  assert.match(source, /onClose: \(\) => void;/);
  assert.match(source, /onSave: \(text: string\) => void;/);
  assert.match(source, /onDelete\?: \(\) => void;/);
  assert.match(source, /DEFAULT_MAX_NOTE_LENGTH/);
  assert.match(source, /Haptics/);
});

test('PlaceCard source defines and supports note and onEditNote props', () => {
  const source = readFileSync(new URL('../src/components/PlaceCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /note\?: string;/);
  assert.match(source, /onEditNote\?: \(\) => void;/);
  assert.match(source, /onEditNote/);
  assert.match(source, /YOUR NOTE/);
  assert.match(source, /Add note/);
});

test('App integrates notes persistence, state, NoteModal, and PlaceCard wiring', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{[^}]*parseNotes[^}]*\}\s*from\s*['"]\.\/src\/utils\/notes['"]/);
  assert.match(source, /import\s*\{[^}]*NoteModal[^}]*\}\s*from\s*['"]\.\/src\/components\/NoteModal['"]/);
  assert.match(source, /const\s+NOTES_KEY\s*=\s*'workable-bcn:notes:v1';/);
  assert.match(source, /const\s*\[notes,\s*setNotes\]\s*=\s*useState<Record<string,\s*string>>\(\{\}\);/);
  assert.match(source, /const\s*\[editingPlace,\s*setEditingPlace\]\s*=\s*useState<Place\s*\|\s*null>\(null\);/);
  assert.match(source, /const\s+saveNotesQueue\s*=\s*useRef\(Promise\.resolve\(\)\);/);
  assert.match(source, /AsyncStorage\.getItem\(NOTES_KEY\)/);
  assert.match(source, /parseNotes\(value,\s*validIds\)/);
  assert.match(source, /saveNote\s*=\s*\(placeId:\s*string,\s*text:\s*string\)/);
  assert.match(source, /deleteNote\s*=\s*\(placeId:\s*string\)/);
  assert.match(source, /note=\{notes\[selected\.id\]\}/);
  assert.match(source, /onEditNote=\{\(\)\s*=>\s*setEditingPlace\(selected\)\}/);
  assert.match(source, /note=\{notes\[item\.id\]\}/);
  assert.match(source, /onEditNote=\{\(\)\s*=>\s*setEditingPlace\(item\)\}/);
  assert.match(source, /<NoteModal/);
});

test('NoteModal renders as half-screen sheet with safe area insets and dismiss backdrop', () => {
  const source = readFileSync(new URL('../src/components/NoteModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /useSafeAreaInsets/);
  assert.match(source, /useWindowDimensions/);
  assert.match(source, /statusBarTranslucent/);
  assert.match(source, /navigationBarTranslucent/);
  assert.match(source, /transparent/);
  assert.match(source, /sheetHeight/);
  assert.match(source, /insets\.bottom/);
  assert.match(source, /handleBar/);
  assert.match(source, /keyboardHeight/);
});

test('App header renders Workable BCN, Meet, and place count in single row without FIND YOUR SPOT and omits mapSummary hover', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /FIND YOUR SPOT/);
  assert.doesNotMatch(source, /mapSummary/);
  assert.match(source, /<Text numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.75\} style=\{s\.brand\}>Workable BCN<\/Text>/);
  assert.match(source, /meetToggle/);
  assert.match(source, /countBadge/);
});
