import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const places=JSON.parse(await readFile('src/data/places.json','utf8'));
const originals=JSON.parse(await readFile('docs/data/original-places.json','utf8'));
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
for(const p of originals) assert.ok(ids.has(p.id),`Lost favorite ID: ${p.id}`);
const gignas=places.find(p=>p.id.startsWith('sandwichez-')&&p.address.includes('Gignàs'));
assert.equal(gignas?.chain,'Buenas Migas','Gignàs was incorrectly classified in the old map');
console.log(`${places.length} records valid; all ${originals.length} legacy IDs preserved.`);
