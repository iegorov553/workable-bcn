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
      circleMarker: () => ({ bindPopup() { return this; }, bindTooltip() { return this; }, addTo() { return this; }, on() { return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() {} }),
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

test('build-map prepares transit overlay with tram tags, interchange flags, and station properties', async () => {
  const build = await import(new URL('../scripts/build-map.mjs', import.meta.url).href);
  const html = await build.buildMapDocument();
  const match = html.match(/const __TRANSIT_OVERLAY__ = (\{.+?\});<\/script>/);
  assert.ok(match, 'transit overlay global must be injected');
  const overlay = JSON.parse(match[1]);

  const tramSegment = overlay.segments.find((s: any) => s.line === 'T1' || s.line === 'T4');
  assert.ok(tramSegment, 'tram segment should exist');
  assert.equal(tramSegment.isTram, true);

  const metroSegment = overlay.segments.find((s: any) => s.line === 'L1');
  assert.ok(metroSegment, 'metro segment should exist');
  assert.equal(metroSegment.isTram, false);

  const tramStation = overlay.stations.find((s: any) => s.name === 'Auditori | Teatre Nacional' || s.lines.every((l: string) => l.startsWith('T')));
  assert.ok(tramStation, 'tram station should exist');
  assert.equal(tramStation.isTramOnly, true);

  const interchangeStation = overlay.stations.find((s: any) => s.lines.length > 1);
  assert.ok(interchangeStation, 'interchange station should exist');
  assert.equal(interchangeStation.isInterchange, true);
});

test('transit overlay distinguishes tram lines with dashed pattern, distinct markers, and labels', () => {
  const polylines: any[] = [];
  const markers: any[] = [];
  const tooltips: any[] = [];
  const dummyLayer = {
    addTo() { return this; },
    remove() { return this; },
    addLayer(layer: any) { return this; },
  };
  const zoomClasses = new Set<string>();
  const container = {
    classList: {
      toggle(cls: string, active: boolean) {
        if (active) zoomClasses.add(cls); else zoomClasses.delete(cls);
      },
    },
  };
  let currentZoom = 13;
  let zoomHandler: (() => void) | null = null;
  const map = {
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
    hasLayer() { return false; },
    createPane() { return { style: {} }; },
    getZoom() { return currentZoom; },
    getContainer() { return container; },
    on(event: string, handler: () => void) {
      if (event === 'zoomend') zoomHandler = handler;
      return this;
    },
  };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    __TRANSIT_OVERLAY__: {
      segments: [
        { line: 'L1', coords: [[41.38, 2.15], [41.39, 2.16]], isTram: false },
        { line: 'T4', coords: [[41.40, 2.18], [41.41, 2.19]], isTram: true },
      ],
      stations: [
        { name: 'Metro Only', lines: ['L1'], coords: [41.38, 2.15], isTramOnly: false, isInterchange: false },
        { name: 'Interchange Hub', lines: ['L1', 'L2'], coords: [41.39, 2.16], isTramOnly: false, isInterchange: true },
        { name: 'Tram Stop', lines: ['T4'], coords: [41.40, 2.18], isTramOnly: true, isInterchange: false },
      ],
    },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: (coords: any, options: any) => {
        const marker = {
          coords,
          options,
          bindPopup() { return this; },
          bindTooltip(text: string, opts: any) {
            tooltips.push({ text, opts, marker });
            return this;
          },
          addTo() { return this; },
          on() { return this; },
          setRadius() { return this; },
          setStyle() { return this; },
        };
        markers.push(marker);
        return marker;
      },
      polyline: (coords: any, options: any) => {
        const poly = { coords, options };
        polylines.push(poly);
        return poly;
      },
      layerGroup: () => dummyLayer,
    },
  };

  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  // Initial zoom class check
  assert.equal(zoomClasses.has('zoom-lt-14'), true);
  assert.equal(zoomClasses.has('zoom-14'), false);
  assert.equal(zoomClasses.has('zoom-gte-15'), false);

  // Trigger zoom to 14
  currentZoom = 14;
  if (zoomHandler) (zoomHandler as () => void)();
  assert.equal(zoomClasses.has('zoom-lt-14'), false);
  assert.equal(zoomClasses.has('zoom-14'), true);
  assert.equal(zoomClasses.has('zoom-gte-15'), false);

  // Trigger zoom to 15
  currentZoom = 15;
  if (zoomHandler) (zoomHandler as () => void)();
  assert.equal(zoomClasses.has('zoom-lt-14'), false);
  assert.equal(zoomClasses.has('zoom-14'), false);
  assert.equal(zoomClasses.has('zoom-gte-15'), true);

  // Trigger showMetro
  const state = { places: [], selectedId: null, userLocation: null, cameraCommand: null, showMetro: true };
  runInNewContext(mapUpdateScript(encodeMapPayload(state)), context);

  // Verify polylines: Metro solid vs Tram dashed
  assert.equal(polylines.length, 2);
  const metroPoly = polylines.find(p => p.options.color === '#E1251B');
  assert.ok(metroPoly);
  assert.equal(metroPoly.options.dashArray, undefined);

  const tramPoly = polylines.find(p => p.options.color === '#009A44');
  assert.ok(tramPoly);
  assert.equal(tramPoly.options.dashArray, '6, 5');

  // Verify station markers & tooltips
  assert.equal(markers.length, 3);
  const tramMarker = markers.find(m => m.options.color === '#009A44');
  assert.ok(tramMarker, 'tram marker must have distinct green stroke');
  assert.equal(tramMarker.options.fillColor, '#FFFFFF');

  const hubMarker = markers.find(m => m.options.radius === 4.5);
  assert.ok(hubMarker, 'hub marker must have larger radius');

  assert.equal(tooltips.length, 3);
  const tramTooltip = tooltips.find(t => t.text === 'Tram Stop');
  assert.ok(tramTooltip);
  assert.match(tramTooltip.opts.className, /transit-label-tram/);

  const hubTooltip = tooltips.find(t => t.text === 'Interchange Hub');
  assert.ok(hubTooltip);
  assert.match(hubTooltip.opts.className, /transit-label-hub/);
});

test('cafe marker radius is reduced for compact appearance while retaining touch tolerance', () => {
  let radiusSet: number | null = null;
  const marker = {
    setRadius(r: number) { radiusSet = r; return this; },
    setStyle() { return this; },
    bindPopup() { return this; },
    addTo() { return this; },
    on() { return this; },
    bringToFront() {},
    remove() {},
  };
  const map = {
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
    latLngToContainerPoint() { return { x: 0, y: 0 }; },
    on() { return this; },
  };
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => marker,
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  const state = {
    places: [{ id: 'cafe-1', name: 'Test Café', chain: 'Chain', address: 'Addr', latitude: 41.389, longitude: 2.169 }],
    selectedId: null,
    userLocation: null,
    cameraCommand: null,
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(state)), context);
  assert.equal(radiusSet, 6, 'regular cafe marker radius should be 6px for reduced visual noise');

  // Top match
  const stateTopMatch = { ...state, topMatchIds: ['cafe-1'] };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateTopMatch)), context);
  assert.equal(radiusSet, 8, 'top match cafe marker radius should be 8px');

  // Selected
  const stateSelected = { ...state, selectedId: 'cafe-1' };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateSelected)), context);
  assert.equal(radiusSet, 10, 'selected cafe marker radius should be 10px');
});

test('map runtime appends CARTO API key to tile URL when provided', () => {
  let requestedUrl = '';
  const map = { stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {}, on() { return this; } };
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    __CARTO_API_KEY__: 'test-key-xyz',
    L: {
      map: () => map,
      tileLayer: (url: string) => {
        requestedUrl = url;
        return { on() { return this; }, addTo() { return this; } };
      },
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);
  assert.equal(requestedUrl, 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=test-key-xyz');
});

test('map runtime omits query parameter when CARTO API key is empty', () => {
  let requestedUrl = '';
  const map = { stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {}, on() { return this; } };
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    __CARTO_API_KEY__: '',
    L: {
      map: () => map,
      tileLayer: (url: string) => {
        requestedUrl = url;
        return { on() { return this; }, addTo() { return this; } };
      },
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);
  assert.equal(requestedUrl, 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
});

test('getMapHtml injects CARTO API key into map document', async () => {
  const { getMapHtml, mapHtml } = await import('../src/map/map-html.ts');
  assert.equal(getMapHtml(), mapHtml);
  assert.equal(getMapHtml(''), mapHtml);
  const injected = getMapHtml('my-secret-key');
  assert.notEqual(injected, mapHtml);
  assert.match(injected, /const __CARTO_API_KEY__ = "my-secret-key";/);
});

test('buildMapDocument supports optional cartoApiKey option', async () => {
  const build = await import(new URL('../scripts/build-map.mjs', import.meta.url).href);
  const defaultHtml = await build.buildMapDocument();
  assert.match(defaultHtml, /const __CARTO_API_KEY__ = "";/);
  const customHtml = await build.buildMapDocument({ cartoApiKey: 'custom-build-key' });
  assert.match(customHtml, /const __CARTO_API_KEY__ = "custom-build-key";/);
});

