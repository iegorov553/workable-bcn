import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function buildSearchQuery(chain, name, address) {
  const cleanAddress = address.split('·')[0].trim();
  const prefix = chain || name;
  return `${prefix} ${cleanAddress} Barcelona`;
}

export function matchCandidate(placeLat, placeLon, candidates, maxDistance = 150) {
  if (!candidates || candidates.length === 0) {
    return { status: 'NOT_FOUND', best: null };
  }

  let best = null;
  let minDistance = Infinity;

  for (const cand of candidates) {
    if (!cand.location || typeof cand.location.latitude !== 'number' || typeof cand.location.longitude !== 'number') {
      continue;
    }
    const d = haversineDistanceMeters(placeLat, placeLon, cand.location.latitude, cand.location.longitude);
    if (d < minDistance) {
      minDistance = d;
      best = { ...cand, distanceMeters: Math.round(d) };
    }
  }

  if (!best) {
    return { status: 'NOT_FOUND', best: null };
  }

  if (best.distanceMeters > maxDistance) {
    return { status: 'DISTANCE_MISMATCH', best };
  }

  const status = best.businessStatus || 'OPERATIONAL';
  return { status, best };
}

function loadEnv() {
  if (existsSync('.env')) {
    try {
      const content = readFileSync('.env', 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && v.length > 0 && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch {}
  }
}

export function parseArgs(args = process.argv.slice(2)) {
  loadEnv();
  const flags = {
    apply: args.includes('--apply'),
    apiKey: process.env.GOOGLE_MAPS_API_KEY || null,
    cacheFile: path.resolve('.cache/google-places-cache.json'),
    limit: null,
  };
  for (const arg of args) {
    if (arg.startsWith('--api-key=')) flags.apiKey = arg.slice('--api-key='.length);
    if (arg.startsWith('--cache-file=')) flags.cacheFile = path.resolve(arg.slice('--cache-file='.length));
    if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.slice('--limit='.length), 10);
  }
  return flags;
}

export async function main() {
  const flags = parseArgs();
  const placesPath = path.resolve('src/data/places.json');
  const cachePath = flags.cacheFile;
  const cacheDir = path.dirname(cachePath);
  const reportPath = path.resolve('docs/data/google-places-audit.json');

  if (!flags.apiKey) {
    console.log(`
[Google Places Audit]
Usage:
  GOOGLE_MAPS_API_KEY=your_key node scripts/audit-google-places.mjs [--apply] [--limit=10]

Options:
  --apply          Write googlePlaceId and googleMapsUrl to src/data/places.json for operational matches
  --limit=N        Only process the first N places (useful for dry runs)
  --cache-file=PATH Path to cache file (default: .cache/google-places-cache.json)
  --api-key=KEY    Google Maps API key (or set GOOGLE_MAPS_API_KEY)
`);
    process.exit(0);
  }

  await mkdir(cacheDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const places = JSON.parse(await readFile(placesPath, 'utf8'));
  let cache = {};
  if (existsSync(cachePath)) {
    try {
      cache = JSON.parse(await readFile(cachePath, 'utf8'));
    } catch {}
  }

  const subset = flags.limit ? places.slice(0, flags.limit) : places;
  console.log(`Auditing ${subset.length} places with Google Places API (New)...`);

  const report = {
    checkedAt: new Date().toISOString().split('T')[0],
    stats: {
      total: subset.length,
      operational: 0,
      closedPermanently: 0,
      closedTemporarily: 0,
      mismatch: 0,
      notFound: 0,
    },
    closedPermanently: [],
    closedTemporarily: [],
    mismatches: [],
    matched: [],
  };

  let appliedCount = 0;

  for (let i = 0; i < subset.length; i++) {
    const place = subset[i];
    const query = buildSearchQuery(place.chain, place.name, place.address);
    const cacheKey = `${place.id}`;

    let data = cache[cacheKey];
    if (!data) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': flags.apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.rating,places.userRatingCount',
          },
          body: JSON.stringify({
            textQuery: query,
            locationBias: {
              circle: {
                center: { latitude: place.latitude, longitude: place.longitude },
                radius: 150.0,
              },
            },
          }),
        });

        if (!res.ok) {
          console.error(`API error for ${place.id} (${res.status}): ${await res.text()}`);
          continue;
        }

        data = await res.json();
        cache[cacheKey] = data;
        await writeFile(cachePath, JSON.stringify(cache, null, 2));
      } catch (err) {
        console.error(`Network error for ${place.id}:`, err);
        continue;
      }
    }

    const candidates = data.places || [];
    const { status, best } = matchCandidate(place.latitude, place.longitude, candidates, 150);

    if (status === 'NOT_FOUND') {
      report.stats.notFound++;
      continue;
    }

    if (status === 'DISTANCE_MISMATCH') {
      report.stats.mismatch++;
      report.mismatches.push({
        id: place.id,
        name: place.name,
        bestDistance: best?.distanceMeters,
      });
      continue;
    }

    const record = {
      id: place.id,
      name: place.name,
      googlePlaceId: best.id,
      googleName: best.displayName?.text,
      googleMapsUri: best.googleMapsUri,
      distanceMeters: best.distanceMeters,
      businessStatus: status,
      rating: best.rating,
    };

    if (status === 'CLOSED_PERMANENTLY') {
      report.stats.closedPermanently++;
      report.closedPermanently.push(record);
    } else if (status === 'CLOSED_TEMPORARILY') {
      report.stats.closedTemporarily++;
      report.closedTemporarily.push(record);
    } else {
      report.stats.operational++;
      report.matched.push(record);

      if (flags.apply) {
        place.googlePlaceId = best.id;
        if (best.googleMapsUri) place.googleMapsUrl = best.googleMapsUri;
        appliedCount++;
      }
    }
  }

  await writeFile(reportPath, JSON.stringify(report, null, 2));

  if (flags.apply) {
    if (appliedCount > 0) {
      await writeFile(placesPath, JSON.stringify(places, null, 2) + '\n');
      console.log(`\nUpdated ${appliedCount} places in ${placesPath}`);
    }
    if (report.closedPermanently.length > 0 || report.closedTemporarily.length > 0) {
      console.warn(
        `\n[WARNING] Found ${report.closedPermanently.length} permanently closed and ${report.closedTemporarily.length} temporarily closed places.` +
        `\nPlease verify each before manually removing from ${placesPath}.`
      );
    }
  }

  console.log(`
=== Google Places Audit Summary ===
Total Scanned:      ${report.stats.total}
Operational:        ${report.stats.operational}
Closed Permanently: ${report.stats.closedPermanently}
Closed Temporarily: ${report.stats.closedTemporarily}
Mismatched (>150m): ${report.stats.mismatch}
Not Found:          ${report.stats.notFound}
Report written to:  ${reportPath}
`);
}

const isMain = process.argv[1] && (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) || path.resolve(process.argv[1]) === path.resolve('scripts/audit-google-places.mjs'));
if (isMain) {
  main().catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
  });
}
