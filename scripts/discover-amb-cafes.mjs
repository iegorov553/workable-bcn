/**
 * AMB Cafe Discovery & Deduplication Engine
 * Discovers and reconciles cafes across the 36 AMB municipalities.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const AMB_BOUNDING_BOX = {
  minLat: 41.20,
  maxLat: 41.55,
  minLng: 1.90,
  maxLng: 2.35,
};

export const BRAND_PATTERNS = {
  '365 Café': /\b365\b/i,
  'Granier': /\bgranier\b/i,
  'Vivari': /\bvivari\b/i,
  'Santagloria': /\bsantagloria\b/i,
  'El Fornet': /\bel\s*fornet\b/i,
  'SandwiChez': /\bsandwichez\b/i,
  'Buenas Migas': /\bbuenas\s*migas\b/i,
};

export const BARCELONA_DISTRICTS = [
  'Ciutat Vella',
  'Eixample',
  'Sants-Montjuïc',
  'Les Corts',
  'Sarrià-Sant Gervasi',
  'Gràcia',
  'Horta-Guinardó',
  'Nou Barris',
  'Sant Andreu',
  'Sant Martí',
];

export const OFFICIAL_AMB_MUNICIPALITIES = [
  "L'Hospitalet de Llobregat",
  'Badalona',
  'Santa Coloma de Gramenet',
  'Cornellà de Llobregat',
  'Sant Boi de Llobregat',
  'Sant Cugat del Vallès',
  'El Prat de Llobregat',
  'Viladecans',
  'Castelldefels',
  'Cerdanyola del Vallès',
  'Esplugues de Llobregat',
  'Gavà',
  'Sant Feliu de Llobregat',
  'Ripollet',
  'Sant Adrià de Besòs',
  'Montcada i Reixac',
  'Sant Joan Despí',
  'Barberà del Vallès',
  'Sant Vicenç dels Horts',
  'Sant Andreu de la Barca',
  'Molins de Rei',
  'Santa Coloma de Cervelló',
  'Begues',
  'Castellbisbal',
  'Corbera de Llobregat',
  'El Papiol',
  'La Palma de Cervelló',
  'Pallejà',
  'Sant Climent de Llobregat',
  'Sant Just Desvern',
  'Torrelles de Llobregat',
  'Tiana',
  'Montgat',
  'Badia del Vallès',
  'Cervelló',
];

export const BCN_POSTAL_DISTRICTS = {
  '08001': 'Ciutat Vella', '08002': 'Ciutat Vella', '08003': 'Ciutat Vella',
  '08004': 'Sants-Montjuïc', '08014': 'Sants-Montjuïc', '08038': 'Sants-Montjuïc',
  '08005': 'Sant Martí', '08018': 'Sant Martí', '08019': 'Sant Martí', '08020': 'Sant Martí', '08026': 'Sant Martí',
  '08006': 'Sarrià-Sant Gervasi', '08017': 'Sarrià-Sant Gervasi', '08021': 'Sarrià-Sant Gervasi', '08022': 'Sarrià-Sant Gervasi',
  '08007': 'Eixample', '08008': 'Eixample', '08009': 'Eixample', '08010': 'Eixample', '08011': 'Eixample', '08013': 'Eixample', '08015': 'Eixample', '08029': 'Eixample', '08036': 'Eixample', '08037': 'Eixample',
  '08012': 'Gràcia', '08023': 'Gràcia', '08024': 'Gràcia',
  '08016': 'Nou Barris', '08033': 'Nou Barris', '08042': 'Nou Barris',
  '08025': 'Horta-Guinardó', '08031': 'Horta-Guinardó', '08032': 'Horta-Guinardó', '08035': 'Horta-Guinardó', '08041': 'Horta-Guinardó',
  '08027': 'Sant Andreu', '08030': 'Sant Andreu',
  '08028': 'Les Corts', '08034': 'Les Corts',
};

/**
 * Accurately extracts the municipality or Barcelona district from Google formattedAddress.
 */
export function extractMunicipality(formattedAddress, fallback = 'Barcelona') {
  if (!formattedAddress) return fallback;

  // 1. Check official AMB municipalities (sorted longest first)
  const sortedAmb = [...OFFICIAL_AMB_MUNICIPALITIES].sort((a, b) => b.length - a.length);
  for (const mun of sortedAmb) {
    const escaped = mun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(formattedAddress)) {
      return mun;
    }
  }

  // 2. Check explicit Barcelona districts
  const sortedDistricts = [...BARCELONA_DISTRICTS].sort((a, b) => b.length - a.length);
  for (const dist of sortedDistricts) {
    const escaped = dist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(formattedAddress)) {
      return dist;
    }
  }

  // 3. Check postal code mapping for Barcelona districts (080xx)
  const pcMatch = formattedAddress.match(/\b(080\d{2})\b/);
  if (pcMatch && BCN_POSTAL_DISTRICTS[pcMatch[1]]) {
    return BCN_POSTAL_DISTRICTS[pcMatch[1]];
  }

  return fallback;
}

export const AMB_MUNICIPALITIES = [
  ...BARCELONA_DISTRICTS,
  'Barcelona',
  "L'Hospitalet de Llobregat",
  'Badalona',
  'Santa Coloma de Gramenet',
  'Cornellà de Llobregat',
  'Sant Boi de Llobregat',
  'Sant Cugat del Vallès',
  'El Prat de Llobregat',
  'Viladecans',
  'Castelldefels',
  'Cerdanyola del Vallès',
  'Esplugues de Llobregat',
  'Gavà',
  'Sant Feliu de Llobregat',
  'Ripollet',
  'Sant Adrià de Besòs',
  'Montcada i Reixac',
  'Sant Joan Despí',
  'Barberà del Vallès',
  'Sant Vicenç dels Horts',
  'Sant Andreu de la Barca',
  'Molins de Rei',
  'Santa Coloma de Cervelló',
  'Begues',
  'Castellbisbal',
  'Corbera de Llobregat',
  'El Papiol',
  'La Palma de Cervelló',
  'Pallejà',
  'Sant Climent de Llobregat',
  'Sant Just Desvern',
  'Torrelles de Llobregat',
  'Tiana',
  'Montgat',
  'Badia del Vallès',
  'Cervelló',
];

export const TARGET_CHAINS = [
  '365 Café',
  'Granier',
  'Vivari',
  'Santagloria',
  'El Fornet',
  'SandwiChez',
  'Buenas Migas',
];

export const CHAIN_SEARCH_TERMS = {
  '365 Café': ['365 Obrador', '365 Cafe'],
  'Granier': ['Granier'],
  'Vivari': ['Vivari'],
  'Santagloria': ['Santagloria'],
  'El Fornet': ['El Fornet'],
  'SandwiChez': ['Sandwichez'],
  'Buenas Migas': ['Buenas Migas'],
};

/**
 * Checks whether coordinates fall within the AMB geographic bounding box.
 * 41.20 <= lat <= 41.55, 1.90 <= lon <= 2.35
 */
export function isWithinAmbBoundingBox(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= AMB_BOUNDING_BOX.minLat &&
    lat <= AMB_BOUNDING_BOX.maxLat &&
    lng >= AMB_BOUNDING_BOX.minLng &&
    lng <= AMB_BOUNDING_BOX.maxLng
  );
}

/**
 * Verifies if the Google Places display name matches the chain brand.
 */
export function matchesBrand(name, chain) {
  if (!name || !chain) return false;
  const trimmed = name.trim();

  switch (chain) {
    case 'SandwiChez':
    case 'Sandwichez':
      // Reject generic sandwich shops, construction panels, and kebabs
      return /\bsandwichez\b/i.test(trimmed);

    case 'El Fornet':
      // Must contain 'el fornet' or 'elfornet'
      if (!/\bel\s*fornet\b/i.test(trimmed)) return false;
      // Exclude generic small bakeries like 'El Fornet de la Lluïsa', 'El Fornet de Natalia', etc.
      // Allow 'El Fornet d'en Rossend'
      if (/\bel\s*fornet\s+(?:de\b|del\b|d['’]l\b|d['’]en\s+(?!rossend\b))/i.test(trimmed)) {
        return false;
      }
      return true;

    default: {
      const pattern = BRAND_PATTERNS[chain];
      if (pattern) {
        return pattern.test(trimmed);
      }
      return trimmed.toLowerCase().includes(chain.toLowerCase());
    }
  }
}

/**
 * Normalizes and formats address with municipality suffix (e.g. "Street, 10 · Badalona").
 */
export function formatAmbAddress(formattedAddress, municipality) {
  if (!formattedAddress) return municipality ? `· ${municipality}` : '';

  let street = formattedAddress.split(' · ')[0].trim();

  // Remove country suffix
  street = street.replace(/,?\s*(?:Spain|España)\s*$/i, '');

  // Remove postal codes and trailing location chunks (e.g. ", 08902 L'Hospitalet de Llobregat, Barcelona")
  street = street.replace(/,?\s*\b\d{5}\b.*$/i, '');

  // Remove trailing ", Barcelona" if municipality is not Barcelona
  if (municipality && municipality.toLowerCase() !== 'barcelona') {
    street = street.replace(/,?\s*Barcelona\s*$/i, '');
  }

  // Remove municipality if explicitly present as a comma suffix
  if (municipality) {
    const escapedMun = municipality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    street = street.replace(new RegExp(`,?\\s*${escapedMun}\\s*$`, 'i'), '');
  }

  // Remove trailing ", Barcelona" if still present
  street = street.replace(/,?\s*Barcelona\s*$/i, '');

  street = street.trim().replace(/,+$/, '').trim();

  return municipality ? `${street} · ${municipality}` : street;
}

/**
 * Generates canonical ID slug: ${chainSlug}-${lat.toFixed(6)}-${lon.toFixed(6)}
 */
export function generatePlaceId(chain, lat, lng) {
  const chainSlug = chain.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${chainSlug}-${Number(lat).toFixed(6)}-${Number(lng).toFixed(6)}`;
}

/**
 * Computes great-circle distance between two coordinates in meters.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Deduplicates candidates against existing catalog:
 * - Match by Google Place ID -> alreadyInCatalog
 * - Match by Chain & Proximity <= thresholdMeters:
 *     - If existing place already has googlePlaceId -> alreadyInCatalog
 *     - If existing place missing googlePlaceId -> enrichedExisting
 * - Proximity > thresholdMeters -> newCandidates
 */
export function deduplicateAgainstCatalog(candidates = [], existingPlaces = [], thresholdMeters = 50) {
  const alreadyInCatalog = [];
  const enrichedExisting = [];
  const newCandidates = [];

  const existingByPlaceId = new Map();
  const existingList = [];

  for (const place of existingPlaces) {
    const copy = { ...place };
    existingList.push(copy);
    if (copy.googlePlaceId) {
      existingByPlaceId.set(copy.googlePlaceId, copy);
    }
  }

  const seenCandidateIds = new Set();

  for (const cand of candidates) {
    const candPlaceId = cand.id || cand.googlePlaceId;
    if (candPlaceId) {
      if (seenCandidateIds.has(candPlaceId)) {
        continue;
      }
      seenCandidateIds.add(candPlaceId);
    }

    const candLat = cand.location?.latitude ?? cand.latitude;
    const candLon = cand.location?.longitude ?? cand.longitude;

    // Rule 1: Catalog Place ID Match
    if (candPlaceId && existingByPlaceId.has(candPlaceId)) {
      const existingMatch = existingByPlaceId.get(candPlaceId);
      alreadyInCatalog.push({ ...cand, id: candPlaceId, matchedExistingId: existingMatch.id });
      continue;
    }

    if (
      typeof candLat !== 'number' ||
      typeof candLon !== 'number' ||
      !Number.isFinite(candLat) ||
      !Number.isFinite(candLon)
    ) {
      continue;
    }

    // Rule 2: Proximity & Chain Match (<= thresholdMeters)
    let closestExisting = null;
    let minDistance = Infinity;

    for (const existing of existingList) {
      if (!existing.chain || !cand.chain) continue;
      if (existing.chain.toLowerCase().trim() !== cand.chain.toLowerCase().trim()) continue;
      if (typeof existing.latitude !== 'number' || typeof existing.longitude !== 'number') continue;

      const dist = haversineDistanceMeters(candLat, candLon, existing.latitude, existing.longitude);
      if (dist <= thresholdMeters && dist < minDistance) {
        minDistance = dist;
        closestExisting = existing;
      }
    }

    if (closestExisting) {
      if (closestExisting.googlePlaceId) {
        alreadyInCatalog.push({
          ...cand,
          id: candPlaceId,
          matchedExistingId: closestExisting.id,
          distanceMeters: Math.round(minDistance),
        });
      } else {
        closestExisting.googlePlaceId = candPlaceId;
        if (candPlaceId) {
          existingByPlaceId.set(candPlaceId, closestExisting);
        }
        enrichedExisting.push({
          existingId: closestExisting.id,
          googlePlaceId: candPlaceId,
          googleMapsUrl: cand.googleMapsUri || cand.googleMapsUrl,
          candidate: cand,
          distanceMeters: Math.round(minDistance),
        });
      }
      continue;
    }

    // Proximity check against already-accepted new candidates in this run
    let duplicateOfNew = false;
    for (const newCand of newCandidates) {
      if (newCand.chain?.toLowerCase().trim() === cand.chain?.toLowerCase().trim()) {
        const dist = haversineDistanceMeters(candLat, candLon, newCand.latitude, newCand.longitude);
        if (dist <= thresholdMeters) {
          duplicateOfNew = true;
          break;
        }
      }
    }

    if (duplicateOfNew) {
      alreadyInCatalog.push({ ...cand, id: candPlaceId });
      continue;
    }

    // Rule 3: New Candidate Discovery (> thresholdMeters)
    const address = formatAmbAddress(cand.formattedAddress || cand.address, cand.municipality);
    const streetPart = address.split(' · ')[0].trim();
    let name = cand.name;
    if (!name) {
      const display = cand.displayName?.text?.trim();
      if (display) {
        if (display.toLowerCase() === cand.chain.toLowerCase()) {
          name = `${cand.chain} - ${streetPart}`;
        } else if (matchesBrand(display, cand.chain)) {
          name = display;
        } else {
          name = `${cand.chain} - ${display}`;
        }
      } else {
        name = `${cand.chain} - ${streetPart}`;
      }
    }
    const roundedLat = Number(Number(candLat).toFixed(6));
    const roundedLon = Number(Number(candLon).toFixed(6));
    const id = generatePlaceId(cand.chain, roundedLat, roundedLon);

    const newCandidatePlace = {
      id,
      name,
      chain: cand.chain,
      address,
      latitude: roundedLat,
      longitude: roundedLon,
      googlePlaceId: candPlaceId,
      googleMapsUrl: cand.googleMapsUri || cand.googleMapsUrl,
      verification: {
        status: 'listed',
        checkedAt: new Date().toISOString().slice(0, 10),
        sourceUrl: cand.googleMapsUri || 'https://maps.google.com',
      },
    };

    newCandidates.push(newCandidatePlace);
  }

  return {
    alreadyInCatalog,
    enrichedExisting,
    newCandidates,
  };
}

export function buildMatrixQuery(chain, searchTerm, location) {
  if (BARCELONA_DISTRICTS.includes(location)) {
    return `${searchTerm} ${location}, Barcelona`;
  }
  if (location.toLowerCase() === 'barcelona') {
    return `${searchTerm} Barcelona`;
  }
  return `${searchTerm} ${location}`;
}

export function loadEnv() {
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
    apply: false,
    noCache: false,
    apiKey: process.env.GOOGLE_MAPS_API_KEY || null,
    cacheFile: path.resolve('.cache/amb-discovery-cache.json'),
    cities: null,
    chains: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      flags.apply = true;
    } else if (arg === '--no-cache') {
      flags.noCache = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg.startsWith('--api-key=')) {
      flags.apiKey = arg.slice('--api-key='.length);
    } else if (arg === '--api-key') {
      flags.apiKey = args[++i] ?? '';
    } else if (arg.startsWith('--cache-file=')) {
      flags.cacheFile = path.resolve(arg.slice('--cache-file='.length));
    } else if (arg === '--cache-file') {
      flags.cacheFile = path.resolve(args[++i] ?? '');
    } else if (arg.startsWith('--cities=')) {
      flags.cities = arg.slice('--cities='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--cities') {
      flags.cities = (args[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--chains=')) {
      flags.chains = arg.slice('--chains='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--chains') {
      flags.chains = (args[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return flags;
}

export async function searchGooglePlaces(query, apiKey) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus',
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        rectangle: {
          low: { latitude: AMB_BOUNDING_BOX.minLat, longitude: AMB_BOUNDING_BOX.minLng },
          high: { latitude: AMB_BOUNDING_BOX.maxLat, longitude: AMB_BOUNDING_BOX.maxLng },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  return await res.json();
}

export function printUsage() {
  console.log(`
[AMB Cafe Discovery Engine]
Discovers and reconciles cafes across all 36 AMB municipalities for 7 target chains.

Usage:
  node scripts/discover-amb-cafes.mjs [options]
  GOOGLE_MAPS_API_KEY=your_key node scripts/discover-amb-cafes.mjs [options]

Options:
  --apply            Update src/data/places.json with discoveries and enrichments (dry-run by default)
  --cities=LIST      Comma-separated list of municipalities to restrict search to
  --chains=LIST      Comma-separated list of chains to restrict search to
  --api-key=KEY      Google Maps API key (fall back to GOOGLE_MAPS_API_KEY in .env)
  --cache-file=PATH  Path to cache file (default: .cache/amb-discovery-cache.json)
  --no-cache         Ignore existing cache and re-fetch from API
  --help, -h         Show this help message
`);
}

export async function main() {
  const flags = parseArgs();
  const placesPath = path.resolve('src/data/places.json');
  const cachePath = flags.cacheFile;
  const cacheDir = path.dirname(cachePath);
  const reportPath = path.resolve('docs/data/amb-candidates.json');

  let cache = {};
  if (!flags.noCache && existsSync(cachePath)) {
    try {
      cache = JSON.parse(await readFile(cachePath, 'utf8'));
    } catch {}
  }

  const hasCache = Object.keys(cache).length > 0;

  if (flags.help || flags.apiKey === '' || (!flags.apiKey && !hasCache)) {
    printUsage();
    process.exit(0);
  }

  await mkdir(cacheDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  // Resolve target chains
  let targetChains = TARGET_CHAINS;
  if (flags.chains && flags.chains.length > 0) {
    const chainFilter = flags.chains.map(c => c.toLowerCase());
    targetChains = TARGET_CHAINS.filter(chain =>
      chainFilter.some(f => chain.toLowerCase().includes(f) || f.includes(chain.toLowerCase()))
    );
  }

  // Resolve target municipalities
  let targetMunicipalities = AMB_MUNICIPALITIES;
  if (flags.cities && flags.cities.length > 0) {
    const cityFilter = flags.cities.map(c => c.toLowerCase());
    targetMunicipalities = AMB_MUNICIPALITIES.filter(m =>
      cityFilter.some(filter => m.toLowerCase().includes(filter) || filter.includes(m.toLowerCase()))
    );
    if (cityFilter.some(f => f === 'barcelona')) {
      for (const d of BARCELONA_DISTRICTS) {
        if (!targetMunicipalities.includes(d)) {
          targetMunicipalities.push(d);
        }
      }
    }
  }

  // Deduplicate targetMunicipalities list
  targetMunicipalities = [...new Set(targetMunicipalities)];

  console.log(`\n[AMB Cafe Discovery Engine]`);
  console.log(`Mode: ${flags.apply ? 'APPLY (will update places.json)' : 'DRY RUN (no changes to places.json)'}`);
  console.log(`Chains (${targetChains.length}): ${targetChains.join(', ')}`);
  console.log(
    `Municipalities/Districts (${targetMunicipalities.length}): ${
      targetMunicipalities.length <= 10
        ? targetMunicipalities.join(', ')
        : `${targetMunicipalities.slice(0, 5).join(', ')}... (+${targetMunicipalities.length - 5} more)`
    }`
  );
  console.log(`Cache file: ${cachePath} (${Object.keys(cache).length} entries cached)`);

  const rawCandidates = [];
  let queryCount = 0;
  let cacheHitCount = 0;
  let apiCallCount = 0;

  for (const chain of targetChains) {
    const searchTerms = CHAIN_SEARCH_TERMS[chain] || [chain];
    for (const mun of targetMunicipalities) {
      for (const term of searchTerms) {
        queryCount++;
        const query = buildMatrixQuery(chain, term, mun);
        const cacheKey = `${chain}:${mun}:${term}`;

        let data = (!flags.noCache && (cache[cacheKey] || cache[query])) ? (cache[cacheKey] || cache[query]) : null;

        if (data) {
          cacheHitCount++;
        } else {
          if (!flags.apiKey) {
            console.warn(`[WARN] No API key; skipping uncached query: "${query}"`);
            continue;
          }

          try {
            data = await searchGooglePlaces(query, flags.apiKey);
            apiCallCount++;
            cache[cacheKey] = data;
            cache[query] = data;
            await writeFile(cachePath, JSON.stringify(cache, null, 2));
            await new Promise(r => setTimeout(r, 100));
          } catch (err) {
            console.error(`[ERROR] Query failed "${query}":`, err.message);
            if (err.message.includes('HTTP 401') || err.message.includes('HTTP 403')) {
              console.error(`[FATAL] Authentication or quota error encountered. Aborting discovery.`);
              throw err;
            }
            continue;
          }
        }

        const places = data?.places || [];
        for (const p of places) {
          if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
          const lat = p.location?.latitude;
          const lon = p.location?.longitude;
          if (!isWithinAmbBoundingBox(lat, lon)) continue;
          const displayName = p.displayName?.text || '';
          if (!matchesBrand(displayName, chain)) continue;

          const detectedMunicipality = extractMunicipality(p.formattedAddress, mun);

          rawCandidates.push({
            id: p.id,
            displayName: p.displayName,
            formattedAddress: p.formattedAddress,
            location: p.location,
            googleMapsUri: p.googleMapsUri,
            businessStatus: p.businessStatus,
            chain,
            municipality: detectedMunicipality,
          });
        }
      }
    }
  }

  console.log(`\nQueries executed: ${queryCount} (${cacheHitCount} cached, ${apiCallCount} fetched via API)`);
  console.log(`Raw candidates before deduplication: ${rawCandidates.length}`);

  // Load current catalog
  const catalogPlacesRaw = await readFile(placesPath, 'utf8');
  const catalogPlaces = JSON.parse(catalogPlacesRaw);

  // Run deduplication
  const result = deduplicateAgainstCatalog(rawCandidates, catalogPlaces, 50);

  // Compute breakdowns
  const byMunicipality = {};
  const byChain = {};

  for (const cand of result.newCandidates) {
    const mun = cand.address.split(' · ')[1] || 'Unknown';
    byMunicipality[mun] = byMunicipality[mun] || { newCandidates: 0, enriched: 0 };
    byMunicipality[mun].newCandidates++;

    const ch = cand.chain;
    byChain[ch] = byChain[ch] || { newCandidates: 0, enriched: 0 };
    byChain[ch].newCandidates++;
  }

  for (const enriched of result.enrichedExisting) {
    const mun = enriched.candidate?.municipality || 'Unknown';
    byMunicipality[mun] = byMunicipality[mun] || { newCandidates: 0, enriched: 0 };
    byMunicipality[mun].enriched++;

    const ch = enriched.candidate?.chain || 'Unknown';
    byChain[ch] = byChain[ch] || { newCandidates: 0, enriched: 0 };
    byChain[ch].enriched++;
  }

  // Create report
  const report = {
    generatedAt: new Date().toISOString(),
    stats: {
      totalQueries: queryCount,
      cacheHits: cacheHitCount,
      apiCalls: apiCallCount,
      rawCandidates: rawCandidates.length,
      alreadyInCatalog: result.alreadyInCatalog.length,
      enrichedExisting: result.enrichedExisting.length,
      newCandidates: result.newCandidates.length,
    },
    byChain,
    byMunicipality,
    enrichedExisting: result.enrichedExisting,
    newCandidates: result.newCandidates,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

  // Display summary
  console.log(`\n=====================================================`);
  console.log(`            AMB Cafe Discovery Summary               `);
  console.log(`=====================================================`);
  console.log(`Already in Catalog:       ${result.alreadyInCatalog.length}`);
  console.log(`Enrichable Existing:      ${result.enrichedExisting.length}`);
  console.log(`New Candidates Found:     ${result.newCandidates.length}`);
  console.log(`Report written to:        ${reportPath}`);

  if (Object.keys(byChain).length > 0) {
    console.log(`\n--- Breakdown by Chain ---`);
    console.table(
      Object.entries(byChain).map(([chain, counts]) => ({
        Chain: chain,
        'New Candidates': counts.newCandidates,
        Enriched: counts.enriched,
      }))
    );
  }

  if (Object.keys(byMunicipality).length > 0) {
    console.log(`\n--- Breakdown by Municipality ---`);
    console.table(
      Object.entries(byMunicipality).map(([mun, counts]) => ({
        Municipality: mun,
        'New Candidates': counts.newCandidates,
        Enriched: counts.enriched,
      }))
    );
  }

  // Apply changes if --apply is set
  if (flags.apply) {
    const existingMap = new Map(catalogPlaces.map(p => [p.id, p]));
    let enrichedCount = 0;

    for (const item of result.enrichedExisting) {
      const existing = existingMap.get(item.existingId);
      if (existing) {
        if (!existing.googlePlaceId && item.googlePlaceId) {
          existing.googlePlaceId = item.googlePlaceId;
          enrichedCount++;
        }
        if (!existing.googleMapsUrl && item.googleMapsUrl) {
          existing.googleMapsUrl = item.googleMapsUrl;
        }
      }
    }

    let addedCount = 0;
    for (const cand of result.newCandidates) {
      if (!existingMap.has(cand.id)) {
        catalogPlaces.push(cand);
        existingMap.set(cand.id, cand);
        addedCount++;
      }
    }

    await writeFile(placesPath, JSON.stringify(catalogPlaces, null, 2) + '\n');
    console.log(`\n[APPLY] Enriched ${enrichedCount} existing venues with Google Place IDs.`);
    console.log(`[APPLY] Appended ${addedCount} new candidates to ${placesPath} (Total catalog: ${catalogPlaces.length}).`);

    console.log(`\n[APPLY] Running check:places verification...`);
    try {
      execFileSync(process.execPath, ['scripts/check-places.mjs'], { stdio: 'inherit' });
      console.log(`[APPLY] Catalog integrity verified successfully.`);
    } catch (err) {
      console.error(`[ERROR] check:places failed after applying changes. Rolling back ${placesPath}...`);
      await writeFile(placesPath, catalogPlacesRaw);
      console.log(`[ROLLBACK] Successfully restored original ${placesPath}.`);
      throw err;
    }
  } else {
    console.log(`\n[DRY RUN] No changes made to ${placesPath}. Run with --apply to commit these discoveries.`);
  }
}

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase() ||
  path.resolve(process.argv[1]).toLowerCase() === path.resolve('scripts/discover-amb-cafes.mjs').toLowerCase()
);

if (isMain) {
  main().catch(err => {
    console.error('Fatal discovery error:', err);
    process.exit(1);
  });
}

