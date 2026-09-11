import type { Coordinates, Place } from '../types';

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceKm(place: Place, origin?: Coordinates | null) {
  if (!origin) return null;
  const latitudeDelta = radians(place.latitude - origin.latitude);
  const longitudeDelta = radians(place.longitude - origin.longitude);
  const startLatitude = radians(origin.latitude);
  const endLatitude = radians(place.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, haversine));
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

export function formatDistance(distance: number | null) {
  if (distance === null) return null;
  if (distance < 1) return `${Math.max(50, Math.round((distance * 1000) / 50) * 50)} m`;
  return `${distance.toFixed(distance < 10 ? 1 : 0)} km`;
}
