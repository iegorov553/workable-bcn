import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHiddenPlaces, serializeHiddenPlaces } from '../src/utils/hidden-places.ts';

test('parseHiddenPlaces returns empty Set for null, undefined, or empty/whitespace string', () => {
  const validIds = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseHiddenPlaces(null, validIds), new Set());
  assert.deepEqual(parseHiddenPlaces(undefined as any, validIds), new Set());
  assert.deepEqual(parseHiddenPlaces('', validIds), new Set());
  assert.deepEqual(parseHiddenPlaces('   ', validIds), new Set());
});

test('parseHiddenPlaces returns empty Set for malformed JSON or non-array payloads', () => {
  const validIds = new Set(['place-1', 'place-2']);
  assert.deepEqual(parseHiddenPlaces('{broken json', validIds), new Set());
  assert.deepEqual(parseHiddenPlaces('{"place-1": true}', validIds), new Set());
  assert.deepEqual(parseHiddenPlaces('12345', validIds), new Set());
  assert.deepEqual(parseHiddenPlaces('"just a string"', validIds), new Set());
  assert.deepEqual(parseHiddenPlaces('true', validIds), new Set());
});

test('parseHiddenPlaces prunes invalid/stale IDs and non-string elements, and deduplicates valid IDs', () => {
  const validIds = new Set(['place-1', 'place-2', 'place-3']);
  const raw = JSON.stringify([
    'place-1',
    'stale-place',
    'place-2',
    'place-1',
    123,
    null,
    '',
    'unknown-place',
  ]);

  const result = parseHiddenPlaces(raw, validIds);
  assert.equal(result instanceof Set, true);
  assert.deepEqual(result, new Set(['place-1', 'place-2']));
});

test('serializeHiddenPlaces converts Set of strings to JSON array string', () => {
  assert.equal(serializeHiddenPlaces(new Set()), '[]');

  const set = new Set(['place-1', 'place-2']);
  const json = serializeHiddenPlaces(set);
  assert.equal(json, JSON.stringify(['place-1', 'place-2']));
  assert.deepEqual(JSON.parse(json), ['place-1', 'place-2']);
});
