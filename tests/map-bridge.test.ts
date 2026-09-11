import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { decodeMapPayload, encodeMapPayload, type MapPayload } from '../src/utils/map-bridge.ts';

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
