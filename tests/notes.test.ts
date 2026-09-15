import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes, serializeNotes, sanitizeNote, DEFAULT_MAX_NOTE_LENGTH } from '../src/utils/notes.ts';

test('parseNotes returns empty object for null, undefined, or empty string', () => {
  const validIds = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseNotes(null, validIds), {});
  assert.deepEqual(parseNotes(undefined as any, validIds), {});
  assert.deepEqual(parseNotes('', validIds), {});
  assert.deepEqual(parseNotes('   ', validIds), {});
});

test('parseNotes safely handles malformed JSON or non-object payloads', () => {
  const validIds = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseNotes('{broken json', validIds), {});
  assert.deepEqual(parseNotes('["not", "an", "object"]', validIds), {});
  assert.deepEqual(parseNotes('12345', validIds), {});
  assert.deepEqual(parseNotes('"just a string"', validIds), {});
  assert.deepEqual(parseNotes('true', validIds), {});
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

test('parseNotes clamps strings exceeding DEFAULT_MAX_NOTE_LENGTH', () => {
  const validIds = new Set(['place-1']);
  const longText = 'a'.repeat(DEFAULT_MAX_NOTE_LENGTH + 500);
  const raw = JSON.stringify({
    'place-1': longText,
  });

  const parsed = parseNotes(raw, validIds);
  assert.equal(parsed['place-1'].length, DEFAULT_MAX_NOTE_LENGTH);
  assert.equal(parsed['place-1'], 'a'.repeat(DEFAULT_MAX_NOTE_LENGTH));
});

test('sanitizeNote trims whitespace and truncates at maxLength', () => {
  assert.equal(sanitizeNote('  hello world \n '), 'hello world');
  const longText = 'a'.repeat(2500);
  const sanitized = sanitizeNote(longText, 2000);
  assert.equal(sanitized.length, 2000);
  assert.equal(sanitizeNote(longText).length, DEFAULT_MAX_NOTE_LENGTH);
});

test('serializeNotes correctly converts notes object to JSON string', () => {
  const notes = { 'place-1': 'Quiet spot' };
  const json = serializeNotes(notes);
  assert.equal(json, JSON.stringify(notes));
});
