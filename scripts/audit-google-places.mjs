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

export function isBrandMatch(chain, candidateName) {
  if (!chain || !candidateName) return false;

  const normalize = (str) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normChain = normalize(chain);
  const normCand = normalize(candidateName);

  if (normChain.includes('365')) {
    return /\b365\b/.test(normCand);
  }
  if (normChain.includes('santagloria')) {
    return normCand.includes('santagloria') || normCand.includes('santa gloria');
  }
  if (normChain.includes('fornet')) {
    return normCand.includes('fornet');
  }
  if (normChain.includes('granier')) {
    return normCand.includes('granier');
  }
  if (normChain.includes('sandwichez')) {
    return normCand.includes('sandwichez');
  }
  if (normChain.includes('buenas migas')) {
    return normCand.includes('buenas migas');
  }
  if (normChain.includes('vivari')) {
    return normCand.includes('vivari');
  }

  return normCand.includes(normChain);
}

export function matchCandidate(placeLat, placeLon, candidates, maxDistance = 150, chain = '') {
  if (!candidates || candidates.length === 0) {
    return { status: 'NOT_FOUND', best: null };
  }

  let best = null;
  let minDistance = Infinity;

  let validCandidates = candidates;
  if (chain) {
    const brandMatches = candidates.filter((c) => {
      const name = c.displayName?.text || c.displayName || c.name || '';
      return isBrandMatch(chain, name);
    });
    if (brandMatches.length > 0) {
      validCandidates = brandMatches;
    }
  }

  for (const cand of validCandidates) {
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

  if (chain) {
    const name = best.displayName?.text || best.displayName || best.name || '';
    if (!isBrandMatch(chain, name)) {
      return { status: 'NAME_MISMATCH', best };
    }
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
    removeClosed: args.includes('--remove-closed'),
    updateCoordinates: args.includes('--update-coordinates') || args.includes('--apply'),
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

  if (!flags.apiKey && !existsSync(cachePath)) {
    console.log(`
[Google Places Audit]
Usage:
  GOOGLE_MAPS_API_KEY=your_key node scripts/audit-google-places.mjs [--apply] [--remove-closed] [--limit=10]

Options:
  --apply               Write googlePlaceId, googleMapsUrl and accurate coordinates to src/data/places.json
  --update-coordinates  Explicitly update latitude and longitude from verified Google Place location
  --remove-closed       Exclude permanently closed places from src/data/places.json when --apply is used
  --limit=N             Only process the first N places (useful for dry runs)
  --cache-file=PATH     Path to cache file (default: .cache/google-places-cache.json)
  --api-key=KEY         Google Maps API key (or set GOOGLE_MAPS_API_KEY)
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
  const ambCachePath = path.resolve('.cache/amb-discovery-cache.json');
  if (existsSync(ambCachePath)) {
    try {
      const ambData = JSON.parse(await readFile(ambCachePath, 'utf8'));
      for (const [k, v] of Object.entries(ambData)) {
        if (!cache[k] && v) {
          cache[k] = v;
        }
      }
    } catch {}
  }

  let prevReport = null;
  if (existsSync(reportPath)) {
    try {
      prevReport = JSON.parse(await readFile(reportPath, 'utf8'));
    } catch {}
  }

  const subset = flags.limit ? places.slice(0, flags.limit) : places;
  console.log(`Auditing ${subset.length} places with Google Places API (${flags.apiKey ? 'live' : 'cached'})...`);

  const report = {
    checkedAt: new Date().toISOString().split('T')[0],
    stats: {
      total: subset.length,
      operational: 0,
      closedPermanently: 0,
      closedTemporarily: 0,
      mismatch: 0,
      notFound: 0,
      errors: 0,
    },
    closedPermanently: [],
    closedTemporarily: [],
    mismatches: [],
    notFound: [],
    errors: [],
    matched: [],
  };

  let appliedCount = 0;

  for (let i = 0; i < subset.length; i++) {
    const place = subset[i];
    const query = buildSearchQuery(place.chain, place.name, place.address);
    const cacheKey = `${place.id}`;

    let data = cache[cacheKey];
    if (!data && place.googlePlaceId) {
      for (const entry of Object.values(cache)) {
        if (entry?.places?.some(p => p.id === place.googlePlaceId)) {
          data = { places: entry.places.filter(p => p.id === place.googlePlaceId) };
          break;
        }
      }
    }

    if (!data) {
      if (!flags.apiKey) {
        report.stats.notFound++;
        report.notFound.push({ id: place.id, name: place.name, query, reason: 'NOT_IN_OFFLINE_CACHE' });
        continue;
      }
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
          const errText = await res.text();
          console.error(`API error for ${place.id} (${res.status}): ${errText}`);
          report.stats.errors++;
          report.errors.push({ id: place.id, name: place.name, query, error: `HTTP ${res.status}: ${errText}` });
          continue;
        }

        data = await res.json();
        cache[cacheKey] = data;
        await writeFile(cachePath, JSON.stringify(cache, null, 2));
      } catch (err) {
        console.error(`Network error for ${place.id}:`, err);
        report.stats.errors++;
        report.errors.push({ id: place.id, name: place.name, query, error: err.message });
        continue;
      }
    }

    const candidates = data.places || [];
    const { status, best } = matchCandidate(place.latitude, place.longitude, candidates, 150, place.chain);

    if (status === 'NOT_FOUND') {
      report.stats.notFound++;
      report.notFound.push({ id: place.id, name: place.name, query });
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

    if (status === 'NAME_MISMATCH') {
      report.stats.mismatch++;
      report.mismatches.push({
        id: place.id,
        name: place.name,
        reason: 'BRAND_MISMATCH',
        googleName: best?.displayName?.text || best?.displayName || best?.name,
        bestDistance: best?.distanceMeters,
      });
      if (flags.apply && place.googlePlaceId) {
        delete place.googlePlaceId;
        delete place.googleMapsUrl;
        appliedCount++;
      }
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
      location: best.location,
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
        if (flags.updateCoordinates && best.location?.latitude && best.location?.longitude) {
          place.latitude = best.location.latitude;
          place.longitude = best.location.longitude;
        }
        appliedCount++;
      }
    }
  }

  if (prevReport?.closedPermanently) {
    const currentClosedIds = new Set(report.closedPermanently.map(p => p.id));
    for (const cp of prevReport.closedPermanently) {
      if (!currentClosedIds.has(cp.id)) {
        report.closedPermanently.push(cp);
      }
    }
    report.stats.closedPermanently = report.closedPermanently.length;
  }

  await writeFile(reportPath, JSON.stringify(report, null, 2));

  if (flags.apply) {
    let finalPlaces = places;
    if (flags.removeClosed && report.closedPermanently.length > 0) {
      const closedSet = new Set(report.closedPermanently.map(p => p.id));
      finalPlaces = places.filter(p => !closedSet.has(p.id));
      console.log(`\nRemoved ${report.closedPermanently.length} permanently closed places from catalog.`);
    }

    if (appliedCount > 0 || flags.removeClosed) {
      await writeFile(placesPath, JSON.stringify(finalPlaces, null, 2) + '\n');
      console.log(`Updated ${appliedCount} places in ${placesPath} (${finalPlaces.length} places remain)`);
    }

    if (!flags.removeClosed && (report.closedPermanently.length > 0 || report.closedTemporarily.length > 0)) {
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
Errors:             ${report.stats.errors}
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
