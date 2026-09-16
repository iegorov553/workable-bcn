# Design Document: Navigation Decoupling & Unified Filtering

**Date:** 2026-09-16  
**Status:** Approved  
**Related Issues:** [#1 (Dislike / Hide café)](https://github.com/iegorov553/workable-bcn/issues/1), [#7 (Display favorites on map)](https://github.com/iegorov553/workable-bcn/issues/7)

---

## 1. Context & Problem Statement

In the previous design, the bottom navigation bar displayed three tabs: **Map**, **List**, and **Favourites**. This conflated two distinct concepts:
- **Presentation mode:** Map vs. List (how data is visualized).
- **Data filter:** Favourites (a subset of places matching a user condition).

### Key Limitations
1. **No Favorites on Map (Issue #7):** Users could not view saved cafés on the map or see which map pins were already saved.
2. **Rigid Filtering:** Users could not combine favorites with search or chain filters (e.g., "show only my saved Buenas Migas").
3. **Screen Clutter:** A permanent bottom tab bar consumed 60–70 dp of vertical real estate across all screens just to switch between 2 modes and 1 filter.
4. **No Place Hiding (Issue #1):** Users had no mechanism to hide irrelevant or disliked cafés from map and list views.

---

## 2. Architecture & Design

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Brand, [Meet], [Places count badge], Search bar     │
│ Filters: [ ❤️ ] [ All ] [ 365 Café ] [ Buenas Migas ] ...   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                Content View (Map OR List)                   │
│                                                             │
│  MapCanvas:                                                 │
│    - Leaflet WebView                                        │
│    - Standard markers: Colored dot with white border        │
│    - Favorite markers: Colored dot with white heart inside  │
│    - Controls: Compass, Metro, Locate                       │
│    - Selected PlaceCard sheet (bottom)                      │
│                                                             │
│  OR FlatList:                                               │
│    - Header: Count + nearest first / travel time + Locate   │
│    - PlaceCard items with [Hide (eye-off)] & [Heart]        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Floating View Switcher: [ 📋 List ] (on Map) / [ 🗺️ Map ]   │
│ (Automatically hides when a place card is open on the map)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Specifications

### 3.1. Navigation & View Modes
1. **Simplified `ViewMode`:**
   ```typescript
   export type ViewMode = 'map' | 'list';
   ```
   `'saved'` is removed from `ViewMode`.
2. **Removal of Static Bottom Bar:**
   - Remove `<SafeAreaView style={s.navSafe}>` and `<View style={s.nav}>`.
   - Content area (`s.content`) expands to utilize the bottom space naturally in edge-to-edge mode.
   - To prevent overlapping Android system navigation buttons (3-button or gesture bar):
     - `FlatList` applies dynamic scroll inset `paddingBottom: Math.max(insets.bottom, 16) + 84`.
     - Map selected card (`s.selected`) floats above system navigation via `bottom: Math.max(insets.bottom, 16) + 16`.
     - `About` modal content scroll view uses `paddingBottom: Math.max(insets.bottom, 24) + 24`.
     - `SafeAreaProvider` at app root receives `initialMetrics={initialWindowMetrics}` to avoid transient 0 insets on cold start.
3. **Floating Mode Switcher (`FloatingModeButton`):**
   - Centered horizontally at the bottom (`position: 'absolute', bottom: Math.max(insets.bottom, 16) + 16, alignSelf: 'center'`).
   - Dynamic label and icon:
     - When `mode === 'map'`: displays `list` icon + text **"List"**.
     - When `mode === 'list'`: displays `map` icon + text **"Map"**.
   - Appearance: Pill shape (height 46, borderRadius 23), paddingHorizontal 22, background `colors.ink`, text/icon `colors.paper`, elevation/shadow for contrast against map and cards.
   - Visibility rule: In `map` mode, when `selectedId !== null`, the floating button hides smoothly so it never overlaps the selected place bottom sheet.
   - Android back button: Pressing back in `list` mode transitions back to `map` mode.

### 3.2. Unified Filter Pipeline & Header Chips
1. **Filtering State:**
   - `onlyFavorites: boolean` (default `false`).
   - `hiddenPlaces: Set<string>` (loaded from AsyncStorage).
   - `chain: string` (default `'All'`).
   - `query: string` (search term).
2. **Pipeline Order:**
   ```typescript
   const visiblePlaces = places.filter(place => {
     if (hiddenPlaces.has(place.id)) return false;
     if (onlyFavorites && !favorites.has(place.id)) return false;
     if (chain !== 'All' && place.chain !== chain) return false;
     return matchesSearch(place, query);
   });
   ```
3. **Filter Bar Chips UI:**
   - Prepend `[ ❤️ ]` chip before `[ All ]` in the horizontal scroll list:
     - Inactive: `colors.paper` background, `colors.border` outline, `heart-outline` icon with `colors.inkSoft`.
     - Active: `colors.tomato` icon `heart`, subtle background highlight (`colors.honeyLight` or tinted border), accessibilityState `{ selected: true }`.
     - Accessible touch target: minimum 44x44 dp with hitSlop.
   - Reset action: `resetFilters` clears `query`, resets `chain = 'All'`, and sets `onlyFavorites = false`.
4. **Empty States:**
   - List View:
     - If `onlyFavorites && favorites.size === 0`: *"Nothing saved yet. Tap the heart on a café to keep it here."*
     - If query or chain filters result in 0 matches: *"No matching places. Try another search or reset the filters."* + `Reset filters` button.
   - Map View:
     - If `visiblePlaces.length === 0`: A gentle top banner below filters indicating no matching places with a one-tap reset.

### 3.3. Favorite Markers on Map (Issue #7)
1. **Map Bridge Payload:**
   - Pass `favoriteIds: string[]` in `MapPayload`:
     ```typescript
     export type MapPayload = {
       places: Place[];
       selectedId: string | null;
       favoriteIds: string[];
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
2. **Marker Rendering in `map-runtime.js`:**
   - Standard marker: `L.circleMarker` radius 6 (selected: 10).
   - Favorite marker:
     - Rendered via `L.divIcon` with a centered SVG heart on a circular background colored with `chainColors[place.chain]`.
     - Size: 18x18 px, anchor `[9, 9]`.
     - Always elevated: `marker.setZIndexOffset(100)` and `bringToFront()`.
     - Clicking favorite marker triggers standard place selection.
   - Selected state: An active dark outer ring (`colors.ink`) wraps the favorite marker when `selectedId === place.id`.
3. **Filter Reactivity:**
   - When `onlyFavorites` is active, non-favorite markers are removed from the map canvas; only favorites remain.

### 3.4. Dislike / Hide Café (Issue #1)
1. **Storage:**
   - AsyncStorage key: `workable-bcn:hidden:v1`.
   - Loaded and validated on app startup against `validIds`.
2. **PlaceCard Interaction:**
   - In `PlaceCard.tsx`, add an icon button to the top row (next to favorite heart):
     - Icon: `Ionicons name="eye-off-outline"` (20px, `colors.inkSoft`).
     - Accessibility label: `"Hide place"`.
   - On tap:
     - Adds `place.id` to `hiddenPlaces`.
     - Writes to AsyncStorage.
     - Closes selected sheet if `selectedId === place.id`.
     - Haptic feedback.
     - Displays notice banner with an **Undo** button: `"Café hidden"` + `Undo`.
3. **Restoring Hidden Cafés in About Modal:**
   - In the About modal (`<Modal visible={about}>`), add a **"Hidden Places"** section:
     - If `hiddenPlaces.size === 0`: *"No hidden places."*
     - If `hiddenPlaces.size > 0`:
       - Header with count: *"Hidden places (N)"*.
       - List of hidden items showing chain, branch name, and an **"Unhide"** button.
       - Global **"Unhide all"** button at the top of the section.
   - Restoring a place returns it to its normal visibility without altering its notes or favorite status.

---

## 4. Error Handling & Edge Cases

1. **Stale Storage Keys:** If a place is removed from `places.json` in a future release, orphaned IDs in `workable-bcn:hidden:v1` and `workable-bcn:favorites:v1` are pruned automatically during parse validation.
2. **Simultaneous Hide & Favorite:** Hiding a place removes it from visibility. If unhidden later, its favorite status is retained.
3. **Web / Android Back Button Consistency:**
   - If selected place open: Back closes card.
   - If in Meet mode: Back exits Meet mode.
   - If in `list` mode: Back transitions to `map` mode.
   - If on `map` mode with no selection: Standard system behavior.

---

## 5. Verification & Testing Plan

1. **Automated Unit & Utility Tests:**
   - Parse & serialize tests for hidden places (similar to `parseFavorites`).
   - Filter pipeline tests: verifying combinations of `onlyFavorites`, `chain`, `query`, and `hiddenPlaces`.
   - Map payload bridge encoding & decoding verification.
2. **Interactive & Manual Verification:**
   - **Floating Switcher:** Toggle between Map and List; verify smooth transitions and safe area padding.
   - **Heart Filter:** Toggle heart chip on map and list; verify place counts and marker updates.
   - **Favorite Markers:** Save/unsave a café; confirm heart icon appears/disappears on the map pin immediately.
   - **Hide / Dislike:** Tap hide in card; confirm place disappears; tap Undo in toast; confirm it reappears.
   - **About Modal Restoration:** Hide 2 cafés; open About modal; verify "Hidden places (2)"; unhide one; unhide all.
