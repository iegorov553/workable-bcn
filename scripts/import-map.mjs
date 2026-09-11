import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const MAP_ID = '1ipWWBlvdEvt9sq0Oi24FSdpJgNTTCyY';
const SOURCE_URL = `https://www.google.com/maps/d/kml?mid=${MAP_ID}&forcekml=1`;
const here = dirname(fileURLToPath(import.meta.url));
// An upstream My Maps export is not verified business data. Import candidates
// separately so it cannot erase source checks or reintroduce corrected chains.
const outputPath = resolve(here, '../docs/data/import-candidates.json');

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const cleanText = (value = '') =>
  String(value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30000) });
if (!response.ok) {
  throw new Error(`Google My Maps returned ${response.status}`);
}

const xml = await response.text();
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const parsed = parser.parse(xml);
const folders = asArray(parsed?.kml?.Document?.Folder);

const places = folders.flatMap((folder) => {
  const fallbackChain = cleanText(folder.name);
  return asArray(folder.Placemark).flatMap((placemark, index) => {
    const coordinates = cleanText(placemark?.Point?.coordinates)
      .split(',')
      .map(Number);
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];

    const description = cleanText(placemark.description);
    const chain =
      description.match(/Chain:\s*(.*?)(?=\s+Latitude:|\s+Longitude:|$)/i)?.[1]?.trim() ||
      fallbackChain;
    const address =
      description.match(/Address:\s*(.*?)(?=\s+Chain:|\s+Latitude:|$)/i)?.[1]?.trim() ||
      'Barcelona';
    const name = cleanText(placemark.name) || `${chain} ${index + 1}`;
    const stableCoordinate = `${latitude.toFixed(6)}-${longitude.toFixed(6)}`;

    return [{
      id: `${chain.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stableCoordinate}`,
      name,
      chain,
      address,
      latitude,
      longitude,
    }];
  });
});

places.sort((a, b) => a.chain.localeCompare(b.chain) || a.name.localeCompare(b.name));
if (!places.length) throw new Error('No valid places in upstream export; existing files were not changed.');
if (new Set(places.map(p => p.id)).size !== places.length) throw new Error('Duplicate IDs in upstream export; review before importing.');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(places, null, 2)}\n`, 'utf8');
console.log(`Imported ${places.length} places from Google My Maps to ${outputPath}`);
