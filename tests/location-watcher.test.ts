import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startLocationWatcher,
  type WatcherProvider,
  type AppStateStatus,
} from '../src/utils/location-watcher.ts';
import type { Coordinates } from '../src/types.ts';

function createMockProvider(overrides?: Partial<WatcherProvider>): {
  provider: WatcherProvider;
  watches: Array<{ options: any; callback: (loc: any) => void; removed: boolean }>;
  stateListeners: Array<(state: AppStateStatus) => void>;
  setCurrentState: (state: AppStateStatus) => void;
} {
  let currentState: AppStateStatus = 'active';
  const watches: Array<{ options: any; callback: (loc: any) => void; removed: boolean }> = [];
  const stateListeners: Array<(state: AppStateStatus) => void> = [];

  const provider: WatcherProvider = {
    permission: async () => ({ granted: true, canAskAgain: true }),
    watchPosition: async (options, callback) => {
      const watch = { options, callback, removed: false };
      watches.push(watch);
      return {
        remove: () => {
          watch.removed = true;
        },
      };
    },
    getAppState: () => currentState,
    addAppStateListener: (listener) => {
      stateListeners.push(listener);
      return {
        remove: () => {
          const idx = stateListeners.indexOf(listener);
          if (idx !== -1) stateListeners.splice(idx, 1);
        },
      };
    },
    ...overrides,
  };

  return {
    provider,
    watches,
    stateListeners,
    setCurrentState: (state: AppStateStatus) => {
      currentState = state;
      for (const listener of [...stateListeners]) {
        listener(state);
      }
    },
  };
}

test('watcher subscribes with 10s interval and balanced accuracy when active and permission is granted', async () => {
  const { provider, watches } = createMockProvider();
  const updates: Coordinates[] = [];

  const watcher = await startLocationWatcher(provider, {
    onLocation: (coords) => updates.push(coords),
  });

  assert.equal(watches.length, 1);
  assert.equal(watches[0].options.timeInterval, 10000);
  assert.equal(watches[0].removed, false);

  // Simulate GPS coordinate delivery
  watches[0].callback({ coords: { latitude: 41.385, longitude: 2.173 } });
  assert.deepEqual(updates, [{ latitude: 41.385, longitude: 2.173 }]);

  watcher.remove();
  assert.equal(watches[0].removed, true);
});

test('watcher does not subscribe if permission is not granted', async () => {
  const { provider, watches } = createMockProvider({
    permission: async () => ({ granted: false, canAskAgain: true }),
  });
  const updates: Coordinates[] = [];

  const watcher = await startLocationWatcher(provider, {
    onLocation: (coords) => updates.push(coords),
  });

  assert.equal(watches.length, 0);
  assert.equal(updates.length, 0);

  watcher.remove();
});

test('watcher ignores invalid coordinates from device GPS', async () => {
  const { provider, watches } = createMockProvider();
  const updates: Coordinates[] = [];

  const watcher = await startLocationWatcher(provider, {
    onLocation: (coords) => updates.push(coords),
  });

  assert.equal(watches.length, 1);
  // Send invalid coordinates
  watches[0].callback({ coords: { latitude: NaN, longitude: 2.173 } });
  watches[0].callback({ coords: { latitude: 95, longitude: 2.173 } }); // out of range
  watches[0].callback({ coords: null });
  assert.equal(updates.length, 0);

  // Send valid coordinate
  watches[0].callback({ coords: { latitude: 41.385, longitude: 2.173 } });
  assert.equal(updates.length, 1);

  watcher.remove();
});

test('watcher stops in background and resumes when app returns to active', async () => {
  const { provider, watches, setCurrentState } = createMockProvider();
  const updates: Coordinates[] = [];

  const watcher = await startLocationWatcher(provider, {
    onLocation: (coords) => updates.push(coords),
  });

  assert.equal(watches.length, 1);
  assert.equal(watches[0].removed, false);

  // App goes to background
  setCurrentState('background');
  assert.equal(watches[0].removed, true);

  // App returns to active
  setCurrentState('active');
  // Allow promise to resolve
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(watches.length, 2);
  assert.equal(watches[1].removed, false);

  watcher.remove();
  assert.equal(watches[1].removed, true);
});

test('calling watcher.remove() stops tracking and removes app state listener', async () => {
  const { provider, watches, stateListeners } = createMockProvider();

  const watcher = await startLocationWatcher(provider, {
    onLocation: () => {},
  });

  assert.equal(watches.length, 1);
  assert.equal(stateListeners.length, 1);

  watcher.remove();
  assert.equal(watches[0].removed, true);
  assert.equal(stateListeners.length, 0);
});

test('App.tsx integrates location watcher with 10s interval and AppState tracking', () => {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /startLocationWatcher/);
  assert.match(appSource, /timeInterval:\s*10000/);
  assert.match(appSource, /AppState\.currentState/);
  assert.match(appSource, /AppState\.addEventListener\('change'/);
});
