/**
 * AMB Cafe Discovery & Deduplication Engine
 * Discovers and reconciles cafes across the 36 AMB municipalities.
 */

export const AMB_BOUNDING_BOX = {
  minLat: 41.20,
  maxLat: 41.55,
  minLng: 1.90,
  maxLng: 2.35,
};

export const BRAND_PATTERNS = {
  '365 Café': /\b365\b/i,
  'Granier': /granier/i,
  'Vivari': /vivari/i,
  'Santagloria': /santagloria/i,
  'El Fornet': /fornet/i,
  'SandwiChez': /sandwich/i,
  'Buenas Migas': /buenas\s*migas/i,
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
  const pattern = BRAND_PATTERNS[chain];
  if (pattern) {
    return pattern.test(name);
  }
  return name.toLowerCase().includes(chain.toLowerCase());
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
    const id = generatePlaceId(cand.chain, candLat, candLon);

    const newCandidatePlace = {
      id,
      name,
      chain: cand.chain,
      address,
      latitude: candLat,
      longitude: candLon,
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
