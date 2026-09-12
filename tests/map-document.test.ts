import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { encodeMapPayload, mapUpdateScript, parseMapMessage } from '../src/utils/map-bridge.ts';

test('bundled document matches source and contains no Expo DOM bootstrap or remote code', async () => {
  const build = await import(new URL('../scripts/build-map.mjs', import.meta.url).href);
  const html = await build.buildMapDocument();
  assert.doesNotMatch(html, /EXPO_DOM_HOST_OS|injectedObjectJson|<script[^>]+src=|url\(images\//);
  assert.match(html, /BSD 2-Clause License/);
  assert.equal(readFileSync(new URL('../src/map/map-html.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), (await build.generatedMapSource()).replace(/\r\n/g, '\n'));
});

test('native map starts without injected globals, receives latest state and emits selection', () => {
  const messages: string[] = [];
  const camera: unknown[] = [];
  const markers: any[] = [];
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const map = { stop() {}, closePopup() {}, invalidateSize() {}, flyTo(...args: unknown[]) { camera.push(args); } };
  const window: any = { ReactNativeWebView: { postMessage(data: string) { messages.push(data); } }, addEventListener() {} };
  const context = { window, document: { getElementById: element, createElement: element }, L: {
    map: () => map,
    tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
    circleMarker: () => {
      const marker = { events: {} as Record<string, () => void>, removed: false, bindPopup() { return this; }, addTo() { return this; }, on(event: string, callback: () => void) { this.events[event] = callback; return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() { this.removed = true; } };
      markers.push(marker); return marker;
    },
  } };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);
  assert.deepEqual(parseMapMessage(messages[0]), { type: 'ready' });
  const place = { id: 'cafe', name: 'Café ` " ${text} ☕', chain: 'test', address: 'Barcelona', latitude: 41.389, longitude: 2.169 };
  const state = { places: [place], selectedId: null, userLocation: null, cameraCommand: { latitude: 41.389, longitude: 2.169, requestId: 1 }, chainColors: {} };
  const deliver = () => runInNewContext(mapUpdateScript(encodeMapPayload(state)), context);
  deliver(); deliver(); // ready + loadEnd must not repeat a camera command
  assert.equal(markers.length, 1);
  assert.equal(camera.length, 1);
  markers[0].events.click();
  assert.deepEqual(parseMapMessage(messages.at(-1)!), { type: 'select', id: 'cafe' });
  state.cameraCommand.requestId = 2; deliver();
  assert.equal(camera.length, 2);
  state.places = []; deliver();
  assert.equal(markers[0].removed, true);
});

test('map messages reject malformed data and invalid selections', () => {
  for (const data of ['null', '{}', 'bad JSON', '{"type":"select","id":123}', '{"type":"unknown"}']) assert.equal(parseMapMessage(data), null);
});

test('bundled document includes CARTO Voyager tile layer and transit overlay', async () => {
  const build = await import(new URL('../scripts/build-map.mjs', import.meta.url).href);
  const html = await build.buildMapDocument();
  assert.match(html, /basemaps\.cartocdn\.com\/rastertiles\/voyager/);
  assert.match(html, /__TRANSIT_OVERLAY__/);
  assert.match(html, /CARTO/);
});

test('map runtime toggles metro overlay layer when showMetro changes', () => {
  let layerGroupAdded = false;
  let layerGroupRemoved = false;
  const dummyLayer = {
    addTo(target: any) { layerGroupAdded = true; layerGroupRemoved = false; return this; },
    remove() { layerGroupRemoved = true; layerGroupAdded = false; return this; },
    addLayer() { return this; },
  };
  const map = {
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
    hasLayer(layer: any) { return layerGroupAdded; },
    createPane() { return { style: {} }; },
  };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    __TRANSIT_OVERLAY__: {
      segments: [{ line: 'L1', coords: [[41.38, 2.15], [41.39, 2.16]] }],
      stations: [{ name: 'Test Station', lines: ['L1'], coords: [41.38, 2.15] }],
    },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; }, on() { return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() {} }),
      polyline: () => ({ addTo() { return this; } }),
      layerGroup: () => dummyLayer,
    },
  };

  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  // Initial state with showMetro: true
  const stateWithMetro = { places: [], selectedId: null, userLocation: null, cameraCommand: null, showMetro: true };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateWithMetro)), context);
  assert.equal(layerGroupAdded, true);
  assert.equal(layerGroupRemoved, false);

  // Update with showMetro: false
  const stateWithoutMetro = { places: [], selectedId: null, userLocation: null, cameraCommand: null, showMetro: false };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateWithoutMetro)), context);
  assert.equal(layerGroupAdded, false);
  assert.equal(layerGroupRemoved, true);
});
