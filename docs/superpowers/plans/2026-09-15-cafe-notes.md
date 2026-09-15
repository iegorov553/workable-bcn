# Cafe Notes & Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-cost, offline-first personal notes and comments feature for cafés in Workable BCN, allowing users to save, view, edit, and delete private notes directly on place cards via a clean modal editor backed by `AsyncStorage`.

**Architecture:**
1. A dedicated pure utility module `src/utils/notes.ts` that safely parses, validates, sanitizes, and serializes notes maps (`Record<string, string>`) with resilient error handling against corrupt storage.
2. An isolated `NoteModal` component (`src/components/NoteModal.tsx`) providing a keyboard-friendly multiline editor with Save, Cancel, and Delete actions.
3. Enhanced `PlaceCard` (`src/components/PlaceCard.tsx`) displaying a styled note preview block when a note exists, or an unobtrusive "+ Add note" button when empty.
4. Centralized state management in `App.tsx` reading storage on launch and serializing disk writes via a promise queue to eliminate race conditions.

**Tech Stack:** React Native 0.86 / Expo 57, `@react-native-async-storage/async-storage` 2.2.0, TypeScript 6, Node.js 22 (`node:test`, `node:assert/strict`).

**Spec:** `docs/superpowers/specs/2026-09-15-cafe-notes-design.md`

## Global Constraints

- **100% Client-Side & Private**: All notes stored strictly on-device in `AsyncStorage`; no backend, no analytics, no external services.
- **Strict Visual & Design Consistency**: Follow established design tokens from `src/theme.ts` (`colors.cream`, `colors.honey`, `colors.paper`, `colors.ink`, `colors.tomato`, `colors.border`) and typography (`FrauncesBold`, `Roboto`).
- **Resilient & Crash-Proof Storage**: Storage errors, null values, or corrupt JSON must never crash the app; invalid/stale IDs must be automatically pruned.
- **Race Condition Prevention**: Disk writes must be sequentially chained through a promise queue (`saveNotesQueue`).
- **Expo SDK 57 & Node 22 Test Runner**: All tests executed via `node --experimental-transform-types --test tests/*.test.ts`.

---

### Task 1: Core Notes Utilities & Storage Helpers (TDD)

**Files:**
- Create: `src/utils/notes.ts`
- Test: `tests/notes.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type PlaceNotes = Record<string, string>;
  export function parseNotes(raw: string | null, validIds: Set<string>): PlaceNotes;
  export function serializeNotes(notes: PlaceNotes): string;
  export function sanitizeNote(text: string, maxLength?: number): string;
  ```

- [ ] **Step 1: Write failing unit tests in `tests/notes.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes, serializeNotes, sanitizeNote } from '../src/utils/notes.ts';

test('parseNotes returns empty object for null, undefined, or empty string', () => {
  const validIds = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseNotes(null, validIds), {});
  assert.deepEqual(parseNotes('', validIds), {});
  assert.deepEqual(parseNotes('   ', validIds), {});
});

test('parseNotes safely handles malformed JSON or non-object payloads', () => {
  const validIds = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseNotes('{broken json', validIds), {});
  assert.deepEqual(parseNotes('["not", "an", "object"]', validIds), {});
  assert.deepEqual(parseNotes('12345', validIds), {});
  assert.deepEqual(parseNotes('"just a string"', validIds), {});
});

test('parseNotes filters unknown IDs, trims text, and drops empty values', () => {
  const validIds = new Set(['place-1', 'place-2']);
  const raw = JSON.stringify({
    'place-1': '  Great Wi-Fi and power outlets  ',
    'place-2': '   ',
    'stale-place': 'Should be filtered out',
    'invalid-type': 1234,
  });

  const parsed = parseNotes(raw, validIds);
  assert.deepEqual(parsed, {
    'place-1': 'Great Wi-Fi and power outlets',
  });
});

test('sanitizeNote trims whitespace and truncates at maxLength', () => {
  assert.equal(sanitizeNote('  hello world \n '), 'hello world');
  const longText = 'a'.repeat(2500);
  const sanitized = sanitizeNote(longText, 2000);
  assert.equal(sanitized.length, 2000);
});

test('serializeNotes correctly converts notes object to JSON string', () => {
  const notes = { 'place-1': 'Quiet spot' };
  const json = serializeNotes(notes);
  assert.equal(json, JSON.stringify(notes));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/notes.test.ts`
Expected: FAIL (cannot find module `src/utils/notes.ts`).

- [ ] **Step 3: Implement `src/utils/notes.ts`**

```typescript
export type PlaceNotes = Record<string, string>;

export const DEFAULT_MAX_NOTE_LENGTH = 2000;

export function sanitizeNote(text: string, maxLength: number = DEFAULT_MAX_NOTE_LENGTH): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function parseNotes(raw: string | null, validIds: Set<string>): PlaceNotes {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: PlaceNotes = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (validIds.has(id) && typeof value === 'string') {
        const cleaned = value.trim();
        if (cleaned.length > 0) {
          result[id] = cleaned;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeNotes(notes: PlaceNotes): string {
  return JSON.stringify(notes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/utils/notes.ts tests/notes.test.ts
git commit -m "feat(notes): add pure notes storage parser, sanitizer, and unit tests"
```

---

### Task 2: NoteModal Component (`src/components/NoteModal.tsx`)

**Files:**
- Create: `src/components/NoteModal.tsx`
- Test: `tests/regressions.test.ts`

**Interfaces:**
- Consumes: `Place` from `src/types.ts`, `colors` from `src/theme.ts`, `sanitizeNote` from `src/utils/notes.ts`.
- Produces:
  ```typescript
  export type NoteModalProps = {
    visible: boolean;
    place: Place | null;
    initialNote?: string;
    onClose: () => void;
    onSave: (text: string) => void;
    onDelete?: () => void;
  };
  export function NoteModal(props: NoteModalProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Write test assertion in `tests/regressions.test.ts`**

Add test checking `NoteModal` export, component signature, and `PlaceCard` notes contract.

```typescript
test('NoteModal exports valid component and NoteModalProps interface', async () => {
  const noteModalModule = await import('../src/components/NoteModal.tsx');
  assert.equal(typeof noteModalModule.NoteModal, 'function');
});
```

- [ ] **Step 2: Run regression test to verify it fails**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`
Expected: FAIL (cannot find `src/components/NoteModal.tsx`).

- [ ] **Step 3: Implement `src/components/NoteModal.tsx`**

Create `src/components/NoteModal.tsx` with:
- Multiline `TextInput`, auto-focus, char count warning near 2000 chars.
- `Save note`, `Cancel`, and conditional `Delete note` buttons.
- Haptics feedback on actions.
- Styled according to the app palette (`colors.cream`, `colors.paper`, `colors.honey`, `colors.tomato`).

```typescript
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../theme';
import type { Place } from '../types';
import { applyTypography } from '../typography';
import { DEFAULT_MAX_NOTE_LENGTH, sanitizeNote } from '../utils/notes';

export type NoteModalProps = {
  visible: boolean;
  place: Place | null;
  initialNote?: string;
  onClose: () => void;
  onSave: (text: string) => void;
  onDelete?: () => void;
};

const haptic = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
};

export function NoteModal({
  visible,
  place,
  initialNote = '',
  onClose,
  onSave,
  onDelete,
}: NoteModalProps) {
  const [text, setText] = useState(initialNote);

  useEffect(() => {
    if (visible) {
      setText(initialNote);
    }
  }, [visible, initialNote]);

  if (!place) return null;

  const handleSave = () => {
    haptic();
    Keyboard.dismiss();
    onSave(text);
  };

  const handleDelete = () => {
    haptic();
    Keyboard.dismiss();
    onDelete?.();
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const charsLeft = DEFAULT_MAX_NOTE_LENGTH - text.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.container}
        >
          <View style={s.header}>
            <View style={s.headerTitleWrap}>
              <Text style={s.headerEyebrow}>PERSONAL NOTE</Text>
              <Text numberOfLines={1} style={s.headerTitle}>
                {place.name}
              </Text>
              <Text numberOfLines={1} style={s.headerSubtitle}>
                {place.address}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close note editor"
              onPress={handleClose}
              hitSlop={8}
              style={s.closeButton}
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}
          >
            <TextInput
              accessible
              accessibilityLabel="Note text"
              placeholder="Wi-Fi password, quiet tables, outlets, coffee notes..."
              placeholderTextColor={colors.inkSoft}
              multiline
              autoFocus
              maxLength={DEFAULT_MAX_NOTE_LENGTH}
              value={text}
              onChangeText={setText}
              style={s.input}
              textAlignVertical="top"
            />
            {charsLeft < 200 && (
              <Text style={s.charCount}>
                {charsLeft} characters remaining
              </Text>
            )}
          </ScrollView>

          <View style={s.footer}>
            {initialNote ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete this note"
                onPress={handleDelete}
                style={({ pressed }) => [s.deleteButton, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="trash-outline" size={17} color={colors.tomato} />
                <Text style={s.deleteButtonText}>Delete</Text>
              </Pressable>
            ) : <View style={{ flex: 1 }} />}

            <View style={s.actionButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                onPress={handleClose}
                style={({ pressed }) => [s.cancelButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save note"
                onPress={handleSave}
                style={({ pressed }) => [s.saveButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={s.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = applyTypography(
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.cream },
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitleWrap: { flex: 1, marginRight: 12 },
    headerEyebrow: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: colors.tomato,
      marginBottom: 3,
    },
    headerTitle: {
      fontFamily: 'FrauncesBold',
      fontSize: 22,
      color: colors.ink,
      lineHeight: 28,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    closeButton: {
      minWidth: 40,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.border,
    },
    body: { flexGrow: 1, padding: 20 },
    input: {
      flex: 1,
      minHeight: 180,
      backgroundColor: colors.paper,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      fontSize: 15,
      lineHeight: 22,
      color: colors.ink,
    },
    charCount: {
      fontSize: 11,
      color: colors.inkSoft,
      alignSelf: 'flex-end',
      marginTop: 8,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.paper,
      gap: 12,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    deleteButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.tomato,
    },
    actionButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cancelButton: {
      minHeight: 42,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.cream,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink,
    },
    saveButton: {
      minHeight: 42,
      paddingHorizontal: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.honey,
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.ink,
    },
  })
);
```

- [ ] **Step 4: Run regression tests to verify it passes**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/components/NoteModal.tsx tests/regressions.test.ts
git commit -m "feat(notes): implement NoteModal component for editing and deleting cafe notes"
```

---

### Task 3: PlaceCard Component Integration (`src/components/PlaceCard.tsx`)

**Files:**
- Modify: `src/components/PlaceCard.tsx`
- Test: `tests/regressions.test.ts`

**Interfaces:**
- Consumes: `note?: string`, `onEditNote?: () => void` in `PlaceCardProps`.
- Produces: Visual note preview block and/or "+ Add note" button in `PlaceCard`.

- [ ] **Step 1: Write test assertion in `tests/regressions.test.ts`**

Verify `PlaceCard` accepts `note` and `onEditNote` in props.

```typescript
test('PlaceCard source defines and supports note and onEditNote props', () => {
  const source = readFileSync(new URL('../src/components/PlaceCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /note\?: string;/);
  assert.match(source, /onEditNote\?: \(\) => void;/);
  assert.match(source, /onEditNote/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`
Expected: FAIL (`PlaceCard` does not yet define `note?: string`).

- [ ] **Step 3: Update `src/components/PlaceCard.tsx`**

Add `note?: string;` and `onEditNote?: () => void;` to `PlaceCardProps`.
Render note section between address and action row:
- If `note` is present:
  ```tsx
  {note ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit note: ${note}`}
      onPress={onEditNote}
      style={({ pressed }) => [s.noteBox, pressed && { opacity: 0.7 }]}
    >
      <View style={s.noteHeader}>
        <Ionicons name="document-text-outline" size={13} color={colors.inkSoft} />
        <Text style={s.noteLabel}>YOUR NOTE</Text>
      </View>
      <Text numberOfLines={3} style={s.noteText}>{note}</Text>
    </Pressable>
  ) : null}
  ```
- If `note` is not present and `onEditNote` is provided:
  Render a "+ Add note" button in the action row next to directions/share:
  ```tsx
  {onEditNote && !note ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add note for this cafe"
      onPress={onEditNote}
      hitSlop={4}
      style={({ pressed }) => [s.addNoteButton, pressed && { opacity: 0.65 }]}
    >
      <Ionicons name="create-outline" size={15} color={colors.ink} />
      <Text style={s.addNoteText}>Add note</Text>
    </Pressable>
  ) : null}
  ```
Add appropriate styles in `StyleSheet.create`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/components/PlaceCard.tsx tests/regressions.test.ts
git commit -m "feat(card): integrate note preview and add-note button into PlaceCard"
```

---

### Task 4: App State Integration & Storage Synchronization (`App.tsx`)

**Files:**
- Modify: `App.tsx`
- Test: `tests/regressions.test.ts`

**Interfaces:**
- Consumes: `parseNotes`, `serializeNotes`, `sanitizeNote` from `src/utils/notes.ts`, `NoteModal` from `src/components/NoteModal.tsx`.
- Produces: Integrated persistent notes state across Map, List, and Favourites views.

- [ ] **Step 1: Write integration assertions in `tests/regressions.test.ts`**

Add tests ensuring `App.tsx` contains `NOTES_KEY`, loads notes on mount, defines `NoteModal`, and passes note props to `PlaceCard`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-transform-types --test tests/regressions.test.ts`
Expected: FAIL (`App.tsx` does not yet contain `NOTES_KEY`).

- [ ] **Step 3: Update `App.tsx`**

1. Import `parseNotes`, `serializeNotes`, `sanitizeNote` from `./src/utils/notes` and `NoteModal` from `./src/components/NoteModal`.
2. Define `const NOTES_KEY = 'workable-bcn:notes:v1';`.
3. Add states in `AppContent`:
   ```typescript
   const [notes, setNotes] = useState<Record<string, string>>({});
   const [editingPlace, setEditingPlace] = useState<Place | null>(null);
   const saveNotesQueue = useRef(Promise.resolve());
   ```
4. Load notes in initial `useEffect`:
   ```typescript
   AsyncStorage.getItem(NOTES_KEY)
     .then(value => { if (mounted.current) setNotes(parseNotes(value, validIds)); })
     .catch(() => { if (mounted.current) setNotice('Could not load saved notes.'); });
   ```
5. Implement note actions:
   ```typescript
   const saveNote = (placeId: string, text: string) => {
     const cleaned = sanitizeNote(text);
     const next = { ...notes };
     if (cleaned.length > 0) {
       next[placeId] = cleaned;
     } else {
       delete next[placeId];
     }
     setNotes(next);
     saveNotesQueue.current = saveNotesQueue.current
       .then(() => AsyncStorage.setItem(NOTES_KEY, serializeNotes(next)))
       .catch(() => { if (mounted.current) setNotice('Could not save your note on this device.'); });
     setEditingPlace(null);
   };

   const deleteNote = (placeId: string) => {
     const next = { ...notes };
     delete next[placeId];
     setNotes(next);
     saveNotesQueue.current = saveNotesQueue.current
       .then(() => AsyncStorage.setItem(NOTES_KEY, serializeNotes(next)))
       .catch(() => { if (mounted.current) setNotice('Could not delete your note.'); });
     setEditingPlace(null);
   };
   ```
6. Pass `note={notes[selected.id]}` and `onEditNote={() => setEditingPlace(selected)}` to `PlaceCard` in `selected` sheet.
7. Pass `note={notes[item.id]}` and `onEditNote={() => setEditingPlace(item)}` to `PlaceCard` in `FlatList`.
8. Render `<NoteModal />` in `AppContent`:
   ```tsx
   <NoteModal
     visible={!!editingPlace}
     place={editingPlace}
     initialNote={editingPlace ? notes[editingPlace.id] : undefined}
     onClose={() => setEditingPlace(null)}
     onSave={(text) => editingPlace && saveNote(editingPlace.id, text)}
     onDelete={() => editingPlace && deleteNote(editingPlace.id)}
   />
   ```

- [ ] **Step 4: Run all tests and typecheck to verify everything passes**

Run:
```bash
npm run typecheck
npm test
```
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit changes**

```bash
git add App.tsx tests/regressions.test.ts
git commit -m "feat(app): connect notes persistence, state synchronization, and NoteModal in App"
```

---

### Task 5: Final End-to-End Verification & Documentation

**Files:**
- Test: all test suites (`npm test`)
- Verify: typecheck (`npm run typecheck`)

- [ ] **Step 1: Execute complete test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: Clean working tree.
