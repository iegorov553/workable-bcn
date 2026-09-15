# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Remote workers, digital nomads, expats, and students in Barcelona looking for verified, laptop-friendly café chains to work, study, or meet.

## Product Purpose

A focused, fast mobile guide to Barcelona café locations (365 Café, Buenas Migas, El Fornet, Granier, Sandwichez, Santagloria, Vivari). Success means a user can open the app, immediately see the closest options on a map or list, check distance and walking directions, and save favourite spots without friction.

## Positioning

Zero-friction, private, and offline-first: no accounts, no subscriptions, no ads, and no tracking. Curated specifically for Barcelona's established bakery-café chains with verified address directories rather than crowdsourced clutter.

## Operating Context

- Mobile on-the-go usage across Barcelona neighborhoods.
- Users often need quick walking directions via Google Maps or Apple Maps while walking between co-workings, apartments, or appointments.
- Offline situations (metro, roaming issues): addresses and favorites remain instantly accessible on device.

## Capabilities and Constraints

- **Capabilities**:
  - Interactive map view (Leaflet via WebView) and scrollable list view.
  - Geolocation support for distance calculation and sorting.
  - Local favourites storage (AsyncStorage) without remote account requirements.
  - Search by street name, branch name, and filter by café chain.
  - One-tap navigation link to external maps.
  - Built-in About modal with support and privacy information.
- **Constraints**:
  - English-only UI for all application copy.
  - Strict permissions boundary (only coarse/fine location when in use; background location blocked).
  - Independent project, not affiliated with the café chains.

## Brand Commitments

- **Name**: Workable BCN.
- **Visual identity**: Warm editorial aesthetic defined in `DESIGN.md` (cream `#FFF9EB`, sand `#E5DFCC`, ivory `#FFFEF8`, ink `#17211B`, yellow `#F4C344`, terracotta accents).
- **Typography**: Local bundled Fraunces (SemiBold 600 / Bold 700) for headers and café names; Roboto for body text, addresses, and controls.
- **Logo**: Vector geometry in `assets/brand/user-logo-original.svg` and derived assets in app palette.

## Evidence on Hand

- Verified location databases and audit scripts in `docs/data/` (`original-places.json`, `official-catalogs.json`, `google-places-audit.json`).
- Brand assets in `assets/brand/`, `assets/fonts/`, and `store-assets/`.
- Privacy policy hosted at `https://iegorov553.github.io/workable-bcn-privacy/`.

## Product Principles

1. **Zero Friction**: Launch instantly to useful data. Never gate utility behind onboarding questionnaires, permissions nagging, or accounts.
2. **Offline Resilience**: Essential place data and favourites must work without active connectivity.
3. **Respect and Clarity**: Clear, concise English copy; honest about laptop policies and verification status without cluttering card UI.
4. **Native Feel across iOS and Android**: Maintain predictable gestures, system back behavior, safe area insets, and proper touch targets on both operating systems.

## Accessibility & Inclusion

- Minimum 48x48 dp touch targets on all interactive controls.
- WCAG AA compliant contrast pairings:
  - Primary text: `ink` (`#17211B`) on ivory (`#FFFEF8`) / cream (`#FFF9EB`) (>14:1).
  - Secondary text: calibrated `inkSoft` (`#4E5950`) on sand (`#E5DFCC`) (5.2:1) and ivory (`#FFFEF8`) (6.8:1).
  - Badge text on yellow: `inkOnHoney` (`#232C26`) on honey (`#F4C344`) (8.2:1).
  - Terracotta accents: calibrated `tomato` (`#C85233`) on cream/tint backgrounds (5.0:1).
- Screen reader accessibility labels for icon buttons (favorites toggle, navigation links, filters).
