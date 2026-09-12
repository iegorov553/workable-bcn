import type { Coordinates } from '../types';

export class LocationRequestError extends Error {
  constructor(message: string, public readonly settingsAvailable = false) { super(message); }
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LocationRequestError('Could not find your location within 15 seconds. Try near a window or outdoors.')), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export type Provider = {
  permission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  servicesEnabled: () => Promise<boolean>;
  current: () => Promise<{ coords: Coordinates }>;
  lastKnown?: () => Promise<{ coords: Coordinates; timestamp?: number } | null>;
};

function isValidCoordinates(coords?: Coordinates | null): coords is Coordinates {
  return Boolean(
    coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180,
  );
}

// The caller supplies a permission lookup, never a permission prompt.
// A fresh app session can restore distances without asking again or saving GPS.
export async function requestLocationIfGranted(provider: Provider, timeoutMs = 15000): Promise<Coordinates | null> {
  const permission = await withTimeout(provider.permission(), timeoutMs);
  if (!permission.granted) return null;
  return requestLocation({ ...provider, permission: async () => permission }, timeoutMs);
}

export async function requestLocation(provider: Provider, timeoutMs = 15000): Promise<Coordinates> {
  const permission = await provider.permission();
  if (!permission.granted) {
    throw new LocationRequestError(
      permission.canAskAgain ? 'Allow location access to return to your current position.' : 'Location access is disabled. Allow it in the app settings.',
      !permission.canAskAgain,
    );
  }
  if (!(await withTimeout(provider.servicesEnabled(), timeoutMs))) {
    throw new LocationRequestError('Device location is turned off. Enable it and try again.');
  }

  const lastKnownPromise = provider.lastKnown
    ? provider.lastKnown().catch(() => null)
    : Promise.resolve(null);

  try {
    const { coords } = await withTimeout(provider.current(), timeoutMs);
    if (!isValidCoordinates(coords)) {
      throw new LocationRequestError('Your device returned invalid coordinates. Please try again.');
    }
    return { latitude: coords.latitude, longitude: coords.longitude };
  } catch (err) {
    if (err instanceof LocationRequestError && err.message.includes('invalid coordinates')) {
      throw err;
    }
    const lastKnown = await lastKnownPromise;
    if (lastKnown && isValidCoordinates(lastKnown.coords)) {
      return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
    }
    throw err;
  }
}
