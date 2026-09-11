import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const places=JSON.parse(await readFile('src/data/places.json','utf8'));
const originals=JSON.parse(await readFile('docs/data/original-places.json','utf8'));
let closedIds = new Set();
if (existsSync('docs/data/google-places-audit.json')) {
  try {
    const audit = JSON.parse(await readFile('docs/data/google-places-audit.json', 'utf8'));
    closedIds = new Set((audit.closedPermanently || []).map(p => p.id));
  } catch {}
}

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
let retiredCount = 0;
for(const p of originals) {
  if (closedIds.has(p.id) && !ids.has(p.id)) {
    retiredCount++;
    continue;
  }
  assert.ok(ids.has(p.id),`Lost favorite ID: ${p.id}`);
}
const gignas=places.find(p=>p.id.startsWith('sandwichez-')&&p.address.includes('Gignàs'));
assert.equal(gignas?.chain,'Buenas Migas','Gignàs was incorrectly classified in the old map');
const legacySummary = retiredCount > 0
  ? `${originals.length - retiredCount}/${originals.length} active legacy IDs preserved (${retiredCount} confirmed closed)`
  : `all ${originals.length} legacy IDs preserved`;
console.log(`${places.length} records valid; ${legacySummary}.`);
