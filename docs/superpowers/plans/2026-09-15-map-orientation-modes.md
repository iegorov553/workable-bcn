# Dual Map Orientation: Barcelona Grid & North-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dual-mode map orientation toggle between Standard (0° North-Up) and Barcelona Grid (-45° Muntanya-Mar) with a responsive Compass button, counter-rotated overlays, inverse touch coordinate projection, and AsyncStorage persistence.

**Architecture:** A centered oversized (142vmax) `#map` container in WebView/iframe is rotated by -45° with a GPU-accelerated CSS transition. Leaflet's `mouseEventToContainerPoint` applies an inverse rotation matrix so gestures and clicks align 1:1 with the screen. A floating Compass button in `App.tsx` toggles between modes, indicates true North, and persists the choice in `AsyncStorage`.

**Tech Stack:** React Native (Expo 57), Leaflet 1.9.4, TypeScript, AsyncStorage, Expo Haptics, Node.js test runner.

**Spec:** [`docs/superpowers/specs/2026-09-15-map-orientation-modes-design.md`](file:///C:/Users/Mi/.gemini/antigravity/worktrees/workable-bcn/issue_three_brainstorming/docs/superpowers/specs/2026-09-15-map-orientation-modes-design.md)

## Global Constraints
- Target platforms: Android, iOS (`react-native-webview`), and Web (`iframe`).
- Zero external dependencies: no third-party Leaflet plugins.
- Station labels (`.transit-label`) and popup cards must counter-rotate to stay upright.
- No drift on touch/panning: 1:1 pixel drag accuracy in rotated mode.
- Offline-ready and zero API overhead.

---

### Task 1: MapOrientation Type and Bridge Protocol

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/map-bridge.ts`
- Test: `tests/map-bridge.test.ts`

**Interfaces:**
- Produces:
  - `MapOrientation = 'north' | 'grid'` exported from `src/types.ts`.
  - `MapPayload.orientation?: MapOrientation` in `src/utils/map-bridge.ts`.
  - Updated `encodeMapPayload` and `decodeMapPayload` preserving `orientation`.

- [ ] **Step 1: Write failing tests for orientation in `tests/map-bridge.test.ts`**

Add the following tests to `tests/map-bridge.test.ts`:
```typescript
test('orientation survives encoding/decoding and native bootstrap', () => {
  const stateWithGrid: MapPayload = {
    ...initial,
    orientation: 'grid',
  };
  const bootGrid = nativeBootstrap({ payload: encodeMapPayload(stateWithGrid) });
  assert.deepEqual(decodeMapPayload(bootGrid.$$EXPO_INITIAL_PROPS.props.payload), stateWithGrid);

  const stateWithNorth: MapPayload = {
    ...initial,
    orientation: 'north',
  };
  const bootNorth = nativeBootstrap({ payload: encodeMapPayload(stateWithNorth) });
  assert.deepEqual(decodeMapPayload(bootNorth.$$EXPO_INITIAL_PROPS.props.payload), stateWithNorth);
});

test('orientation defaults gracefully when undefined in legacy payloads', () => {
  const legacyState: MapPayload = { ...initial };
  const decoded = decodeMapPayload(encodeMapPayload(legacyState));
  assert.equal(decoded.orientation, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/map-bridge.test.ts`
Expected: FAIL (type or property check failure if typecheck runs, or test passes if payload passes through JSON).

- [ ] **Step 3: Implement `MapOrientation` in `src/types.ts` and `src/utils/map-bridge.ts`**

In `src/types.ts`:
```typescript
export type MapOrientation = 'north' | 'grid';
```

In `src/utils/map-bridge.ts`:
```typescript
import type { Coordinates, MapOrientation, Place } from '../types';
```
And add `orientation?: MapOrientation;` to `MapPayload`:
```typescript
export type MapPayload = {
  places: Place[];
  selectedId: string | null;
  userLocation: Coordinates | null;
  friendLocation?: Coordinates | null;
  meetMode?: boolean;
  cameraCommand: CameraCommand | null;
  chainColors?: Record<string, string>;
  topMatchIds?: string[];
  showMetro?: boolean;
  orientation?: MapOrientation;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-transform-types --test tests/map-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/utils/map-bridge.ts tests/map-bridge.test.ts
git commit -m "feat(map): add MapOrientation type and support in map bridge"
```

---

### Task 2: Map CSS Geometry and Counter-Rotation Styles

**Files:**
- Modify: `src/map/map.css`
- Test: `tests/map-document.test.ts`

**Interfaces:**
- Produces:
  - CSS rule for `#map` with `142vmax × 142vmax` centered positioning, `transform-origin: center center`, and `transition: transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)`.
  - CSS rule `#map.rotated-grid { transform: rotate(-45deg); }`.
  - Counter-rotation rules `.rotated-grid .leaflet-tooltip.transit-label { transform: rotate(45deg); }` and `.rotated-grid .leaflet-popup { transform: rotate(45deg); }`.

- [ ] **Step 1: Write failing test in `tests/map-document.test.ts`**

Add test to `tests/map-document.test.ts`:
```typescript
test('map stylesheet contains 142vmax geometry, rotated-grid transform, and counter-rotation rules', async () => {
  const css = await readFile(new URL('../src/map/map.css', import.meta.url), 'utf8');
  assert.ok(css.includes('142vmax'), 'should size #map with 142vmax');
  assert.ok(css.includes('#map.rotated-grid'), 'should define #map.rotated-grid');
  assert.ok(css.includes('rotate(-45deg)'), 'should rotate -45deg');
  assert.ok(css.includes('.rotated-grid .leaflet-tooltip.transit-label'), 'should counter-rotate transit labels');
  assert.ok(css.includes('.rotated-grid .leaflet-popup'), 'should counter-rotate popups');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/map-document.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/map/map.css`**

Replace:
```css
html, body, #map { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f0f1ec; }
```
With:
```css
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; position: relative; background: #f0f1ec; }
#map {
  position: absolute;
  width: 142vmax;
  height: 142vmax;
  left: 50%;
  top: 50%;
  margin-left: -71vmax;
  margin-top: -71vmax;
  transform: rotate(0deg);
  transform-origin: center center;
  transition: transform 0.45s cubic-bezier(0.25, 1, 0.5, 1);
}
#map.rotated-grid {
  transform: rotate(-45deg);
}

.rotated-grid .leaflet-tooltip.transit-label {
  transform: rotate(45deg);
  transform-origin: left center;
}
.rotated-grid .leaflet-popup {
  transform: rotate(45deg);
  transform-origin: bottom center;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/map-document.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/map.css tests/map-document.test.ts
git commit -m "feat(map): add CSS rules for 45-degree rotation and label counter-rotation"
```

---

### Task 3: Leaflet Runtime Touch Projection & Class Toggling

**Files:**
- Modify: `src/map/map-runtime.js`
- Modify: `scripts/build-map.mjs`
- Output: `src/map/map-html.ts` (via `npm run map:build`)
- Test: `tests/map-bridge.test.ts`
- Test: `tests/map-document.test.ts`

**Interfaces:**
- Produces:
  - `currentOrientation` state in `map-runtime.js`.
  - Override of `map.mouseEventToContainerPoint` applying inverse rotation `R(+45°)` when `currentOrientation === 'grid'`.
  - Updating `mapEl.classList.toggle('rotated-grid', currentOrientation === 'grid')` on `workableMapUpdate`.
  - Bundled `src/map/map-html.ts`.

- [ ] **Step 1: Write failing test in `tests/map-bridge.test.ts` for orientation toggle in runtime and coordinate projection**

Add to `tests/map-bridge.test.ts`:
```typescript
test('map runtime toggles rotated-grid class and wraps mouseEventToContainerPoint for grid orientation', () => {
  const classList = new Set<string>();
  const mapElement = {
    classList: {
      add(cls: string) { classList.add(cls); },
      remove(cls: string) { classList.delete(cls); },
      contains(cls: string) { return classList.has(cls); },
    },
  };
  let containerPointFn: any = null;
  const map = {
    on() { return this; },
    stop() {}, closePopup() {}, invalidateSize() {}, flyTo() {},
    getSize() { return { x: 1000, y: 1000 }; },
    mouseEventToContainerPoint(e: any) {
      return { x: e.clientX, y: e.clientY };
    },
  };
  const window: any = {
    ReactNativeWebView: { postMessage() {} },
    addEventListener() {},
    innerWidth: 400,
    innerHeight: 800,
  };
  const context = {
    window,
    document: {
      getElementById(id: string) { return id === 'map' ? mapElement : { append() {}, textContent: '', className: '', hidden: true }; },
      createElement() { return { append() {}, textContent: '', className: '', hidden: true }; },
    },
    L: {
      Point: class Point {
        x: number; y: number;
        constructor(x: number, y: number) { this.x = x; this.y = y; }
      },
      map: () => map,
      tileLayer: () => ({ on() { return this; }, addTo() { return this; } }),
      circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; }, on() { return this; }, setRadius() { return this; }, setStyle() { return this; }, bringToFront() {}, setLatLng() {}, remove() {} }),
    },
  };
  runInNewContext(readFileSync(new URL('../src/map/map-runtime.js', import.meta.url), 'utf8'), context);

  // Standard orientation ('north'): no rotated-grid class
  const stateNorth: MapPayload = { places: [], selectedId: null, userLocation: null, cameraCommand: null, orientation: 'north' };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateNorth)), context);
  assert.equal(classList.has('rotated-grid'), false);

  // Screen center (200, 400) maps to unrotated point
  const ptNorthCenter = map.mouseEventToContainerPoint({ clientX: 200, clientY: 400 });
  assert.equal(ptNorthCenter.x, 200);
  assert.equal(ptNorthCenter.y, 400);

  // Grid orientation ('grid'): adds rotated-grid class
  const stateGrid: MapPayload = { places: [], selectedId: null, userLocation: null, cameraCommand: null, orientation: 'grid' };
  runInNewContext(mapUpdateScript(encodeMapPayload(stateGrid)), context);
  assert.equal(classList.has('rotated-grid'), true);

  // Screen center (200, 400) maps to container center (500, 500)
  const ptGridCenter = map.mouseEventToContainerPoint({ clientX: 200, clientY: 400 });
  assert.equal(Math.round(ptGridCenter.x), 500);
  assert.equal(Math.round(ptGridCenter.y), 500);

  // Screen top-center (200, 300) [dy = -100, upward]: maps with +45deg rotation
  // localDx = (0 - (-100)) * SQRT1_2 = +70.71, localDy = (0 + (-100)) * SQRT1_2 = -70.71
  const ptGridTop = map.mouseEventToContainerPoint({ clientX: 200, clientY: 300 });
  assert.equal(Math.round(ptGridTop.x), Math.round(500 + 100 * Math.SQRT1_2));
  assert.equal(Math.round(ptGridTop.y), Math.round(500 - 100 * Math.SQRT1_2));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/map-bridge.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/map/map-runtime.js`**

In `src/map/map-runtime.js`:
1. Track `currentOrientation`:
```javascript
let currentOrientation = 'north';
```
2. Wrap `map.mouseEventToContainerPoint`:
```javascript
if (typeof map.mouseEventToContainerPoint === 'function') {
  const originalMouseEventToContainerPoint = map.mouseEventToContainerPoint.bind(map);
  map.mouseEventToContainerPoint = function (e) {
    if (currentOrientation !== 'grid') {
      return originalMouseEventToContainerPoint(e);
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const size = typeof map.getSize === 'function' ? map.getSize() : { x: window.innerWidth, y: window.innerHeight };
    const mx = size.x / 2;
    const my = size.y / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const cos = Math.SQRT1_2;
    const sin = Math.SQRT1_2;
    const localDx = (dx - dy) * cos;
    const localDy = (dx + dy) * sin;
    return typeof L !== 'undefined' && L.Point ? new L.Point(mx + localDx, my + localDy) : { x: mx + localDx, y: my + localDy };
  };
}
```
3. In `window.workableMapUpdate`:
```javascript
const newOrientation = state.orientation || 'north';
if (newOrientation !== currentOrientation) {
  currentOrientation = newOrientation;
  const mapEl = document.getElementById('map');
  if (mapEl && mapEl.classList) {
    if (currentOrientation === 'grid') {
      mapEl.classList.add('rotated-grid');
    } else {
      mapEl.classList.remove('rotated-grid');
    }
  }
}
```

4. Build the map document:
Run `npm run map:build`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-transform-types --test tests/map-bridge.test.ts tests/map-document.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/map-runtime.js src/map/map-html.ts tests/map-bridge.test.ts
git commit -m "feat(map): implement inverse touch coordinate projection for rotated map"
```

---

### Task 4: MapCanvas Native and Web Component Props

**Files:**
- Modify: `src/components/MapCanvas.tsx`
- Modify: `src/components/MapCanvas.web.tsx`
- Test: `tests/map-canvas.test.ts` (or integration test)

**Interfaces:**
- Consumes: `orientation?: MapOrientation` from parent (`App.tsx`).
- Produces: Updated `MapCanvasProps` including `orientation`, forwarded to `encodeMapPayload`.

- [ ] **Step 1: Write test for MapCanvas passing orientation**

In `tests/place-card-integration.test.ts` (or `tests/map-bridge.test.ts`), assert that `MapCanvasProps` includes `orientation` and is forwarded to payload:
```typescript
test('MapCanvas and MapCanvas.web accept orientation in MapCanvasProps', async () => {
  const nativeSrc = await readFile(new URL('../src/components/MapCanvas.tsx', import.meta.url), 'utf8');
  const webSrc = await readFile(new URL('../src/components/MapCanvas.web.tsx', import.meta.url), 'utf8');
  assert.ok(nativeSrc.includes('orientation'), 'MapCanvas.tsx should accept orientation');
  assert.ok(webSrc.includes('orientation'), 'MapCanvas.web.tsx should accept orientation');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/place-card-integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/components/MapCanvas.tsx` and `src/components/MapCanvas.web.tsx`**

In `src/components/MapCanvas.tsx`:
Destructure `orientation` from props and include in `encodeMapPayload`:
```typescript
export default function MapCanvas({
  places,
  selectedId,
  userLocation,
  friendLocation,
  meetMode,
  cameraCommand,
  topMatchIds,
  showMetro,
  orientation,
  onSelect,
  onMapClick,
}: MapCanvasProps) {
  // ...
  const payload = useMemo(
    () => encodeMapPayload({ places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, chainColors, topMatchIds, showMetro, orientation }),
    [places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, topMatchIds, showMetro, orientation]
  );
```

In `src/components/MapCanvas.web.tsx`:
Destructure `orientation` and include in `encodeMapPayload`:
```typescript
export default function MapCanvas({
  places,
  selectedId,
  userLocation,
  friendLocation,
  meetMode,
  cameraCommand,
  topMatchIds,
  showMetro,
  orientation,
  onSelect,
  onMapClick,
}: MapCanvasProps) {
  // ...
  const payload = useMemo(
    () => encodeMapPayload({ places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, chainColors, topMatchIds, showMetro, orientation }),
    [places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, topMatchIds, showMetro, orientation]
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-transform-types --test tests/place-card-integration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/MapCanvas.tsx src/components/MapCanvas.web.tsx tests/place-card-integration.test.ts
git commit -m "feat(map): forward orientation prop in MapCanvas and MapCanvas.web"
```

---

### Task 5: App.tsx Compass Button & AsyncStorage Persistence

**Files:**
- Modify: `App.tsx`
- Test: `tests/app-orientation.test.ts`

**Interfaces:**
- Consumes: `AsyncStorage`, `MapCanvas`, `MapOrientation`.
- Produces:
  - `ORIENTATION_KEY = 'workable-bcn:map-orientation:v1'` storage key.
  - `orientation` state in `AppContent`.
  - Compass button in `s.mapControls` rotating dynamically by 45° in grid mode.
  - Passing `orientation` to `<MapCanvas>`.

- [ ] **Step 1: Write failing test in `tests/app-orientation.test.ts`**

Create `tests/app-orientation.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('App.tsx defines ORIENTATION_KEY and renders compass button in map controls', async () => {
  const appSrc = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.ok(appSrc.includes("ORIENTATION_KEY = 'workable-bcn:map-orientation:v1'"), 'should define storage key');
  assert.ok(appSrc.includes('compass-outline'), 'should render compass icon');
  assert.ok(appSrc.includes('toggleOrientation'), 'should define toggleOrientation');
  assert.ok(appSrc.includes('orientation={orientation}'), 'should pass orientation to MapCanvas');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/app-orientation.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `App.tsx`**

1. Define storage key and import type:
```typescript
import type { Coordinates, MapOrientation, Place, ViewMode } from './src/types';

const ORIENTATION_KEY = 'workable-bcn:map-orientation:v1';
```

2. Add state and restore from `AsyncStorage` in `useEffect`:
```typescript
const [orientation, setOrientation] = useState<MapOrientation>('north');

useEffect(() => {
  mounted.current = true;
  AsyncStorage.getItem(FAVORITES_KEY)
    .then(value => { if (mounted.current) setFavorites(parseFavorites(value, validIds)); })
    .catch(() => { if (mounted.current) setNotice('Could not load saved places. Please restart the app.'); })
    .finally(() => { if (mounted.current) setLoaded(true); });

  AsyncStorage.getItem(ORIENTATION_KEY)
    .then(value => {
      if (mounted.current && (value === 'grid' || value === 'north')) {
        setOrientation(value);
      }
    })
    .catch(() => {});

  return () => { mounted.current = false; };
}, []);
```

3. Define `toggleOrientation`:
```typescript
const toggleOrientation = useCallback(() => {
  const next: MapOrientation = orientation === 'north' ? 'grid' : 'north';
  setOrientation(next);
  haptic();
  void AsyncStorage.setItem(ORIENTATION_KEY, next).catch(() => {});
}, [orientation]);
```

4. Pass `orientation` to `<MapCanvas>`:
```tsx
<MapCanvas
  places={filtered}
  selectedId={selectedId}
  userLocation={location}
  friendLocation={friendLocation}
  meetMode={meetMode}
  cameraCommand={camera}
  topMatchIds={topMatchIds}
  showMetro={showMetro}
  orientation={orientation}
  onSelect={selectPlace}
  onMapClick={handleMapClick}
/>
```

5. Add Compass button in `s.mapControls`:
```tsx
<View style={s.mapControls}>
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={orientation === 'grid' ? 'Reset map orientation to North' : 'Rotate map to Barcelona grid'}
    accessibilityState={{ selected: orientation === 'grid' }}
    onPress={toggleOrientation}
    style={[s.mapButton, orientation === 'grid' && s.mapButtonActive]}
  >
    <View style={{ transform: [{ rotate: orientation === 'grid' ? '45deg' : '0deg' }] }}>
      <Ionicons
        name="compass-outline"
        size={24}
        color={orientation === 'grid' ? colors.tomato : colors.ink}
      />
    </View>
  </Pressable>
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={showMetro ? 'Hide metro lines' : 'Show metro lines'}
    accessibilityState={{ selected: showMetro }}
    onPress={() => { setShowMetro(v => !v); haptic(); }}
    style={[s.mapButton, showMetro && s.mapButtonActive]}
  >
    <Ionicons name="subway-outline" size={22} color={showMetro ? colors.ink : colors.inkSoft} />
  </Pressable>
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Return to my location"
    accessibilityState={{ busy: locating, disabled: locating }}
    disabled={locating}
    onPress={() => void locate()}
    style={s.mapButton}
  >
    {locating ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="locate-outline" size={24} color={colors.ink} />}
  </Pressable>
</View>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-transform-types --test tests/app-orientation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add App.tsx tests/app-orientation.test.ts
git commit -m "feat(ui): add compass button and persistent orientation toggle"
```

---

### Task 6: Full Verification and Build

**Files:**
- Output: `src/map/map-html.ts`
- Verification: All tests and typecheck

- [ ] **Step 1: Rebuild bundled map HTML**

Run: `npm run map:build`
Verify: `src/map/map-html.ts` includes updated `map-runtime.js` and `map.css`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run all unit & integration tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit any remaining updates**

```bash
git add -A
git commit -m "chore: rebuild map-html bundle and verify tests"
```
