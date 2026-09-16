# Navigation Decoupling & Unified Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple view modes (Map vs. List) from data filtering, replace the static bottom tabbar with a dynamic floating view switcher, add a unified favorites filter chip, render distinct favorite pins on the map, and add café hiding (dislike) with restoration in About.

**Architecture:** Refactor `ViewMode` to `'map' | 'list'`, introduce a floating action button `[ 📋 List ]` / `[ 🗺️ Map ]`, prepend a `[ ❤️ ]` chip to the filter bar, pass `favoriteIds` to Leaflet for styled heart markers, store `hiddenPlaces` in `AsyncStorage`, and provide an undo notice and About modal restoration UI.

**Tech Stack:** React Native 0.86, Expo 57, TypeScript, Leaflet 1.9 (in WebView), AsyncStorage, Ionicons, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-navigation-and-filters-design.md`

## Global Constraints

- Keep all app copy in English.
- Use warm editorial palette: cream `#FFF9EB`, sand `#E5DFCC`, ivory `#FFFEF8`, ink `#17211B`, yellow `#F4C344`, tomato `#C85233`.
- Minimum 44x44 dp touch targets on interactive controls.
- All commits on `feature/navigation-and-filters`.
- Ensure `npm test` and `npm run typecheck` pass with zero failures.

---

### Task 1: Data Model & Storage Utility for Hidden Places (Issue #1)

**Files:**
- Create: `src/utils/hidden-places.ts`
- Test: `tests/hidden-places.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export function parseHiddenPlaces(value: string | null, validIds: Set<string>): Set<string>;
  export function serializeHiddenPlaces(hidden: Set<string>): string;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/hidden-places.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHiddenPlaces, serializeHiddenPlaces } from '../src/utils/hidden-places.ts';

test('parseHiddenPlaces returns empty set for null, empty, or corrupt input', () => {
  const valid = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseHiddenPlaces(null, valid), new Set());
  assert.deepEqual(parseHiddenPlaces('', valid), new Set());
  assert.deepEqual(parseHiddenPlaces('not-json', valid), new Set());
  assert.deepEqual(parseHiddenPlaces('{"not":"array"}', valid), new Set());
  assert.deepEqual(parseHiddenPlaces('123', valid), new Set());
});

test('parseHiddenPlaces prunes invalid IDs and deduplicates', () => {
  const valid = new Set(['place-1', 'place-2']);
  const input = JSON.stringify(['place-1', 'place-1', 'stale-place', 42, null]);
  const result = parseHiddenPlaces(input, valid);
  assert.deepEqual(result, new Set(['place-1']));
});

test('serializeHiddenPlaces correctly stringifies Set of IDs', () => {
  const set = new Set(['place-1', 'place-2']);
  const json = serializeHiddenPlaces(set);
  assert.deepEqual(JSON.parse(json), ['place-1', 'place-2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/hidden-places.test.ts`  
Expected: FAIL with "Cannot find module '../src/utils/hidden-places.ts'"

- [ ] **Step 3: Implement `src/utils/hidden-places.ts`**

```typescript
// src/utils/hidden-places.ts
export function parseHiddenPlaces(value: string | null, validIds: Set<string>): Set<string> {
  if (!value) return new Set();
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set();
    const result = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string' && validIds.has(item)) {
        result.add(item);
      }
    }
    return result;
  } catch {
    return new Set();
  }
}

export function serializeHiddenPlaces(hidden: Set<string>): string {
  return JSON.stringify(Array.from(hidden));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/hidden-places.test.ts`  
Expected: PASS (3 subtests pass)

- [ ] **Step 5: Commit**

```bash
git add src/utils/hidden-places.ts tests/hidden-places.test.ts
git commit -m "feat(hidden): add parseHiddenPlaces and serializeHiddenPlaces persistence utilities"
```

---

### Task 2: PlaceCard Action for Hiding Cafés (Issue #1)

**Files:**
- Modify: `src/components/PlaceCard.tsx`
- Test: `tests/regressions.test.ts`

**Interfaces:**
- Consumes: `PlaceCardProps`
- Produces: `PlaceCardProps.onHide?: () => void`

- [ ] **Step 1: Write the failing test**

In `tests/regressions.test.ts`, add a test verifying `PlaceCard` source exports `onHide`:

```typescript
test('PlaceCard source defines and supports onHide prop with eye-off-outline icon', () => {
  const source = readFileSync(new URL('../src/components/PlaceCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /onHide\?: \(\) => void;/);
  assert.match(source, /onHide/);
  assert.match(source, /eye-off-outline/);
  assert.match(source, /accessibilityLabel="Hide place"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`  
Expected: FAIL with "AssertionError: pattern did not match onHide"

- [ ] **Step 3: Update `src/components/PlaceCard.tsx`**

1. In `PlaceCardProps`:
```typescript
export type PlaceCardProps = {
  place: Place;
  distanceLabel: string | null;
  favorite: boolean;
  onPress: () => void;
  onDirections: () => void;
  onFavorite: () => void;
  onHide?: () => void;
  matchBadge?: string | null;
  isBestMatch?: boolean;
  onShareFriend?: () => void;
  note?: string;
  onEditNote?: () => void;
};
```
2. In the top row of `PlaceCard`, before the favorite button:
```typescript
{onHide ? (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Hide place"
    onPress={onHide}
    hitSlop={8}
    style={({ pressed }) => [s.icon, pressed && { opacity: 0.6, transform: [{ scale: 0.9 }] }]}
  >
    <Ionicons name="eye-off-outline" size={22} color={colors.inkSoft} />
  </Pressable>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/PlaceCard.tsx tests/regressions.test.ts
git commit -m "feat(ui): add hide action with eye-off-outline to PlaceCard"
```

---

### Task 3: Map Markers for Favorite Cafés (Issue #7)

**Files:**
- Modify: `src/utils/map-bridge.ts`
- Modify: `src/map/map-runtime.js`
- Modify: `src/map/map.css`
- Modify: `src/components/MapCanvas.tsx`
- Modify: `src/components/MapCanvas.web.tsx`
- Test: `tests/map-bridge.test.ts`

**Interfaces:**
- Consumes: `favoriteIds?: string[]` in `MapPayload`
- Produces: Visual SVG heart marker inside circular colored pin in Leaflet runtime.

- [ ] **Step 1: Write failing test in `tests/map-bridge.test.ts`**

Add to `tests/map-bridge.test.ts`:
```typescript
test('favoriteIds survives encoding/decoding and native bootstrap', () => {
  const stateWithFavs: MapPayload = {
    ...initial,
    favoriteIds: ['place-1', 'place-2'],
  };
  const boot = nativeBootstrap({ payload: encodeMapPayload(stateWithFavs) });
  const decoded = decodeMapPayload(boot.$$EXPO_INITIAL_PROPS.props.payload);
  assert.deepEqual(decoded.favoriteIds, ['place-1', 'place-2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/map-bridge.test.ts`  
Expected: FAIL because `favoriteIds` is not yet part of `MapPayload`.

- [ ] **Step 3: Update `src/utils/map-bridge.ts`, `MapCanvas.tsx`, `MapCanvas.web.tsx`, `map.css`, `map-runtime.js`**

1. In `src/utils/map-bridge.ts`:
```typescript
export type MapPayload = {
  places: Place[];
  selectedId: string | null;
  favoriteIds?: string[];
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
2. In `src/map/map.css`, add styles for favorite marker:
```css
.fav-marker-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease;
}
.fav-marker-wrap svg {
  display: block;
}
.fav-marker-wrap.is-selected {
  outline: 3px solid #17211B;
  outline-offset: 1px;
}
```
3. In `src/map/map-runtime.js`:
   - In `window.workableMapUpdate`: check if `place.id` is in `state.favoriteIds`.
   - If favorite, create or update using `L.divIcon`:
     ```javascript
     const isFav = Boolean(state.favoriteIds && state.favoriteIds.includes(place.id));
     ```
   - Render marker with SVG heart:
     ```javascript
     const heartSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
     ```
   - Pass `favoriteIds` in `MapCanvas.tsx` and `MapCanvas.web.tsx`.
4. Rebuild the map bundle:
   Run: `npm run map:build`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/map-bridge.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/map-bridge.ts src/map/map.css src/map/map-runtime.js src/map/map-html.ts src/components/MapCanvas.tsx src/components/MapCanvas.web.tsx tests/map-bridge.test.ts
git commit -m "feat(map): render favorite places with heart markers and include favoriteIds in bridge"
```

---

### Task 4: Navigation Decoupling & Floating Mode Button

**Files:**
- Modify: `src/types.ts`
- Create: `src/components/FloatingModeButton.tsx`
- Test: `tests/regressions.test.ts`

**Interfaces:**
- Consumes:
  ```typescript
  export type ViewMode = 'map' | 'list';
  ```
- Produces:
  ```typescript
  export type FloatingModeButtonProps = {
    mode: ViewMode;
    onToggle: () => void;
    visible?: boolean;
  };
  export function FloatingModeButton(props: FloatingModeButtonProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

In `tests/regressions.test.ts`, add test for `FloatingModeButton`:
```typescript
test('FloatingModeButton component and ViewMode type are defined', () => {
  const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
  assert.match(types, /export type ViewMode = 'map' \| 'list';/);
  const source = readFileSync(new URL('../src/components/FloatingModeButton.tsx', import.meta.url), 'utf8');
  assert.match(source, /export function FloatingModeButton\(/);
  assert.match(source, /List/);
  assert.match(source, /Map/);
  assert.match(source, /colors\.ink/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`  
Expected: FAIL ("Cannot find module '../src/components/FloatingModeButton.tsx'")

- [ ] **Step 3: Update `src/types.ts` and implement `src/components/FloatingModeButton.tsx`**

1. In `src/types.ts`:
```typescript
export type ViewMode = 'map' | 'list';
```
2. Create `src/components/FloatingModeButton.tsx`:
```typescript
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { ViewMode } from '../types';

export type FloatingModeButtonProps = {
  mode: ViewMode;
  onToggle: () => void;
  visible?: boolean;
};

export function FloatingModeButton({ mode, onToggle, visible = true }: FloatingModeButtonProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const isMap = mode === 'map';
  const label = isMap ? 'List' : 'Map';
  const icon = isMap ? 'list-outline' : 'map-outline';

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: insets.bottom + 16 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${label} view`}
        onPress={onToggle}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name={icon} size={18} color={colors.paper} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 90,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 22,
    borderRadius: 23,
    backgroundColor: colors.ink,
    boxShadow: '0 4px 14px rgba(23, 33, 27, 0.28)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'RobotoBold',
    fontSize: 14,
    color: colors.paper,
    letterSpacing: 0.2,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/components/FloatingModeButton.tsx tests/regressions.test.ts
git commit -m "feat(navigation): create FloatingModeButton and simplify ViewMode to map | list"
```

---

### Task 5: App Integration — Unified Filters, Heart Chip, Hidden Cafés & Restoration

**Files:**
- Modify: `App.tsx`
- Test: `tests/regressions.test.ts`

**Interfaces:**
- Connects:
  - `onlyFavorites: boolean` state toggled via `[ ❤️ ]` chip before `[ All ]`.
  - `hiddenPlaces: Set<string>` loaded from `AsyncStorage` key `workable-bcn:hidden:v1`.
  - Place hiding in `PlaceCard` with Undo notice banner.
  - "Hidden places" management section in About modal with "Unhide" & "Unhide all" buttons.
  - Replaced bottom static bar with `<FloatingModeButton />`.
  - Pass `favoriteIds` array to `MapCanvas`.

- [ ] **Step 1: Write integration tests in `tests/regressions.test.ts`**

Add tests to verify:
1. `App.tsx` imports `parseHiddenPlaces`, `serializeHiddenPlaces`, and `FloatingModeButton`.
2. `App.tsx` defines `HIDDEN_KEY = 'workable-bcn:hidden:v1'`.
3. `App.tsx` includes heart filter chip with `heart-outline` / `heart`.
4. `App.tsx` passes `onHide` to `PlaceCard`.
5. `App.tsx` includes "Hidden places" in About modal.
6. Old static bottom bar (`s.navSafe`, `s.navItem`) is removed.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`  
Expected: FAIL (missing imports/elements in App.tsx)

- [ ] **Step 3: Implement updates in `App.tsx`**

1. Import `parseHiddenPlaces`, `serializeHiddenPlaces`, and `FloatingModeButton`.
2. Add states:
   ```typescript
   const HIDDEN_KEY = 'workable-bcn:hidden:v1';
   const [hiddenPlaces, setHiddenPlaces] = useState<Set<string>>(new Set());
   const [onlyFavorites, setOnlyFavorites] = useState(false);
   ```
3. Load `hiddenPlaces` on mount in `useEffect`:
   ```typescript
   AsyncStorage.getItem(HIDDEN_KEY)
     .then(value => { if (mounted.current) setHiddenPlaces(parseHiddenPlaces(value, validIds)); })
     .catch(() => {});
   ```
4. Update `baseFiltered` pipeline:
   ```typescript
   const baseFiltered = useMemo(() => {
     return places.filter(p =>
       !hiddenPlaces.has(p.id) &&
       (!onlyFavorites || favorites.has(p.id)) &&
       (chain === 'All' || p.chain === chain) &&
       matchesSearch(p, query)
     );
   }, [hiddenPlaces, onlyFavorites, favorites, chain, query]);
   ```
5. Pass `favoriteIds={Array.from(favorites)}` to `MapCanvas`.
6. Add `[ ❤️ ]` chip before `[ All ]` in filter scroll row.
7. Implement `hidePlace(placeId)`:
   - Add to `hiddenPlaces`.
   - Persist to `AsyncStorage`.
   - If `selectedId === placeId`, clear selection.
   - Show `notice` with "Undo" button: `"Café hidden"` + `Undo`.
8. Wire `onHide={() => hidePlace(selected.id)}` and `onHide={() => hidePlace(item.id)}`.
9. In About modal, add "Hidden places" section:
   - Count of hidden places.
   - List of hidden places with "Unhide" button for each.
   - "Unhide all" button when count > 0.
10. Remove `<SafeAreaView edges={['bottom']} style={s.navSafe}>` and replace with:
   ```typescript
   <FloatingModeButton
     mode={mode}
     onToggle={() => {
       setMode(m => m === 'map' ? 'list' : 'map');
       setSelectedId(null);
       haptic();
     }}
     visible={mode === 'list' || !selectedId}
   />
   ```
11. Update back handler: when `mode === 'list'`, switch back to `'map'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add App.tsx tests/regressions.test.ts
git commit -m "feat(app): integrate unified filter pipeline, heart chip, hidden places, and floating mode button"
```

---

### Task 6: Full Verification, Typecheck, and Documentation

**Files:**
- Modify: `docs/index.md` (or relevant docs in `docs/`)
- Test: Full test suite

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 2: Run full test suite**

Run: `npm test`  
Expected: PASS with all tests passing.

- [ ] **Step 3: Document changes in `docs/`**

Update `docs/index.md` and `DESIGN.md` / `PRODUCT.md` where navigation or filters are referenced.

- [ ] **Step 4: Commit**

```bash
git add docs/ DESIGN.md PRODUCT.md
git commit -m "docs: document decoupled navigation, unified filter bar, and place hiding"
```
