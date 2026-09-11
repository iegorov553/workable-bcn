import { LocationRequestError } from './location-request';
import type { Coordinates } from '../types';

export function requestBrowserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new LocationRequestError('Location is unavailable. Open the app over HTTPS or on localhost.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      error => reject(new LocationRequestError(error.code === 1
        ? 'Allow location access in your browser settings for this site.'
        : error.code === 3 ? 'Could not find your location within 15 seconds. Please try again.' : 'Your browser could not find your location. Check device location settings.')),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 },
    );
  });
}
