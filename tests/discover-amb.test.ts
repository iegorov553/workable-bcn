import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinAmbBoundingBox,
  matchesBrand,
  formatAmbAddress,
  generatePlaceId,
  deduplicateAgainstCatalog,
} from '../scripts/discover-amb-cafes.mjs';
import type { Place } from '../src/types.ts';

test('isWithinAmbBoundingBox accepts coordinates within AMB and rejects outliers', () => {
  // Plaça Catalunya
  assert.equal(isWithinAmbBoundingBox(41.3870, 2.1700), true);
  // Badalona center
  assert.equal(isWithinAmbBoundingBox(41.4500, 2.2470), true);
  // Castelldefels
  assert.equal(isWithinAmbBoundingBox(41.2800, 1.9760), true);
  // Madrid (outlier)
  assert.equal(isWithinAmbBoundingBox(40.4168, -3.7038), false);
  // Girona (outlier)
  assert.equal(isWithinAmbBoundingBox(41.9794, 2.8214), false);
});

test('matchesBrand verifies chain brand name in Google display name', () => {
  assert.equal(matchesBrand('365 Obrador Balmes', '365 Café'), true);
  assert.equal(matchesBrand('Cafeteria 365', '365 Café'), true);
  assert.equal(matchesBrand('Granier Bakery', 'Granier'), true);
  assert.equal(matchesBrand('Vivari coffee & bakery', 'Vivari'), true);
  assert.equal(matchesBrand('Santagloria Coffee', 'Santagloria'), true);
  assert.equal(matchesBrand('El Fornet', 'El Fornet'), true);
  assert.equal(matchesBrand('SandwiChez Diagonal', 'SandwiChez'), true);
  assert.equal(matchesBrand('Buenas Migas Gràcia', 'Buenas Migas'), true);
  // Unrelated bakery
  assert.equal(matchesBrand('Forn de Pa Garcia', '365 Café'), false);
});

test('formatAmbAddress formats clean address with municipality suffix', () => {
  const formatted = formatAmbAddress(
    'Av. del Carrilet, 142, 08902 L\'Hospitalet de Llobregat, Barcelona, Spain',
    'L\'Hospitalet de Llobregat'
  );
  assert.equal(formatted, 'Av. del Carrilet, 142 · L\'Hospitalet de Llobregat');
});

test('generatePlaceId creates canonical slug-lat-lon ID', () => {
  const id = generatePlaceId('365 Café', 41.365421, 2.112431);
  assert.equal(id, '365-caf--41.365421-2.112431');
});

test('deduplicateAgainstCatalog categorizes existing, enrichable, and new candidates', () => {
  const existingPlaces: Place[] = [
    {
      id: 'vivari-existing',
      name: 'Vivari - Central',
      chain: 'Vivari',
      address: 'Gran Via, 500 · Eixample',
      latitude: 41.3850,
      longitude: 2.1600,
      googlePlaceId: 'ChIJExistingPlace1',
    },
    {
      id: 'granier-no-place-id',
      name: 'Granier - Local',
      chain: 'Granier',
      address: 'Carrer de Sants, 50 · Sants-Montjuïc',
      latitude: 41.3750,
      longitude: 2.1350,
    },
  ];

  const candidates = [
    // 1. Exact place_id match
    {
      id: 'ChIJExistingPlace1',
      displayName: { text: 'Vivari' },
      formattedAddress: 'Gran Via, 500, Barcelona',
      location: { latitude: 41.3850, longitude: 2.1600 },
      googleMapsUri: 'https://maps.google.com/?cid=1',
      chain: 'Vivari',
      municipality: 'Barcelona',
    },
    // 2. Proximity match (<50m) to granier-no-place-id (needs enrichment)
    {
      id: 'ChIJGranierNewPlaceId',
      displayName: { text: 'Granier' },
      formattedAddress: 'Carrer de Sants, 52, Barcelona',
      location: { latitude: 41.3751, longitude: 2.1351 }, // ~14m away
      googleMapsUri: 'https://maps.google.com/?cid=2',
      chain: 'Granier',
      municipality: 'Barcelona',
    },
    // 3. New candidate in Badalona (>50m away from everything)
    {
      id: 'ChIJBadalona365',
      displayName: { text: '365 Obrador' },
      formattedAddress: 'Carrer de Mar, 10, Badalona',
      location: { latitude: 41.4480, longitude: 2.2470 },
      googleMapsUri: 'https://maps.google.com/?cid=3',
      chain: '365 Café',
      municipality: 'Badalona',
    },
  ];

  const result = deduplicateAgainstCatalog(candidates, existingPlaces, 50);
  assert.equal(result.alreadyInCatalog.length, 1);
  assert.equal(result.alreadyInCatalog[0].id, 'ChIJExistingPlace1');

  assert.equal(result.enrichedExisting.length, 1);
  assert.equal(result.enrichedExisting[0].existingId, 'granier-no-place-id');
  assert.equal(result.enrichedExisting[0].googlePlaceId, 'ChIJGranierNewPlaceId');

  assert.equal(result.newCandidates.length, 1);
  assert.equal(result.newCandidates[0].googlePlaceId, 'ChIJBadalona365');
  assert.equal(result.newCandidates[0].chain, '365 Café');
  assert.match(result.newCandidates[0].address, /· Badalona/);
});
