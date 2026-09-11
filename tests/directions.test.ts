import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDirectionsUrl } from '../src/utils/directions.ts';
import type { Place } from '../src/types.ts';

const basePlace: Place = {
  id: 'test-cafe',
  name: "Santagloria Coffee & Bakery",
  chain: 'Santagloria',
  address: "Carrer d'Aragó, 205 · Eixample",
  latitude: 41.3884,
  longitude: 2.1596,
};

test('getDirectionsUrl builds Universal URL with destination_place_id when present', () => {
  const placeWithGoogle: Place = {
    ...basePlace,
    googlePlaceId: 'ChIJuaKigICipBIR1uW0YeZo_2M',
  };

  const url = getDirectionsUrl(placeWithGoogle);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
  assert.match(url, /destination_place_id=ChIJuaKigICipBIR1uW0YeZo_2M/);
  assert.match(url, /travelmode=walking/);
  assert.match(url, /destination=Santagloria%20Coffee%20%26%20Bakery%2C%20Carrer%20d'Arag%C3%B3%2C%20205%20%C2%B7%20Eixample/);
});

test('getDirectionsUrl falls back to coordinates when googlePlaceId is absent', () => {
  const url = getDirectionsUrl(basePlace);
  assert.equal(
    url,
    'https://www.google.com/maps/dir/?api=1&destination=41.3884,2.1596&travelmode=walking'
  );
});

test('getDirectionsUrl correctly encodes Catalan and special characters in query', () => {
  const placeWithSpecialChars: Place = {
    ...basePlace,
    name: "Cafè de l'Òpera",
    address: 'La Rambla, 74 · Ciutat Vella',
    googlePlaceId: 'ChIJTestPlaceId12345',
  };

  const url = getDirectionsUrl(placeWithSpecialChars);
  assert.ok(url.includes('destination=Caf%C3%A8%20de%20l\'%C3%92pera%2C%20La%20Rambla%2C%2074%20%C2%B7%20Ciutat%20Vella'));
});
