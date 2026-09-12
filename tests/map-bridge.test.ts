import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { decodeMapPayload, encodeMapPayload, mapUpdateScript, parseMapMessage, type MapPayload } from '../src/utils/map-bridge.ts';

// Reproduce RNCWebView.java (13.16.1): JSON is inserted directly into a JS
// template literal, then Expo's DOM HTML parses the result before mounting React.
function nativeBootstrap(props: object) {
  const injected = JSON.stringify({ EXPO_DOM_HOST_OS: 'android', initialProps: { names: ['onSelect'], props } });
  const context = { window: {} as any };
  runInNewContext('window.ReactNativeWebView = { injectedObjectJson: function () { return `' + injected + '`; }};', context, { timeout: 1000 });
  const object = JSON.parse(context.window.ReactNativeWebView.injectedObjectJson());
  context.window.$$EXPO_DOM_HOST_OS = object.EXPO_DOM_HOST_OS;
  context.window.$$EXPO_INITIAL_PROPS = object.initialProps;
  return context.window;
}

const places = JSON.parse(readFileSync(new URL('../src/data/places.json', import.meta.url), 'utf8')) as MapPayload['places'];
const initial: MapPayload = { places, selectedId: null, userLocation: null, cameraCommand: null };

test('raw backticks reproduce the startup failure; encoded text survives native bootstrap', () => {
  const sample: MapPayload = { ...initial, places: [{ ...places[0], name: 'L`Hospitalet "Café" ${notJavaScript} \\ ☕\nGràcia' }] };
  assert.throws(() => nativeBootstrap(sample));
  const boot = nativeBootstrap({ payload: encodeMapPayload(sample) });
  assert.equal(boot.$$EXPO_DOM_HOST_OS, 'android');
  assert.deepEqual(boot.$$EXPO_INITIAL_PROPS.names, ['onSelect']);
  assert.deepEqual(decodeMapPayload(boot.$$EXPO_INITIAL_PROPS.props.payload), sample);
});

test('the complete catalogue and subsequent map state survive the WebView transport', () => {
  const coords = { latitude: 41.389, longitude: 2.169 };
  for (const state of [initial, { places: places.slice(0, 2), selectedId: places[0].id, userLocation: coords, cameraCommand: { ...coords, requestId: 2 } }, { ...initial, places: [] }]) {
    const boot = nativeBootstrap({ payload: encodeMapPayload(state) });
    assert.deepEqual(decodeMapPayload(boot.$$EXPO_INITIAL_PROPS.props.payload), state);
  }
});

test('friendLocation and meetMode survive encoding/decoding and native bootstrap', () => {
  const stateWithFriend: MapPayload = {
    ...initial,
    userLocation: { latitude: 41.389, longitude: 2.169 },
    friendLocation: { latitude: 41.395, longitude: 2.175 },
    meetMode: true,
  };
  const boot = nativeBootstrap({ payload: encodeMapPayload(stateWithFriend) });
  assert.deepEqual(decodeMapPayload(boot.$$EXPO_INITIAL_PROPS.props.payload), stateWithFriend);

  const stateWithoutFriend: MapPayload = {
    ...initial,
    friendLocation: null,
    meetMode: false,
  };
  const bootNull = nativeBootstrap({ payload: encodeMapPayload(stateWithoutFriend) });
  assert.deepEqual(decodeMapPayload(bootNull.$$EXPO_INITIAL_PROPS.props.payload), stateWithoutFriend);
});

test('showMetro survives encoding/decoding and native bootstrap', () => {
  const stateWithMetro: MapPayload = {
    ...initial,
    showMetro: true,
  };
  const bootTrue = nativeBootstrap({ payload: encodeMapPayload(stateWithMetro) });
  assert.deepEqual(decodeMapPayload(bootTrue.$$EXPO_INITIAL_PROPS.props.payload), stateWithMetro);

  const stateWithoutMetro: MapPayload = {
    ...initial,
    showMetro: false,
  };
  const bootFalse = nativeBootstrap({ payload: encodeMapPayload(stateWithoutMetro) });
  assert.deepEqual(decodeMapPayload(bootFalse.$$EXPO_INITIAL_PROPS.props.payload), stateWithoutMetro);
});

test('parseMapMessage parses mapClick events and rejects invalid lat/lon', () => {
  const valid = JSON.stringify({ type: 'mapClick', latitude: 41.389, longitude: 2.169 });
  assert.deepEqual(parseMapMessage(valid), { type: 'mapClick', latitude: 41.389, longitude: 2.169 });

  // Rejection of invalid payloads
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', latitude: '41.389', longitude: 2.169 })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', latitude: 41.389, longitude: '2.169' })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', latitude: 41.389 })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', longitude: 2.169 })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', latitude: null, longitude: 2.169 })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', latitude: NaN, longitude: 2.169 })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick', latitude: Infinity, longitude: 2.169 })), null);
  assert.equal(parseMapMessage(JSON.stringify({ type: 'mapClick' })), null);
});

test('map runtime dispatches mapClick on map tap outside markers', () => {
  const messages: string[] = [];
  let mapClickHandler: ((e: any) => void) | null = null;
  const map = {
    on(event: string, callback: (e: any) => void) {
      if (event === 'click') mapClickHandler = callback;
      return this;
    },
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
  };
  const window: any = { ReactNativeWebView: { postMessage(data: string) { messages.push(data); } }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; }, on() { return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() {} }),
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof mapClickHandler, 'function');
  (mapClickHandler as unknown as (e: any) => void)({ latlng: { lat: 41.389, lng: 2.169 } });
  assert.deepEqual(parseMapMessage(messages.at(-1)!), { type: 'mapClick', latitude: 41.389, longitude: 2.169 });

  // Guard against undefined or missing latlng
  const countBefore = messages.length;
  (mapClickHandler as unknown as (e: any) => void)({});
  (mapClickHandler as unknown as (e: any) => void)(null);
  assert.equal(messages.length, countBefore);
});

test('map runtime selects marker on map tap within touch tolerance and dispatches mapClick outside', () => {
  const messages: string[] = [];
  let mapClickHandler: ((e: any) => void) | null = null;
  const map = {
    on(event: string, callback: (e: any) => void) {
      if (event === 'click') mapClickHandler = callback;
      return this;
    },
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
    latLngToContainerPoint(coords: [number, number] | { lat: number; lng: number }) {
      const lat = Array.isArray(coords) ? coords[0] : coords.lat;
      const lng = Array.isArray(coords) ? coords[1] : coords.lng;
      return { x: lng * 1000, y: lat * 1000 };
    },
  };
  const window: any = { ReactNativeWebView: { postMessage(data: string) { messages.push(data); } }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; }, on() { return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() {} }),
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  const state: MapPayload = {
    places: [{ id: 'cafe-1', name: 'Test Café', chain: 'Chain', address: 'Addr', latitude: 41.389, longitude: 2.169 }],
    selectedId: null,
    userLocation: null,
    cameraCommand: null,
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(state)), context);

  assert.equal(typeof mapClickHandler, 'function');

  // Tap within 26px (dist = 10px): selects cafe
  (mapClickHandler as unknown as (e: any) => void)({ latlng: { lat: 41.389, lng: 2.179 } });
  assert.deepEqual(parseMapMessage(messages.at(-1)!), { type: 'select', id: 'cafe-1' });

  // Tap outside 26px (dist = 50px): dispatches mapClick
  (mapClickHandler as unknown as (e: any) => void)({ latlng: { lat: 41.389, lng: 2.219 } });
  assert.deepEqual(parseMapMessage(messages.at(-1)!), { type: 'mapClick', latitude: 41.389, longitude: 2.219 });
});

test('map runtime gives top match markers a golden stroke when unselected', () => {
  const styles: any[] = [];
  const map = {
    on() { return this; },
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {}, fitBounds() {},
  };
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => ({
        bindPopup() { return this; },
        addTo() { return this; },
        on() { return this; },
        setRadius() { return this; },
        setStyle(s: any) { styles.push(s); return this; },
        bringToFront() {},
        setLatLng() {},
        remove() {},
      }),
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  const placeA = { id: 'a', name: 'Café A', chain: '365 Café', address: 'BCN', latitude: 41.389, longitude: 2.169 };
  const placeB = { id: 'b', name: 'Café B', chain: 'Granier', address: 'BCN', latitude: 41.390, longitude: 2.170 };

  const state: MapPayload = {
    places: [placeA, placeB],
    selectedId: null,
    userLocation: null,
    cameraCommand: null,
    topMatchIds: ['a'],
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(state)), context);

  assert.equal(styles.length, 2);
  // placeA is in topMatchIds, so should have #F4C344 stroke and weight 3 or 4
  assert.equal(styles[0].color, '#F4C344');
  assert.ok(styles[0].weight === 3 || styles[0].weight === 4);

  // placeB is not in topMatchIds, so should have default #FFFDF7 stroke and weight 2
  assert.equal(styles[1].color, '#FFFDF7');
  assert.equal(styles[1].weight, 2);

  // When placeA is selected, it should have #17211B stroke and weight 4
  const stateSelected: MapPayload = { ...state, selectedId: 'a' };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateSelected)), context);
  assert.equal(styles[2].color, '#17211B');
  assert.equal(styles[2].weight, 4);
});

test('map runtime renders, updates, and removes friendMarker with purple styling and popup', () => {
  const markersCreated: any[] = [];
  const map = {
    on() { return this; },
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {}, fitBounds() {},
  };
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: (latlng: [number, number], options: any) => {
        const marker = {
          latlng,
          options,
          popupText: '',
          removed: false,
          frontCount: 0,
          bindPopup(content: any) { this.popupText = typeof content === 'string' ? content : 'custom'; return this; },
          addTo() { return this; },
          on() { return this; },
          setRadius() { return this; },
          setStyle() { return this; },
          bringToFront() { this.frontCount++; },
          setLatLng(newCoords: [number, number]) { this.latlng = newCoords; },
          remove() { this.removed = true; },
        };
        markersCreated.push(marker);
        return marker;
      },
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  const stateWithFriend: MapPayload = {
    places: [],
    selectedId: null,
    userLocation: null,
    cameraCommand: null,
    friendLocation: { latitude: 41.395, longitude: 2.175 },
    meetMode: true,
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateWithFriend)), context);

  assert.equal(markersCreated.length, 1);
  const friendM = markersCreated[0];
  assert.equal(friendM.latlng[0], 41.395);
  assert.equal(friendM.latlng[1], 2.175);
  assert.equal(friendM.options.radius, 8);
  assert.equal(friendM.options.color, '#FFFFFF');
  assert.equal(friendM.options.weight, 4);
  assert.equal(friendM.options.fillColor, '#7C3AED');
  assert.equal(friendM.options.fillOpacity, 1);
  assert.equal(friendM.popupText, 'Friend is here');

  // Update position
  const stateUpdated: MapPayload = {
    ...stateWithFriend,
    friendLocation: { latitude: 41.400, longitude: 2.180 },
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateUpdated)), context);
  assert.equal(markersCreated.length, 1); // Not recreated
  assert.equal(friendM.latlng[0], 41.400);
  assert.equal(friendM.latlng[1], 2.180);

  // Remove friend
  const stateCleared: MapPayload = {
    ...stateWithFriend,
    friendLocation: null,
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateCleared)), context);
  assert.equal(friendM.removed, true);
});

test('map runtime executes fitBounds when both userLocation and friendLocation are present and avoids jitter', () => {
  const boundsCalls: any[] = [];
  const map = {
    on() { return this; },
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
    fitBounds(bounds: any, options: any) {
      boundsCalls.push({ bounds, options });
    },
  };
  const window: any = { ReactNativeWebView: { postMessage() {} }, addEventListener() {} };
  const element = () => ({ append() {}, textContent: '', className: '', hidden: true });
  const context = {
    window,
    document: { getElementById: element, createElement: element },
    L: {
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; }, on() { return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() {} }),
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  const stateDual: MapPayload = {
    places: [],
    selectedId: null,
    userLocation: { latitude: 41.389, longitude: 2.169 },
    friendLocation: { latitude: 41.395, longitude: 2.175 },
    cameraCommand: null,
  };

  // First update should fit bounds
  runInNewContext(mapUpdateScript(encodeMapPayload(stateDual)), context);
  assert.equal(boundsCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(boundsCalls[0].bounds)), [[41.389, 2.169], [41.395, 2.175]]);
  assert.deepEqual(JSON.parse(JSON.stringify(boundsCalls[0].options)), { padding: [60, 60], maxZoom: 15 });

  // Second identical update should NOT re-trigger fitBounds (avoids jittering)
  runInNewContext(mapUpdateScript(encodeMapPayload(stateDual)), context);
  assert.equal(boundsCalls.length, 1);

  // Moving friend should trigger fitBounds again
  const stateMoved: MapPayload = {
    ...stateDual,
    friendLocation: { latitude: 41.400, longitude: 2.180 },
  };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateMoved)), context);
  assert.equal(boundsCalls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(boundsCalls[1].bounds)), [[41.389, 2.169], [41.400, 2.180]]);
});
