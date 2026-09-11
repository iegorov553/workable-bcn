import type { Place } from '../types';

/**
 * Builds a Google Maps Universal Directions URL.
 * When `googlePlaceId` is present, uses `destination_place_id` alongside
 * a query-formatted destination for POI resolution in Google Maps.
 * Falls back to latitude,longitude when `googlePlaceId` is missing.
 */
export function getDirectionsUrl(place: Place): string {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const travelmode = 'travelmode=walking';

  if (place.googlePlaceId) {
    const destination = encodeURIComponent(`${place.name}, ${place.address}`);
    return `${base}&destination=${destination}&destination_place_id=${place.googlePlaceId}&${travelmode}`;
  }

  return `${base}&destination=${place.latitude},${place.longitude}&${travelmode}`;
}
