# Google Places Integration & POI Routing Design

## Summary

Enable high-precision walking navigation to official Google Maps POIs (Points of Interest) for cafes in Workable BCN, while preserving fallback navigation to coordinates. Add an offline audit and enrichment script powered by the Google Places API to populate `googlePlaceId` and `googleMapsUrl` for catalog entries and detect closed cafes (`CLOSED_PERMANENTLY`, `CLOSED_TEMPORARILY`).

---

## 1. Problem Statement

Currently, tapping "Directions" in the mobile app opens Google Maps with raw coordinates:
```
https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}&travelmode=walking
```
This drops an unnamed pin on the map instead of resolving the actual venue POI. Consequently:
1. Google Maps does not show the cafe's listing card, operating hours, current open/closed status, or reviews.
2. The user and developers lack a reliable mechanism to verify whether catalog cafes are still open or permanently closed.

---

## 2. Architecture & Components

```mermaid
flowchart TD
    subgraph Data Enrichment & Audit Pipeline (Offline)
        PlacesJSON["src/data/places.json<br/>(520 venues)"] --> Script["scripts/audit-google-places.mjs"]
        Cache[".cache/google-places-cache.json"] <--> Script
        GoogleAPI["Google Places API (New)<br/>Text Search"] <--> Script
        Script --> Report["docs/data/google-places-audit.json"]
        Script -- "--apply" --> PlacesJSON
    end

    subgraph Mobile Application (Runtime)
        PlacesJSON --> App["App.tsx & PlaceCard.tsx"]
        App --> DirUtil["src/utils/directions.ts<br/>getDirectionsUrl()"]
        DirUtil --> GMaps["Google Maps Universal URL<br/>(destination_place_id & destination)"]
    end
```

### 2.1 Data Model (`src/types.ts`)

Extend the `Place` type with optional Google Maps identifiers:

```typescript
export type Place = {
  id: string;
  name: string;
  chain: string;
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string; // Google Place ID (e.g. "ChIJ...")
  googleMapsUrl?: string; // Canonical URL to Google Maps venue listing
  verification?: {
    status: 'listed' | 'unverified';
    checkedAt: string;
    sourceUrl: string;
    note?: string;
  };
};
```

- Backward-compatible: missing `googlePlaceId` or `googleMapsUrl` does not break any existing code.
- Stored directly in `src/data/places.json`.

### 2.2 Routing Logic (`src/utils/directions.ts`)

Create a dedicated pure utility `src/utils/directions.ts`:

```typescript
import type { Place } from '../types';

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

In `App.tsx`:
Replace inline URL construction in `openDirections` with `getDirectionsUrl(place)`.

### 2.3 Verification & Consistency Checks (`scripts/check-places.mjs`)

Update the integrity assertion script:
- If `place.googlePlaceId` is provided, verify it is a non-empty string matching valid Place ID format (`/^[A-Za-z0-9_-]{15,80}$/`).
- If `place.googleMapsUrl` is provided, verify it starts with `https://`.

### 2.4 Google Places Audit & Enrichment Script (`scripts/audit-google-places.mjs`)

A Node.js CLI script using native `fetch` (ESM):

#### Command Line Interface
- `node scripts/audit-google-places.mjs` — Dry-run mode: searches Google Places, compares coordinates, generates audit report, prints summary table. Does NOT modify `places.json`.
- `node scripts/audit-google-places.mjs --apply` — Applies matches to `src/data/places.json` by populating `googlePlaceId` and `googleMapsUrl`.
- Options:
  - `--api-key=<KEY>`: Google API key (defaults to `process.env.GOOGLE_MAPS_API_KEY`).
  - `--cache`: Read/write local responses to `.cache/google-places-cache.json` (prevents duplicate API billing during testing/runs).
  - `--concurrency=<N>`: Request concurrency (default 5, with retry logic for 429/500).

#### Google Places API Integration
- Endpoint: `POST https://places.googleapis.com/v1/places:searchText`
- Headers:
  - `X-Goog-Api-Key: <KEY>`
  - `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.rating,places.userRatingCount`
- Request body:
  ```json
  {
    "textQuery": "<Chain> <Name> <Address>",
    "locationBias": {
      "circle": {
        "center": { "latitude": place.latitude, "longitude": place.longitude },
        "radius": 150.0
      }
    }
  }
  ```

#### Matching & Quality Safeguards
1. **Distance validation**: Compute Haversine distance between our catalog coordinates and the Google Place location.
   - If distance $\le 150$ m: valid geographical match.
   - If distance $> 150$ m: marked as `DISTANCE_MISMATCH` and requires manual review.
2. **Status categorization**:
   - `OPERATIONAL`: Healthy venue. `googlePlaceId` and `googleMapsUrl` added upon `--apply`.
   - `CLOSED_PERMANENTLY`: Flagged in audit report with high priority warning. Not automatically assigned without developer confirmation.
   - `CLOSED_TEMPORARILY`: Flagged in audit report.
   - `NOT_FOUND`: No candidates returned within bias area.

#### Output Deliverables
- Report saved to: `docs/data/google-places-audit.json`.
- Terminal summary table showing total venues, operational, permanently closed, temporarily closed, and unmatched count.

---

## 3. npm Scripts

Add to `package.json`:
- `"audit:places": "node scripts/audit-google-places.mjs"`
- `"audit:places:apply": "node scripts/audit-google-places.mjs --apply"`

---

## 4. Verification Plan

### Automated Tests
1. `tests/directions.test.ts`:
   - Unit test `getDirectionsUrl` with `place.googlePlaceId` present: asserts `destination_place_id` and encoded query are in URL.
   - Unit test `getDirectionsUrl` with `place.googlePlaceId` absent: asserts fallback to `${latitude},${longitude}`.
   - Unit test URL encoding with special Catalan characters (accents, ç, ·).
2. `npm run check:places`:
   - Validates that `places.json` passes all structural assertions.
3. `npm run typecheck`:
   - Validates TypeScript types across the entire project.

### Manual Verification
- Run dry-run audit script with a test API key or mock data.
- Verify generated audit report structure in `docs/data/google-places-audit.json`.
- Test opening a venue in the mobile app / web preview, verifying Google Maps resolves the POI sheet.
