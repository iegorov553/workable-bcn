# Equidistant Cafes (Travel Time & Meet Halfway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-cost, zero-latency, 100% offline "Meet Halfway" feature in Workable BCN that finds and ranks cafes equidistant from two points (You & Friend) based on estimated travel time across the Barcelona rapid transit network (Metro, FGC, Tram) and urban walking routes.

**Architecture:** 
1. Embed an accurate static transit graph (`src/data/bcn-transit-network.json`) of all ~180 rapid transit stations in Barcelona and immediate suburbs (Metro L1–L11, FGC L6–L8, L12, Tram T1–T6) with coordinates, lines, and connection times.
2. Implement a lightning-fast Dijkstra + urban walking routing engine (`src/utils/transit-routing.ts`) to estimate travel times ($< 5\text{ ms}$ for 506 venues).
3. Implement a fairness ranking engine (`src/utils/equidistant-ranking.ts`) scoring candidates with $\text{Score} = |T_A - T_B| + 0.5 \times \max(T_A, T_B)$.
4. Extend the Leaflet WebView bridge (`src/utils/map-bridge.ts` & `src/map/map-runtime.js`) to capture map clicks and render friend markers with auto-framing camera bounds.
5. Add the "Meet Halfway" UI panel to `App.tsx`, dual-transit badges to `src/components/PlaceCard.tsx`, and friend directions sharing.

**Tech Stack:** React Native 0.86 / Expo 57, Leaflet 1.9.4 inside WebView, Node.js 22 (`node:test`, `node:assert/strict`), TypeScript 6.

**Spec:** `docs/superpowers/specs/2026-09-12-equidistant-cafes-travel-time-design.md`

## Global Constraints

- **Zero External API Costs & No API Keys**: Entirely client-side, zero backend, works 100% offline.
- **Strict Visual & Architectural Integrity**: Retain editorial cream/sand/ivory theme, Fraunces + Roboto fonts, English UI copy, and existing 506 cafe catalogue.
- **Expo SDK 57 & Node 22 Test Runner**: Use `node --experimental-transform-types --test` for tests; no added heavy dependencies.
- **WebView Bridge Rule**: When modifying `src/map/map-runtime.js`, always rebuild bundled HTML via `npm run map:build` and verify `tests/map-document.test.ts` passes.

---

### Task 1: Barcelona Rapid Transit Network Dataset & Validation (TDD)

**Files:**
- Create: `src/types/transit.ts`
- Create: `src/data/bcn-transit-network.json`
- Test: `tests/transit-network.test.ts`

**Interfaces:**
- Produces `TransitStation`, `TransitConnection`, `TransitNetwork` in `src/types/transit.ts`.
- Produces validated JSON data in `src/data/bcn-transit-network.json`.

- [ ] **Step 1: Define TypeScript interfaces in `src/types/transit.ts`**

```typescript
export type TransitConnection = {
  targetId: string;
  travelMinutes: number;
  line: string;
};

export type TransitStation = {
  id: string;
  name: string;
  lines: string[];
  latitude: number;
  longitude: number;
  connections: TransitConnection[];
};

export type TransitNetwork = {
  version: string;
  transferPenaltyMinutes: number;
  stations: TransitStation[];
};
```

- [ ] **Step 2: Write failing unit test in `tests/transit-network.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TransitNetwork } from '../src/types/transit.ts';

const network = JSON.parse(
  readFileSync(new URL('../src/data/bcn-transit-network.json', import.meta.url), 'utf8')
) as TransitNetwork;

test('transit network includes major BCN metro/train lines and valid coordinates', () => {
  assert.ok(network.stations.length >= 150, 'Network should contain >= 150 stations');
  assert.equal(network.transferPenaltyMinutes, 3.5);

  const lines = new Set(network.stations.flatMap(s => s.lines));
  for (const requiredLine of ['L1', 'L2', 'L3', 'L4', 'L5', 'L9N', 'L9S', 'L10N', 'L10S', 'L6', 'L7', 'L8', 'T1', 'T4']) {
    assert.ok(lines.has(requiredLine), `Missing line ${requiredLine}`);
  }

  // Check key transfer stations
  const catalunya = network.stations.find(s => s.id === 'catalunya');
  assert.ok(catalunya, 'Catalunya station must exist');
  assert.ok(catalunya.lines.includes('L1') && catalunya.lines.includes('L3'));

  // Ensure coordinates fall within AMB bounding box
  for (const station of network.stations) {
    assert.ok(station.latitude >= 41.28 && station.latitude <= 41.48, `${station.name} lat out of range`);
    assert.ok(station.longitude >= 2.00 && station.longitude <= 2.26, `${station.name} lon out of range`);
    assert.ok(station.connections.length > 0, `${station.name} has no connections`);
  }
});

test('connections are bidirectional and specify positive travel times', () => {
  const stationMap = new Map(network.stations.map(s => [s.id, s]));
  for (const station of network.stations) {
    for (const conn of station.connections) {
      assert.ok(conn.travelMinutes > 0, `Connection from ${station.id} to ${conn.targetId} has invalid minutes`);
      const target = stationMap.get(conn.targetId);
      assert.ok(target, `Target station ${conn.targetId} not found`);
      const returnConn = target.connections.find(c => c.targetId === station.id && c.line === conn.line);
      assert.ok(returnConn, `Connection between ${station.id} and ${target.id} on line ${conn.line} must be bidirectional`);
    }
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/transit-network.test.ts`
Expected: FAIL (missing `src/data/bcn-transit-network.json`).

- [ ] **Step 4: Create complete transit network in `src/data/bcn-transit-network.json`**

Generate and bundle the complete rapid transit network graph containing all TMB Metro stations (L1, L2, L3, L4, L5, L9N/S, L10N/S, L11), FGC stations (L6, L7, L8, L12), and key Tram stations (T1–T6) with official coordinates and bidirectional edges.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/transit-network.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/transit.ts src/data/bcn-transit-network.json tests/transit-network.test.ts
git commit -m "feat(transit): add embedded Barcelona rapid transit network dataset and graph validation"
```

---

### Task 2: Transit & Walking Travel Time Routing Engine (TDD)

**Files:**
- Create: `src/utils/transit-routing.ts`
- Test: `tests/transit-routing.test.ts`

**Interfaces:**
- Consumes: `TransitStation`, `TransitNetwork` from `src/types/transit.ts`, `Coordinates` from `src/types.ts`.
- Produces: 
  - `estimateWalkingMinutes(origin: Coordinates, destination: Coordinates): number`
  - `findOptimalRoute(origin: Coordinates, destination: Coordinates, network?: TransitNetwork): RouteEstimate`
  - Exported type `RouteEstimate = { minutes: number; mode: 'walk' | 'transit'; stationIn?: string; stationOut?: string }`

- [ ] **Step 1: Write failing unit tests in `tests/transit-routing.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateWalkingMinutes, findOptimalRoute } from '../src/utils/transit-routing.ts';

// Sagrada Família coordinates
const SAGRADA_FAMILIA = { latitude: 41.4036, longitude: 2.1744 };
// Plaça Catalunya coordinates
const CATALUNYA = { latitude: 41.3870, longitude: 2.1700 };
// A spot 250m away from Sagrada Família
const NEAR_SAGRADA = { latitude: 41.4050, longitude: 2.1760 };

test('estimateWalkingMinutes applies urban Manhattan factor and 80m/min speed', () => {
  const walkMinutes = estimateWalkingMinutes(SAGRADA_FAMILIA, NEAR_SAGRADA);
  assert.ok(walkMinutes >= 2 && walkMinutes <= 5);
});

test('findOptimalRoute chooses walking for short distances (< 1 km)', () => {
  const route = findOptimalRoute(SAGRADA_FAMILIA, NEAR_SAGRADA);
  assert.equal(route.mode, 'walk');
  assert.ok(route.minutes <= 5);
});

test('findOptimalRoute chooses transit for cross-town trips (Sagrada Família to Sants Estació)', () => {
  const SANTS_ESTACIO = { latitude: 41.3809, longitude: 2.1402 };
  const route = findOptimalRoute(SAGRADA_FAMILIA, SANTS_ESTACIO);
  assert.equal(route.mode, 'transit');
  assert.ok(route.minutes >= 10 && route.minutes <= 25);
  assert.ok(route.stationIn, 'Boarding station must be identified');
  assert.ok(route.stationOut, 'Alighting station must be identified');
});

test('findOptimalRoute executes in sub-millisecond time', () => {
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    findOptimalRoute(SAGRADA_FAMILIA, CATALUNYA);
  }
  const avgMs = (performance.now() - start) / 50;
  assert.ok(avgMs < 2, `Routing too slow: ${avgMs}ms per call`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/transit-routing.test.ts`
Expected: FAIL (missing `src/utils/transit-routing.ts`).

- [ ] **Step 3: Implement `src/utils/transit-routing.ts`**

Implement Dijkstra priority queue over `bcn-transit-network.json` with urban walking distance ($1.25\times$ Manhattan correction at $80\text{ m/min}$). Pre-index stations for fast spatial nearest-neighbor search.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/transit-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/transit-routing.ts tests/transit-routing.test.ts
git commit -m "feat(routing): add fast Barcelona transit and walking route estimator"
```

---

### Task 3: Fairness Scoring & Multi-Origin Ranking (TDD)

**Files:**
- Create: `src/utils/equidistant-ranking.ts`
- Test: `tests/equidistant-ranking.test.ts`

**Interfaces:**
- Consumes: `Place`, `Coordinates` from `src/types.ts`, `findOptimalRoute` from `src/utils/transit-routing.ts`.
- Produces:
  - `calculateEquidistantScore(timeA: number, timeB: number): number`
  - `rankEquidistantPlaces(places: Place[], originA: Coordinates, originB: Coordinates): EquidistantMatch[]`
  - Exported type `EquidistantMatch = { place: Place; timeA: number; modeA: 'walk'|'transit'; timeB: number; modeB: 'walk'|'transit'; deltaMinutes: number; score: number; isBestMatch: boolean; badgeLabel: string; }`

- [ ] **Step 1: Write failing unit tests in `tests/equidistant-ranking.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEquidistantScore, rankEquidistantPlaces } from '../src/utils/equidistant-ranking.ts';
import type { Place } from '../src/types.ts';

test('calculateEquidistantScore prioritizes balanced travel times over long equal ones', () => {
  const balanced = calculateEquidistantScore(20, 22); // |20-22| + 0.5 * 22 = 2 + 11 = 13
  const farEqual = calculateEquidistantScore(45, 45); // 0 + 22.5 = 22.5
  const unfair = calculateEquidistantScore(5, 35);    // 30 + 17.5 = 47.5

  assert.ok(balanced < farEqual, '20m/22m should score better than 45m/45m');
  assert.ok(farEqual < unfair, '45m/45m should score better than highly unfair 5m/35m');
});

test('calculateEquidistantScore is symmetric with respect to participant order', () => {
  assert.equal(calculateEquidistantScore(18, 24), calculateEquidistantScore(24, 18));
});

test('rankEquidistantPlaces ranks central cafes highest between Gràcia and Poblenou', () => {
  const GRACIA = { latitude: 41.4026, longitude: 2.1589 };
  const POBLENOU = { latitude: 41.4010, longitude: 2.2030 };

  const mockPlaces: Place[] = [
    { id: '1', name: 'Centre Cafe', chain: 'SandwiChez', address: 'Eixample', latitude: 41.3950, longitude: 2.1750 },
    { id: '2', name: 'Gracia Cafe', chain: '365', address: 'Gracia', latitude: 41.4020, longitude: 2.1590 },
    { id: '3', name: 'Badalona Outskirts', chain: 'Granier', address: 'Badalona', latitude: 41.4500, longitude: 2.2470 },
  ];

  const results = rankEquidistantPlaces(mockPlaces, GRACIA, POBLENOU);
  assert.equal(results[0].place.id, '1', 'Middle cafe should be ranked first');
  assert.ok(results[0].isBestMatch, 'First result should have isBestMatch true');
  assert.match(results[0].badgeLabel, /you · .* friend/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/equidistant-ranking.test.ts`
Expected: FAIL (missing `src/utils/equidistant-ranking.ts`).

- [ ] **Step 3: Implement `src/utils/equidistant-ranking.ts`**

Implement `calculateEquidistantScore`, `rankEquidistantPlaces`, and formatting helpers for UI badges (e.g. `🚇 18m you · 🚇 21m friend`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/equidistant-ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/equidistant-ranking.ts tests/equidistant-ranking.test.ts
git commit -m "feat(ranking): add fairness scoring and equidistant cafe ranking logic"
```

---

### Task 4: Leaflet Map Bridge & Runtime for Friend Marker and Map Tapping (TDD)

**Files:**
- Modify: `src/utils/map-bridge.ts`
- Modify: `src/map/map-runtime.js`
- Rebuild: `src/map/map-html.ts` (via `npm run map:build`)
- Test: `tests/map-bridge.test.ts`
- Test: `tests/map-document.test.ts`

**Interfaces:**
- `MapPayload` extended with `friendLocation: Coordinates | null` and `meetMode: boolean`.
- `MapMessage` extended with `{ type: 'mapClick'; latitude: number; longitude: number }`.

- [ ] **Step 1: Write failing tests in `tests/map-bridge.test.ts`**

Add tests to `tests/map-bridge.test.ts` verifying:
1. `MapPayload` serializes and deserializes `friendLocation` and `meetMode`.
2. `parseMapMessage` parses `{ type: 'mapClick', latitude: 41.389, longitude: 2.169 }` correctly.

- [ ] **Step 2: Update `src/utils/map-bridge.ts`**

Extend `MapPayload` and `MapMessage` types and update `parseMapMessage` to recognize `mapClick`.

- [ ] **Step 3: Update `src/map/map-runtime.js`**

Add `friendMarker` rendering (purple icon `#7C3AED` with white border, radius 8, popup "Friend is here"). Add map click handler dispatching `mapClick`. Add auto-fit bounds when both `userLocation` and `friendLocation` are present.

- [ ] **Step 4: Rebuild bundled HTML and verify tests**

Run: `npm run map:build`
Run: `npm test`
Expected: PASS (all 31+ tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/utils/map-bridge.ts src/map/map-runtime.js src/map/map-html.ts tests/map-bridge.test.ts
git commit -m "feat(map): add friend marker, map click dispatch, and dual bounds fitting in Leaflet runtime"
```

---

### Task 5: Meet Halfway UI, Card Badges, and Friend Directions Sharing

**Files:**
- Modify: `src/components/PlaceCard.tsx`
- Modify: `src/components/MapCanvas.tsx`
- Modify: `src/components/MapCanvas.web.tsx`
- Modify: `App.tsx`
- Test: `tests/regressions.test.ts`

**Features:**
1. **`PlaceCard.tsx`**: Support `matchBadge?: string | null` and `isBestMatch?: boolean` to render golden highlight badge (`★ Best match (Δ 2 min)`). Support `onShareFriendDirections` action.
2. **`MapCanvas.tsx` & `MapCanvas.web.tsx`**: Pass `friendLocation`, `meetMode`, and `onMapClick?: (coords: Coordinates) => void`.
3. **`App.tsx`**:
   - Add state: `meetMode: boolean`, `friendLocation: Coordinates | null`.
   - Add header button: `👥 Meet halfway` toggle.
   - When active, display Meet Bar:
     - Point A: "You" (with GPS location or button to place on map).
     - Point B: "Friend" (status or *"Tap on map to set friend's pin"*).
     - Close button (✕) to exit Meet mode.
   - Map click handler: when `meetMode` is active, sets `friendLocation` and triggers haptics.
   - Places list / filtered places: when in `meetMode` and both points are set, reorder using `rankEquidistantPlaces`.
   - Friend directions sharing: generates Google Maps directions link for friend and calls `Share.share`.
   - BackHandler: closes selected card first, then exits `meetMode`.

- [ ] **Step 1: Update `src/components/PlaceCard.tsx`**

Add props `matchBadge`, `isBestMatch`, and `onShareFriend`. Render the travel breakdown and best match indicator cleanly.

- [ ] **Step 2: Update `src/components/MapCanvas.tsx` and `src/components/MapCanvas.web.tsx`**

Expose `friendLocation`, `meetMode`, and `onMapClick` callback on message event `mapClick`.

- [ ] **Step 3: Update `App.tsx` with Meet Mode state and UI panel**

Implement the state, header toggle button, Meet Bar banner, map click handler, ranking computation, and hardware back button handling.

- [ ] **Step 4: Update test suite in `tests/regressions.test.ts`**

Add regression test verifying that place cards accept equidistant badge props and that sorting preserves favorites compatibility.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run typecheck`
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/PlaceCard.tsx src/components/MapCanvas.tsx src/components/MapCanvas.web.tsx App.tsx tests/regressions.test.ts
git commit -m "feat(ui): integrate Meet Halfway panel, dual-transit cards, and friend navigation sharing"
```

---

### Task 6: Full Verification & Polish

**Files:**
- Modify: `README.md`
- Test: All automated verification scripts

- [ ] **Step 1: Run full verification suite**

Run:
```bash
npm run typecheck
npm test
npm run check:places
```
Expected: All suites PASS with zero errors.

- [ ] **Step 2: Update `README.md`**

Add a brief section explaining the new "Meet Halfway" feature and its offline transit routing capabilities.

- [ ] **Step 3: Commit and push/final status**

```bash
git add README.md
git commit -m "docs: document Meet Halfway feature and rapid transit routing in README"
```
