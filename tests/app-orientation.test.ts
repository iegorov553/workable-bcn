import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('App.tsx defines ORIENTATION_KEY and renders compass button in map controls', async () => {
  const appSrc = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.ok(appSrc.includes("ORIENTATION_KEY = 'workable-bcn:map-orientation:v1'"), 'should define storage key');
  assert.ok(appSrc.includes('compass-outline'), 'should render compass icon');
  assert.ok(appSrc.includes('toggleOrientation'), 'should define toggleOrientation');
  assert.ok(appSrc.includes('orientation={orientation}'), 'should pass orientation to MapCanvas');
});
