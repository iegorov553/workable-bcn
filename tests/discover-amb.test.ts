import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinAmbBoundingBox,
  matchesBrand,
  formatAmbAddress,
  generatePlaceId,
  deduplicateAgainstCatalog,
  extractMunicipality,
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

test('matchesBrand verifies chain brand name in Google display name and rejects false positives', () => {
  assert.equal(matchesBrand('365 Obrador Balmes', '365 Café'), true);
  assert.equal(matchesBrand('Cafeteria 365', '365 Café'), true);
  assert.equal(matchesBrand('Granier Bakery', 'Granier'), true);
  assert.equal(matchesBrand('Vivari coffee & bakery', 'Vivari'), true);
  assert.equal(matchesBrand('Santagloria Coffee', 'Santagloria'), true);
  assert.equal(matchesBrand('El Fornet', 'El Fornet'), true);
  assert.equal(matchesBrand('El Fornet - Cafeteria', 'El Fornet'), true);
  assert.equal(matchesBrand("El Fornet D'En Rossend", 'El Fornet'), true);
  assert.equal(matchesBrand('SandwiChez Diagonal', 'SandwiChez'), true);
  assert.equal(matchesBrand('Buenas Migas Gràcia', 'Buenas Migas'), true);

  // False positive rejections
  assert.equal(matchesBrand('Forn de Pa Garcia', '365 Café'), false);
  // SandwiChez false positives (roofing panels, kebabs, pizzerias, generic sandwich bars)
  assert.equal(matchesBrand('Panel Sandwich Bcn', 'SandwiChez'), false);
  assert.equal(matchesBrand('Panel Sandwich Barcelona', 'SandwiChez'), false);
  assert.equal(matchesBrand('Dōner Sandwich Dōner Kebab', 'SandwiChez'), false);
  assert.equal(matchesBrand('Patatús Pizzeria - Burgers - Tapes - Sandwiches', 'SandwiChez'), false);
  assert.equal(matchesBrand('PUFF Sandwich', 'SandwiChez'), false);
  assert.equal(matchesBrand('Sandwich Club Barcelona', 'SandwiChez'), false);
  // El Fornet false positives (generic small bakeries "El fornet de...")
  assert.equal(matchesBrand('El fornet de la Lluïsa', 'El Fornet'), false);
  assert.equal(matchesBrand("El fornet de l'Aran", 'El Fornet'), false);
  assert.equal(matchesBrand('El Fornet De Natalia', 'El Fornet'), false);
  assert.equal(matchesBrand('El fornet de la Maria', 'El Fornet'), false);
  assert.equal(matchesBrand('El Fornet de la Mercé', 'El Fornet'), false);
  assert.equal(matchesBrand('José M Fornet', 'El Fornet'), false);
});

test('extractMunicipality correctly identifies municipality from formatted address', () => {
  assert.equal(
    extractMunicipality('Av. Santa Maria, 9, 08860 Castelldefels, Barcelona, Spain', 'Sant Boi de Llobregat'),
    'Castelldefels'
  );
  assert.equal(
    extractMunicipality('Pg. de la Rambla, 1, 08911 Badalona, Barcelona, Spain', 'Barcelona'),
    'Badalona'
  );
  assert.equal(
    extractMunicipality("Av. del Carrilet, 142, 08902 L'Hospitalet de Llobregat, Barcelona, Spain", 'Cornellà'),
    "L'Hospitalet de Llobregat"
  );
  assert.equal(
    extractMunicipality('Carrer Gran de Gràcia, 45, Gràcia, 08012 Barcelona, Spain', 'Barcelona'),
    'Gràcia'
  );
  assert.equal(
    extractMunicipality('Carrer de Balmes, 365, 08022 Barcelona, Spain', 'Sant Climent'),
    'Sarrià-Sant Gervasi'
  );
  assert.equal(
    extractMunicipality('Carrer de Mallorca, 537, 08013 Barcelona, Spain', 'Eixample'),
    'Eixample'
  );
});

test('formatAmbAddress formats clean address with municipality suffix', () => {
  const formatted = formatAmbAddress(
    'Av. del Carrilet, 142, 08902 L\'Hospitalet de Llobregat, Barcelona, Spain',
    'L\'Hospitalet de Llobregat'
  );
  assert.equal(formatted, 'Av. del Carrilet, 142 · L\'Hospitalet de Llobregat');

  // Address without postal code ending with municipality, Barcelona, Spain
  const withoutPostal = formatAmbAddress(
    'Rambla de Badalona, 5, Badalona, Barcelona, Spain',
    'Badalona'
  );
  assert.equal(withoutPostal, 'Rambla de Badalona, 5 · Badalona');
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
    // 4. Malformed candidate with invalid coordinates (should be skipped)
    {
      id: 'ChIJMalformedCoords',
      displayName: { text: 'Vivari' },
      formattedAddress: 'Nowhere',
      location: { latitude: NaN, longitude: undefined },
      chain: 'Vivari',
      municipality: 'Barcelona',
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
  assert.equal(result.newCandidates[0].name, '365 Café - Carrer de Mar, 10');
  assert.equal(result.newCandidates[0].address, 'Carrer de Mar, 10 · Badalona');
});
