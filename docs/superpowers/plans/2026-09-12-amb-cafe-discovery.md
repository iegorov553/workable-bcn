# AMB Cafe Discovery & Catalog Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover and import all operating cafes belonging to the 7 target chains across the 36 municipalities of the Barcelona Metropolitan Area (AMB) into `src/data/places.json` using Google Places API (New) with automated deduplication and report generation.

**Architecture:** Implement `scripts/discover-amb-cafes.mjs` to execute a search matrix across 36 AMB municipalities and 10 Barcelona districts for all 7 brands. Provide pure, testable helpers for geographic bounding box validation, brand name filtering, address normalization, and multi-level catalog deduplication (matching by `googlePlaceId`, proximity $\le 50$m for enrichment, and $> 50$m for new candidates). Cache all API responses in `.cache/amb-discovery-cache.json` and generate an audit report at `docs/data/amb-candidates.json`.

**Tech Stack:** Node.js 22 (native `fetch`, `node:test`, `node:assert/strict`), Google Places API (New) Text Search, TypeScript 6.

**Spec:** `docs/superpowers/specs/2026-09-12-amb-cafe-discovery-design.md`

## Global Constraints

- **Zero Runtime Dependencies**: No new runtime npm packages. Use native Node.js built-ins (`fetch`, `node:fs`, `node:path`, `node:assert`).
- **AMB Geographic Bounding Box**: $41.20 \le \text{lat} \le 41.55$, $1.90 \le \text{lon} \le 2.35$.
- **Catalog Integrity**: All records in `src/data/places.json` must continue to pass `scripts/check-places.mjs`.
- **Dry-run by default**: The script must generate a report without modifying `src/data/places.json` unless `--apply` is explicitly provided.
- **Deduplication Threshold**: Proximity $\le 50$m with matching chain is treated as the same cafe; $> 50$m creates a new candidate.

---

### Task 1: Discovery & Deduplication Logic with Unit Tests (TDD)

**Files:**
- Create: `tests/discover-amb.test.ts`
- Create: `scripts/discover-amb-cafes.mjs`

**Interfaces:**
- Produces: `isWithinAmbBoundingBox`, `matchesBrand`, `formatAmbAddress`, `generatePlaceId`, `deduplicateAgainstCatalog` exported from `scripts/discover-amb-cafes.mjs`.

- [ ] **Step 1: Write failing unit tests in `tests/discover-amb.test.ts`**

Create `tests/discover-amb.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinAmbBoundingBox,
  matchesBrand,
  formatAmbAddress,
  generatePlaceId,
  deduplicateAgainstCatalog,
} from '../scripts/discover-amb-cafes.mjs';
import type { Place } from '../src/types.ts';

test('isWithinAmbBoundingBox accepts coordinates within AMB and rejects outliers', () => {
  // Plaça Catalunya
  assert.equal(isWithinAmbBoundingBox(41.3870, 2.1700), true);
  // Badalona center
  assert.equal(isWithinAmbBoundingBox(41.4500, 2.2470), true);
  // Castelldefels
  assert.equal(isWithinAmbBoundingBox(41.2800, 1.9760), true);
  // Madrid (outlier)
  assert.equal(isWithinAmbBoundingBox(40.4168, -3.7038), false);
  // Girona (outlier)
  assert.equal(isWithinAmbBoundingBox(41.9794, 2.8214), false);
});

test('matchesBrand verifies chain brand name in Google display name', () => {
  assert.equal(matchesBrand('365 Obrador Balmes', '365 Café'), true);
  assert.equal(matchesBrand('Cafeteria 365', '365 Café'), true);
  assert.equal(matchesBrand('Granier Bakery', 'Granier'), true);
  assert.equal(matchesBrand('Vivari coffee & bakery', 'Vivari'), true);
  assert.equal(matchesBrand('Santagloria Coffee', 'Santagloria'), true);
  assert.equal(matchesBrand('El Fornet', 'El Fornet'), true);
  assert.equal(matchesBrand('SandwiChez Diagonal', 'SandwiChez'), true);
  assert.equal(matchesBrand('Buenas Migas Gràcia', 'Buenas Migas'), true);
  // Unrelated bakery
  assert.equal(matchesBrand('Forn de Pa Garcia', '365 Café'), false);
});

test('formatAmbAddress formats clean address with municipality suffix', () => {
  const formatted = formatAmbAddress(
    'Av. del Carrilet, 142, 08902 L\'Hospitalet de Llobregat, Barcelona, Spain',
    'L\'Hospitalet de Llobregat'
  );
  assert.equal(formatted, 'Av. del Carrilet, 142 · L\'Hospitalet de Llobregat');
});

test('generatePlaceId creates canonical slug-lat-lon ID', () => {
  const id = generatePlaceId('365 Café', 41.365421, 2.112431);
  assert.equal(id, '365-caf--41.365421-2.112431');
});

test('deduplicateAgainstCatalog categorizes existing, enrichable, and new candidates', () => {
  const existingPlaces: Place[] = [
    {
      id: 'vivari-existing',
      name: 'Vivari - Central',
      chain: 'Vivari',
      address: 'Gran Via, 500 · Eixample',
      latitude: 41.3850,
      longitude: 2.1600,
      googlePlaceId: 'ChIJExistingPlace1',
    },
    {
      id: 'granier-no-place-id',
      name: 'Granier - Local',
      chain: 'Granier',
      address: 'Carrer de Sants, 50 · Sants-Montjuïc',
      latitude: 41.3750,
      longitude: 2.1350,
    },
  ];

  const candidates = [
    // 1. Exact place_id match
    {
      id: 'ChIJExistingPlace1',
      displayName: { text: 'Vivari' },
      formattedAddress: 'Gran Via, 500, Barcelona',
      location: { latitude: 41.3850, longitude: 2.1600 },
      googleMapsUri: 'https://maps.google.com/?cid=1',
      chain: 'Vivari',
      municipality: 'Barcelona',
    },
    // 2. Proximity match (<50m) to granier-no-place-id (needs enrichment)
    {
      id: 'ChIJGranierNewPlaceId',
      displayName: { text: 'Granier' },
      formattedAddress: 'Carrer de Sants, 52, Barcelona',
      location: { latitude: 41.3751, longitude: 2.1351 }, // ~14m away
      googleMapsUri: 'https://maps.google.com/?cid=2',
      chain: 'Granier',
      municipality: 'Barcelona',
    },
    // 3. New candidate in Badalona (>50m away from everything)
    {
      id: 'ChIJBadalona365',
      displayName: { text: '365 Obrador' },
      formattedAddress: 'Carrer de Mar, 10, Badalona',
      location: { latitude: 41.4480, longitude: 2.2470 },
      googleMapsUri: 'https://maps.google.com/?cid=3',
      chain: '365 Café',
      municipality: 'Badalona',
    },
  ];

  const result = deduplicateAgainstCatalog(candidates, existingPlaces, 50);
  assert.equal(result.alreadyInCatalog.length, 1);
  assert.equal(result.alreadyInCatalog[0].id, 'ChIJExistingPlace1');

  assert.equal(result.enrichedExisting.length, 1);
  assert.equal(result.enrichedExisting[0].existingId, 'granier-no-place-id');
  assert.equal(result.enrichedExisting[0].googlePlaceId, 'ChIJGranierNewPlaceId');

  assert.equal(result.newCandidates.length, 1);
  assert.equal(result.newCandidates[0].googlePlaceId, 'ChIJBadalona365');
  assert.equal(result.newCandidates[0].chain, '365 Café');
  assert.match(result.newCandidates[0].address, /· Badalona/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --experimental-transform-types --test tests/discover-amb.test.ts
```
Expected: FAIL with `Cannot find module '../scripts/discover-amb-cafes.mjs'`

- [ ] **Step 3: Implement helper functions in `scripts/discover-amb-cafes.mjs`**

Implement `isWithinAmbBoundingBox`, `matchesBrand`, `formatAmbAddress`, `generatePlaceId`, and `deduplicateAgainstCatalog` in `scripts/discover-amb-cafes.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --experimental-transform-types --test tests/discover-amb.test.ts
```
Expected: PASS (all 5 tests pass).

- [ ] **Step 5: Commit**

```bash
git add tests/discover-amb.test.ts scripts/discover-amb-cafes.mjs
git commit -m "feat(discovery): add AMB helper functions and deduplication logic with unit tests"
```

---

### Task 2: Search Matrix, CLI Discovery Engine & npm Scripts

**Files:**
- Modify: `scripts/discover-amb-cafes.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: Complete CLI runner with `--apply`, `--cities`, `--chains`, `--cache-file`, producing `docs/data/amb-candidates.json`.
- CLI Scripts: `npm run discover:amb`, `npm run discover:amb:apply`.

- [ ] **Step 1: Implement full search matrix and Google Places API queries in `scripts/discover-amb-cafes.mjs`**

- Define list of 36 AMB municipalities + 10 Barcelona districts.
- Define search tokens for all 7 chains.
- Read API key from `.env` or argument.
- Read/write cache to `.cache/amb-discovery-cache.json`.
- Execute search query `places:searchText` for each (chain, municipality) combination.
- Filter candidates by bounding box and brand match.
- Run `deduplicateAgainstCatalog`.
- Output report to `docs/data/amb-candidates.json`.
- Print summary table broken down by municipality and chain.
- When `--apply` is present:
  - Append new candidates to `src/data/places.json`.
  - Enrich existing venues with missing `googlePlaceId`.
  - Write updated `src/data/places.json`.
  - Run `check-places.mjs`.

- [ ] **Step 2: Add npm scripts to `package.json`**

```json
"discover:amb": "node scripts/discover-amb-cafes.mjs",
"discover:amb:apply": "node scripts/discover-amb-cafes.mjs --apply"
```

- [ ] **Step 3: Verify CLI usage output without API key**

Run:
```bash
node scripts/discover-amb-cafes.mjs --api-key=""
```
Expected: Exits cleanly with usage guide.

- [ ] **Step 4: Run unit tests**

Run:
```bash
node --experimental-transform-types --test tests/discover-amb.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/discover-amb-cafes.mjs package.json
git commit -m "feat(discovery): implement AMB Google Places discovery engine and CLI commands"
```

---

### Task 3: Execution, Discovery Verification & Documentation

**Files:**
- Modify: `docs/CAFE-AUDIT.md`
- Generates: `docs/data/amb-candidates.json`
- Modifies (if applied): `src/data/places.json`

- [ ] **Step 1: Document the AMB discovery pipeline in `docs/CAFE-AUDIT.md`**

Add a dedicated section detailing:
- The 36 municipalities of AMB.
- The discovery workflow (`npm run discover:amb` and `npm run discover:amb:apply`).
- How deduplication prevents double entries.
- Results and statistics.

- [ ] **Step 2: Run all verification commands**

```bash
npm run check:places
npm run typecheck
node --experimental-transform-types --test tests/directions.test.ts tests/audit-places.test.ts tests/discover-amb.test.ts
```
Expected: All tests pass with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/CAFE-AUDIT.md
git commit -m "docs: document AMB cafe discovery pipeline and metropolitan coverage"
```
