import type { Coordinates } from '../types';

export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export const DEFAULT_WATCH_INTERVAL = 10000; // 10 seconds per Issue #4
export const DEFAULT_DISTANCE_INTERVAL = 5; // 5 meters

export type WatcherSubscription = {
  remove: () => void;
};

export type WatcherOptions = {
  timeInterval?: number;
  distanceInterval?: number;
  accuracy?: number;
  onLocation: (coords: Coordinates) => void;
  onError?: (error: unknown) => void;
};

export type WatcherProvider = {
  permission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  watchPosition: (
    options: { accuracy?: number; timeInterval?: number; distanceInterval?: number },
    callback: (location: { coords: Coordinates }) => void,
    errorHandler?: (error: unknown) => void
  ) => Promise<{ remove: () => void }>;
  getAppState?: () => AppStateStatus;
  addAppStateListener?: (listener: (state: AppStateStatus) => void) => { remove: () => void };
};

export function isValidCoordinates(coords?: Coordinates | null): coords is Coordinates {
  return Boolean(
    coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180,
  );
}

export async function startLocationWatcher(
  provider: WatcherProvider,
  options: WatcherOptions
): Promise<WatcherSubscription> {
  let removed = false;
  let currentSubscription: { remove: () => void } | null = null;
  let starting = false;

  const stop = () => {
    if (currentSubscription) {
      currentSubscription.remove();
      currentSubscription = null;
    }
  };

  const getAppState = provider.getAppState ?? (() => 'active');

  const start = async () => {
    if (removed || starting || currentSubscription) return;
    if (getAppState() !== 'active') return;

    starting = true;
    try {
      const permission = await provider.permission();
      if (removed || !permission.granted) return;
      if (getAppState() !== 'active') return;

      const sub = await provider.watchPosition(
        {
          accuracy: options.accuracy,
          timeInterval: options.timeInterval ?? DEFAULT_WATCH_INTERVAL,
          distanceInterval: options.distanceInterval ?? DEFAULT_DISTANCE_INTERVAL,
        },
        (loc) => {
          if (loc?.coords && isValidCoordinates(loc.coords)) {
            options.onLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        },
        (err) => {
          options.onError?.(err);
        }
      );

      if (removed || getAppState() !== 'active') {
        sub.remove();
      } else {
        currentSubscription = sub;
      }
    } catch (err) {
      options.onError?.(err);
    } finally {
      starting = false;
    }
  };

  await start();

  let appStateSub: { remove: () => void } | null = null;
  if (provider.addAppStateListener) {
    appStateSub = provider.addAppStateListener((nextState) => {
      if (removed) return;
      if (nextState === 'active') {
        void start();
      } else {
        stop();
      }
    });
  }

  return {
    remove: () => {
      removed = true;
      stop();
      appStateSub?.remove();
    },
  };
}
