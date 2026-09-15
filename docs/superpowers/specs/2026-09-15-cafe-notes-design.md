# Cafe Notes & Comments Design

## Summary

Provide users with the ability to create, view, edit, and delete personal notes and comments for individual cafés in Barcelona directly within the place card (`PlaceCard`). Notes are stored locally on the device via `AsyncStorage`, ensuring complete privacy, zero backend reliance, instant access, and offline capability.

Reference: [Issue #6](https://github.com/iegorov553/workable-bcn/issues/6)

---

## 1. Problem & User Objectives

1. **The Personal Context Need:** Remote workers frequently discover specific details about a café that generic directories do not capture—such as Wi-Fi passwords, quiet seating areas, outlet availability, laptop policies, or personal coffee favorites.
2. **Privacy & Offline First:** In alignment with Workable BCN's core principles, personal notes must remain 100% private on the user's device with no cloud sync, accounts, or analytics.
3. **Core Objectives:**
   - Add a personal notes section to the café card (`PlaceCard`).
   - Allow entering freeform multiline text for any café.
   - Support creating, editing, and deleting notes.
   - Display a preview of the note when opening the place card (both in the map view bottom sheet and in the list view).
   - Persist notes locally in `AsyncStorage` bound to the café's unique ID.
   - Safeguard data against corruption and race conditions across concurrent edits.

---

## 2. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Storage Layer
        AS["AsyncStorage ('workable-bcn:notes:v1')"]
        NotesUtil["Notes Parser & Sanitizer<br/>(src/utils/notes.ts)"]
        AS <-->|JSON Record<string, string>| NotesUtil
    end

    subgraph Application State
        App["AppContent (App.tsx)<br/>notes: Record<string, string><br/>saveNotesQueue: Promise<void>"]
        NotesUtil -->|parseNotes(raw, validIds)| App
        App -->|setItem(JSON)| AS
    end

    subgraph UI Components
        Card["PlaceCard (src/components/PlaceCard.tsx)<br/>note?: string<br/>onEditNote?: () => void"]
        Modal["NoteModal (src/components/NoteModal.tsx)<br/>visible, place, initialNote<br/>onSave, onDelete, onClose"]
        App -->|note & onEditNote| Card
        Card -->|trigger edit| Modal
        Modal -->|onSave / onDelete| App
    end
```

---

## 3. Storage Layer & Data Model

### 3.1 Data Format & Key
- **AsyncStorage Key:** `'workable-bcn:notes:v1'`
- **Data Type:**
  ```typescript
  export type PlaceNotes = Record<string, string>;
  ```
  Where key is the café's `place.id` and value is the non-empty, trimmed note string.

### 3.2 Utilities Module (`src/utils/notes.ts`)
- `parseNotes(raw: string | null, validIds: Set<string>): PlaceNotes`
  - Parses raw JSON from storage safely. Returns `{}` on null, empty string, or invalid JSON.
  - Verifies the parsed value is a non-null object (and not an array or primitive).
  - Validates that each key exists in `validIds` (dropping orphaned notes for deleted/renamed cafés).
  - Validates that values are strings, trims whitespace, and drops empty strings (`""`).
- `serializeNotes(notes: PlaceNotes): string`
  - Serializes notes map to JSON string for storage.
- `sanitizeNote(text: string, maxLength = 2000): string`
  - Trims leading and trailing whitespace.
  - Enforces a 2,000 character upper bound to prevent storage/UI bloat.

### 3.3 State Management & Concurrency in `AppContent`
- **Startup:** Loaded once during app mount in parallel with favorites:
  ```typescript
  AsyncStorage.getItem(NOTES_KEY)
    .then(value => { if (mounted.current) setNotes(parseNotes(value, validIds)); })
    .catch(() => { if (mounted.current) setNotice('Could not load saved notes on this device.'); });
  ```
- **Serialization of Writes:** Sequential promise queue (`saveNotesQueue`) avoids race conditions where an earlier slow disk write overwrites a subsequent edit:
  ```typescript
  const handleSaveNote = (placeId: string, text: string) => {
    const clean = sanitizeNote(text);
    const next = { ...notes };
    if (clean.length > 0) {
      next[placeId] = clean;
    } else {
      delete next[placeId];
    }
    setNotes(next);
    saveNotesQueue.current = saveNotesQueue.current
      .then(() => AsyncStorage.setItem(NOTES_KEY, serializeNotes(next)))
      .catch(() => { if (mounted.current) setNotice('Could not save your note on this device.'); });
  };
  ```

---

## 4. UI & Interaction Design

### 4.1 Place Card Presentation (`src/components/PlaceCard.tsx`)
- **New Props:**
  - `note?: string;`
  - `onEditNote?: () => void;`
- **Layout Placement:**
  - Placed directly between the café name/address and the bottom action row (`Directions`, `Share`).
- **States:**
  1. **Note exists:**
     - Container styled with `backgroundColor: colors.cream`, `borderRadius: 14`, `borderWidth: 1`, `borderColor: colors.border`, `padding: 10`.
     - Header row with icon (`Ionicons name="document-text-outline"` size 13) and label `"YOUR NOTE"` (`fontSize: 10`, `fontWeight: '700'`, `color: colors.inkSoft`).
     - Note text rendered with `numberOfLines={3}`, `fontSize: 13`, `lineHeight: 18`, `color: colors.ink`.
     - Tapping the container triggers `onEditNote()`.
  2. **No note exists:**
     - A clean, unobtrusive button with label `"+ Add note"` and icon (`document-text-outline` or `create-outline`), `accessibilityRole="button"`, calling `onEditNote()`.

### 4.2 Editing Modal (`src/components/NoteModal.tsx`)
- **Props:**
  ```typescript
  export type NoteModalProps = {
    visible: boolean;
    place: Place | null;
    initialNote?: string;
    onClose: () => void;
    onSave: (text: string) => void;
    onDelete?: () => void;
  };
  ```
- **Modal Content:**
  - Standard React Native `Modal` with `animationType="slide"` and `KeyboardAvoidingView`.
  - Header: café name in `FrauncesBold` font, address in secondary text, and close button (`Ionicons name="close"`).
  - Multiline `TextInput`:
    - `placeholder="Wi-Fi password, quiet spots, power outlets, coffee notes..."`
    - `autoFocus={true}`
    - `multiline={true}`
    - `maxLength={2000}`
    - Character count indicator displayed if length $> 1800$.
  - Action Footer:
    - Primary button: `"Save note"` (`backgroundColor: colors.honey`, `fontWeight: '700'`).
    - Secondary button: `"Cancel"`.
    - Delete button: `"Delete note"` (`color: colors.tomato`) shown only when `initialNote` is non-empty.

---

## 5. Testing & Verification

1. **Unit Tests (`tests/notes.test.ts`):**
   - Corrupt JSON, null, undefined, arrays, primitives return `{}`.
   - Obsolete café IDs removed via `validIds` filter.
   - Non-string values and empty/whitespace-only values discarded.
   - Proper trimming of whitespace.
   - `sanitizeNote` enforces character limits and trimming.
   - `serializeNotes` produces valid JSON matching `PlaceNotes`.
2. **Regression & Component Tests (`tests/regressions.test.ts`):**
   - Verify `PlaceCard` accepts and renders `note` and `onEditNote`.
   - Verify `NoteModal` exports and interface.
3. **Verification Commands:**
   - `npm run typecheck`
   - `npm test`
