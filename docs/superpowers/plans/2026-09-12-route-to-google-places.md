# Google Places Integration & POI Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route mobile app users directly to verified Google Maps POI listings (`destination_place_id`) while adding an offline Google Places audit and enrichment script to detect permanently closed venues and populate place IDs and direct URLs.

**Architecture:** Extend the `Place` schema with optional `googlePlaceId` and `googleMapsUrl` fields. Extract route URL generation into a pure utility `src/utils/directions.ts` that builds Google Universal Directions URLs with `destination_place_id` and falls back to coordinate navigation. Implement an offline Node.js audit script using Google Places API (New) Text Search with coordinate bias, distance tolerance checking (150m), local caching, and JSON report generation.

**Tech Stack:** TypeScript 6, Node.js 22 (native `fetch`, `node:test`, `node:assert/strict`), React Native / Expo 57, Google Maps Universal URLs, Google Places API (New).

**Spec:** `docs/superpowers/specs/2026-09-11-route-to-google-places-design.md`

## Global Constraints

- **Expo / React Native**: Follow Expo SDK 57 requirements (read docs at `https://docs.expo.dev/versions/v57.0.0/`).
- **Zero Runtime Dependencies**: No new runtime npm packages in `package.json`. The audit script must use native Node.js ESM `fetch` and built-in modules (`node:fs`, `node:path`, `node:assert`).
- **Non-breaking Fallback**: Venues without a `googlePlaceId` must gracefully fall back to the existing coordinate navigation format (`destination=${latitude},${longitude}&travelmode=walking`).
- **Audit Safety**: The audit script must run in dry-run mode by default. Data in `src/data/places.json` must only be modified when explicitly passing `--apply`.
- **Integrity**: All 520 existing venue records and legacy IDs must remain intact and valid under `scripts/check-places.mjs`.

---

### Task 1: Extend Place Schema and Data Validation

**Files:**
- Modify: `src/types.ts:1-15`
- Modify: `scripts/check-places.mjs:1-19`

**Interfaces:**
- Consumes: Existing `Place` type from `src/types.ts`.
- Produces: Updated `Place` type with `googlePlaceId?: string` and `googleMapsUrl?: string`.

- [ ] **Step 1: Update the `Place` type definition in `src/types.ts`**

Edit `src/types.ts` to include `googlePlaceId` and `googleMapsUrl`:

```typescript
export type Place = {
  id: string;
  name: string;
  chain: string;
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  verification?: {
    status: 'listed' | 'unverified';
    checkedAt: string;
    sourceUrl: string;
    note?: string;
  };
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ViewMode = 'map' | 'list' | 'saved';
```

- [ ] **Step 2: Add validation rules in `scripts/check-places.mjs`**

Update `scripts/check-places.mjs` to validate `googlePlaceId` and `googleMapsUrl` if present:

```javascript
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const places=JSON.parse(await readFile('src/data/places.json','utf8'));
const originals=JSON.parse(await readFile('docs/data/original-places.json','utf8'));
const ids=new Set();
for(const p of places) {
 assert.ok(p.id&&p.chain&&p.name&&p.address,'Missing identifying field');
 assert.ok(!ids.has(p.id),`Duplicate ID: ${p.id}`);ids.add(p.id);
 assert.ok(Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90,`Invalid latitude: ${p.id}`);
 assert.ok(Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180,`Invalid longitude: ${p.id}`);
 assert.ok(['listed','unverified'].includes(p.verification?.status),`No audit status: ${p.id}`);
 assert.ok(/^https:\/\//.test(p.verification.sourceUrl),`No source: ${p.id}`);
 assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.verification.checkedAt),`Invalid date: ${p.id}`);
 if (p.googlePlaceId !== undefined) {
   assert.ok(typeof p.googlePlaceId === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(p.googlePlaceId), `Invalid googlePlaceId format: ${p.id}`);
 }
 if (p.googleMapsUrl !== undefined) {
   assert.ok(typeof p.googleMapsUrl === 'string' && /^https:\/\//.test(p.googleMapsUrl), `Invalid googleMapsUrl format: ${p.id}`);
 }
}
for(const p of originals) assert.ok(ids.has(p.id),`Lost favorite ID: ${p.id}`);
const gignas=places.find(p=>p.id.startsWith('sandwichez-')&&p.address.includes('Gignàs'));
assert.equal(gignas?.chain,'Buenas Migas','Gignàs was incorrectly classified in the old map');
console.log(`${places.length} records valid; all ${originals.length} legacy IDs preserved.`);
```

- [ ] **Step 3: Run data check and typecheck to verify existing data passes**

Run:
```bash
npm run check:places
npm run typecheck
```
Expected:
`520 records valid; all 432 legacy IDs preserved.`
TypeScript exits with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts scripts/check-places.mjs
git commit -m "feat(types): add googlePlaceId and googleMapsUrl to Place schema"
```

---

### Task 2: Directions URL Utility and App Navigation (TDD)

**Files:**
- Create: `tests/directions.test.ts`
- Create: `src/utils/directions.ts`
- Modify: `App.tsx:94-97`

**Interfaces:**
- Consumes: `Place` from `src/types.ts`.
- Produces: `getDirectionsUrl(place: Place): string`.

- [ ] **Step 1: Write the failing test in `tests/directions.test.ts`**

Create `tests/directions.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDirectionsUrl } from '../src/utils/directions.ts';
import type { Place } from '../src/types.ts';

const basePlace: Place = {
  id: 'test-cafe',
  name: "Santagloria Coffee & Bakery",
  chain: 'Santagloria',
  address: "Carrer d'Aragó, 205 · Eixample",
  latitude: 41.3884,
  longitude: 2.1596,
};

test('getDirectionsUrl builds Universal URL with destination_place_id when present', () => {
  const placeWithGoogle: Place = {
    ...basePlace,
    googlePlaceId: 'ChIJuaKigICipBIR1uW0YeZo_2M',
  };

  const url = getDirectionsUrl(placeWithGoogle);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
  assert.match(url, /destination_place_id=ChIJuaKigICipBIR1uW0YeZo_2M/);
  assert.match(url, /travelmode=walking/);
  assert.match(url, /destination=Santagloria%20Coffee%20%26%20Bakery%2C%20Carrer%20d'Arag%C3%B3%2C%20205%20%C2%B7%20Eixample/);
});

test('getDirectionsUrl falls back to coordinates when googlePlaceId is absent', () => {
  const url = getDirectionsUrl(basePlace);
  assert.equal(
    url,
    'https://www.google.com/maps/dir/?api=1&destination=41.3884,2.1596&travelmode=walking'
  );
});

test('getDirectionsUrl correctly encodes Catalan and special characters in query', () => {
  const placeWithSpecialChars: Place = {
    ...basePlace,
    name: "Cafè de l'Òpera",
    address: 'La Rambla, 74 · Ciutat Vella',
    googlePlaceId: 'ChIJTestPlaceId12345',
  };

  const url = getDirectionsUrl(placeWithSpecialChars);
  assert.ok(url.includes('destination=Caf%C3%A8%20de%20l'%C3%92pera%2C%20La%20Rambla%2C%2074%20%C2%B7%20Ciutat%20Vella'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --experimental-transform-types --test tests/directions.test.ts
```
Expected: FAIL with `Cannot find module '../src/utils/directions.ts'`

- [ ] **Step 3: Implement `src/utils/directions.ts`**

Create `src/utils/directions.ts`:

```typescript
import type { Place } from '../types';

/**
 * Builds a Google Maps Universal Directions URL.
 * When `googlePlaceId` is present, uses `destination_place_id` alongside
 * a query-formatted destination for POI resolution in Google Maps.
 * Falls back to latitude,longitude when `googlePlaceId` is missing.
 */
export function getDirectionsUrl(place: Place): string {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const travelmode = 'travelmode=walking';

  if (place.googlePlaceId) {
    const destination = encodeURIComponent(`${place.name}, ${place.address}`);
    return `${base}&destination=${destination}&destination_place_id=${place.googlePlaceId}&${travelmode}`;
  }

  return `${base}&destination=${place.latitude},${place.longitude}&${travelmode}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --experimental-transform-types --test tests/directions.test.ts
```
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Connect `getDirectionsUrl` in `App.tsx`**

In `App.tsx`:
1. Import `getDirectionsUrl`:
   ```typescript
   import { getDirectionsUrl } from './src/utils/directions';
   ```
2. Replace lines 94-97:
   ```typescript
   const openDirections = (place: Place) => {
     void Linking.openURL(getDirectionsUrl(place))
       .catch(() => setNotice('Could not open directions. Check your maps app or browser.'));
   };
   ```

- [ ] **Step 6: Verify TypeScript compilation**

Run:
```bash
npm run typecheck
```
Expected: Exits with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils/directions.ts tests/directions.test.ts App.tsx
git commit -m "feat(navigation): use Google POI destination_place_id in directions URL with coordinate fallback"
```

---

### Task 3: Google Places Audit & Enrichment CLI Script

**Files:**
- Create: `scripts/audit-google-places.mjs`
- Create: `tests/audit-places.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/data/places.json`, Google Places API (New) Text Search endpoint.
- Produces: `docs/data/google-places-audit.json`, enriched `src/data/places.json` (when `--apply` is passed).
- CLI Scripts: `npm run audit:places`, `npm run audit:places:apply`.

- [ ] **Step 1: Write unit tests for audit script utilities in `tests/audit-places.test.ts`**

Test helper functions (haversine distance, matching logic, status categorization, query generation):

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Helper formulas that will be exported / used in audit script
export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function buildSearchQuery(chain: string, name: string, address: string): string {
  const cleanAddress = address.split('·')[0].trim();
  return `${chain} ${cleanAddress} Barcelona`;
}

test('haversineDistanceMeters computes accurate distance between Barcelona locations', () => {
  // Plaça Catalunya to Arc de Triomf is ~900-1000m
  const dist = haversineDistanceMeters(41.3870, 2.1700, 41.3910, 2.1806);
  assert.ok(dist > 900 && dist < 1100, `Expected ~1000m, got ${dist}`);
});

test('haversineDistanceMeters returns 0 for identical coordinates', () => {
  assert.equal(haversineDistanceMeters(41.3870, 2.1700, 41.3870, 2.1700), 0);
});

test('buildSearchQuery formats clean query stripping district suffixes', () => {
  const query = buildSearchQuery('365 Café', '365 Café - Balmes 206', 'Carrer Balmes, 206 · Sarrià-Sant Gervasi');
  assert.equal(query, '365 Café Carrer Balmes, 206 Barcelona');
});
```

- [ ] **Step 2: Run test to verify helper assertions pass**

Run:
```bash
node --experimental-transform-types --test tests/audit-places.test.ts
```
Expected: PASS (all 3 tests pass).

- [ ] **Step 3: Implement `scripts/audit-google-places.mjs`**

Create `scripts/audit-google-places.mjs` with:
- Parse arguments: `--apply`, `--api-key=<key>`, `--cache-file=<path>`, `--limit=<n>`.
- Read `GOOGLE_MAPS_API_KEY` from process environment or `.env` if present.
- If no API key provided, display clear usage instructions and exit gracefully.
- Load `src/data/places.json`.
- Load or initialize `.cache/google-places-cache.json`.
- For each place:
  - Check cache. If missing:
    - Query `https://places.googleapis.com/v1/places:searchText`.
    - Header: `X-Goog-Api-Key: KEY`, `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.rating,places.userRatingCount`.
    - Body:
      ```json
      {
        "textQuery": "${chain} ${cleanAddress} Barcelona",
        "locationBias": {
          "circle": {
            "center": { "latitude": place.latitude, "longitude": place.longitude },
            "radius": 150.0
          }
        }
      }
      ```
    - Cache response.
  - Evaluate candidates:
    - Match closest candidate within 150m.
    - Classify status: `OPERATIONAL`, `CLOSED_PERMANENTLY`, `CLOSED_TEMPORARILY`, `DISTANCE_MISMATCH` (>150m), or `NOT_FOUND`.
- Produce audit report in `docs/data/google-places-audit.json`.
- Print summary table:
  - Total scanned
  - Matched (OPERATIONAL)
  - Permanently Closed
  - Temporarily Closed
  - Unmatched / Distance Mismatches
- If `--apply` flag passed:
  - Update `src/data/places.json` with `googlePlaceId` and `googleMapsUrl` for operational places.
  - Log closed places with warning asking user to verify before manually removing.

```javascript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    apply: args.includes('--apply'),
    apiKey: process.env.GOOGLE_MAPS_API_KEY || null,
    limit: null,
  };
  for (const arg of args) {
    if (arg.startsWith('--api-key=')) flags.apiKey = arg.split('=')[1];
    if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.split('=')[1], 10);
  }
  return flags;
}

async function main() {
  const flags = parseArgs();
  const placesPath = path.resolve('src/data/places.json');
  const cacheDir = path.resolve('.cache');
  const cachePath = path.join(cacheDir, 'google-places-cache.json');
  const reportPath = path.resolve('docs/data/google-places-audit.json');

  if (!flags.apiKey) {
    console.log(`
[Google Places Audit]
Usage:
  GOOGLE_MAPS_API_KEY=your_key node scripts/audit-google-places.mjs [--apply] [--limit=10]

Options:
  --apply     Write googlePlaceId and googleMapsUrl to src/data/places.json for operational matches
  --limit=N   Only process the first N places (useful for dry runs)
`);
    process.exit(1);
  }

  await mkdir(cacheDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const places = JSON.parse(await readFile(placesPath, 'utf8'));
  let cache = {};
  if (existsSync(cachePath)) {
    try { cache = JSON.parse(await readFile(cachePath, 'utf8')); } catch {}
  }

  const subset = flags.limit ? places.slice(0, flags.limit) : places;
  console.log(`Auditing ${subset.length} places with Google Places API (New)...`);

  const report = {
    checkedAt: new Date().toISOString().split('T')[0],
    stats: { total: subset.length, operational: 0, closedPermanently: 0, closedTemporarily: 0, mismatch: 0, notFound: 0 },
    closedPermanently: [],
    closedTemporarily: [],
    mismatches: [],
    matched: [],
  };

  let appliedCount = 0;

  for (let i = 0; i < subset.length; i++) {
    const place = subset[i];
    const cleanAddress = place.address.split('·')[0].trim();
    const query = `${place.chain} ${cleanAddress} Barcelona`;
    const cacheKey = `${place.id}`;

    let data = cache[cacheKey];
    if (!data) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': flags.apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.rating,places.userRatingCount',
          },
          body: JSON.stringify({
            textQuery: query,
            locationBias: {
              circle: {
                center: { latitude: place.latitude, longitude: place.longitude },
                radius: 150.0,
              },
            },
          }),
        });

        if (!res.ok) {
          console.error(`API error for ${place.id} (${res.status}): ${await res.text()}`);
          continue;
        }

        data = await res.json();
        cache[cacheKey] = data;
        await writeFile(cachePath, JSON.stringify(cache, null, 2));
      } catch (err) {
        console.error(`Network error for ${place.id}:`, err);
        continue;
      }
    }

    const candidates = data.places || [];
    if (candidates.length === 0) {
      report.stats.notFound++;
      continue;
    }

    // Find candidate closest to our place coordinates
    let best = null;
    let minDistance = Infinity;
    for (const cand of candidates) {
      if (!cand.location) continue;
      const d = haversineDistanceMeters(place.latitude, place.longitude, cand.location.latitude, cand.location.longitude);
      if (d < minDistance) {
        minDistance = d;
        best = { ...cand, distanceMeters: Math.round(d) };
      }
    }

    if (!best || best.distanceMeters > 150) {
      report.stats.mismatch++;
      report.mismatches.push({ id: place.id, name: place.name, bestDistance: best?.distanceMeters });
      continue;
    }

    const status = best.businessStatus || 'OPERATIONAL';
    const record = {
      id: place.id,
      name: place.name,
      googlePlaceId: best.id,
      googleName: best.displayName?.text,
      googleMapsUri: best.googleMapsUri,
      distanceMeters: best.distanceMeters,
      businessStatus: status,
      rating: best.rating,
    };

    if (status === 'CLOSED_PERMANENTLY') {
      report.stats.closedPermanently++;
      report.closedPermanently.push(record);
    } else if (status === 'CLOSED_TEMPORARILY') {
      report.stats.closedTemporarily++;
      report.closedTemporarily.push(record);
    } else {
      report.stats.operational++;
      report.matched.push(record);

      if (flags.apply) {
        place.googlePlaceId = best.id;
        if (best.googleMapsUri) place.googleMapsUrl = best.googleMapsUri;
        appliedCount++;
      }
    }
  }

  await writeFile(reportPath, JSON.stringify(report, null, 2));

  if (flags.apply && appliedCount > 0) {
    await writeFile(placesPath, JSON.stringify(places, null, 2) + '\n');
    console.log(`\nUpdated ${appliedCount} places in ${placesPath}`);
  }

  console.log(`
=== Google Places Audit Summary ===
Total Scanned:      ${report.stats.total}
Operational:        ${report.stats.operational}
Closed Permanently: ${report.stats.closedPermanently}
Closed Temporarily: ${report.stats.closedTemporarily}
Mismatched (>150m): ${report.stats.mismatch}
Not Found:          ${report.stats.notFound}
Report written to:  ${reportPath}
`);
}

main().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Add audit scripts to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"audit:places": "node scripts/audit-google-places.mjs",
"audit:places:apply": "node scripts/audit-google-places.mjs --apply"
```

- [ ] **Step 5: Run script without API key to verify usage guidance**

Run:
```bash
npm run audit:places
```
Expected: Prints usage message and options clearly.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-google-places.mjs tests/audit-places.test.ts package.json
git commit -m "feat(scripts): add Google Places audit and catalog enrichment script"
```

---

### Task 4: Documentation and Regression Verification

**Files:**
- Modify: `docs/CAFE-AUDIT.md`
- Run: `npm run check:places`, `npm run typecheck`, `npm test`

- [ ] **Step 1: Document Google Places integration in `docs/CAFE-AUDIT.md`**

Add section to `docs/CAFE-AUDIT.md` describing how `npm run audit:places` works, how Google Places API verifies closures, and how `googlePlaceId` / `googleMapsUrl` enrich the dataset.

- [ ] **Step 2: Run all verification commands**

Run:
```bash
npm run check:places
npm run typecheck
node --experimental-transform-types --test tests/directions.test.ts tests/audit-places.test.ts
```
Expected:
- All checks pass with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/CAFE-AUDIT.md
git commit -m "docs: document Google Places POI routing and audit pipeline"
```
