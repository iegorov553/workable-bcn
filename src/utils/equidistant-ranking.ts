import type { Place, Coordinates } from '../types.ts';
import type { TransitNetwork } from '../types/transit.ts';
import { findOptimalRoute, type RouteEstimate } from './transit-routing.ts';
import { distanceKm } from './distance.ts';

export type EquidistantMatch = {
  place: Place;
  timeA: number;
  modeA: 'walk' | 'transit';
  timeB: number;
  modeB: 'walk' | 'transit';
  deltaMinutes: number;
  score: number;
  isBestMatch: boolean;
  badgeLabel: string;
  matchTag: string;
};

export const DEFAULT_MEET_RADIUS_FACTOR = 0.58;
export const DEFAULT_MEET_MIN_BUFFER_KM = 0.25;
export const DEFAULT_MEET_MAX_RESULTS = 12;

export interface FilterMeetingPlacesOptions {
  network?: TransitNetwork;
  maxResults?: number;
  radiusFactor?: number;
  minBufferKm?: number;
}

/**
 * Calculates a fairness score for two travel times.
 * Lower score is better.
 * Formula: |T_A - T_B| + 0.5 * max(T_A, T_B)
 * - The delta |T_A - T_B| penalizes inequality between participants.
 * - The max term 0.5 * max(T_A, T_B) penalizes excessive travel time for both.
 */
export function calculateEquidistantScore(timeA: number, timeB: number): number {
  return Math.abs(timeA - timeB) + 0.5 * Math.max(timeA, timeB);
}

/**
 * Generates user-facing badge text showing travel times and route modes for both participants.
 * e.g. "🚇 18m you · 🚇 21m friend" or "🚶 8m you · 🚇 14m friend"
 */
export function formatEquidistantBadge(
  routeA: { minutes: number; mode: 'walk' | 'transit' },
  routeB: { minutes: number; mode: 'walk' | 'transit' }
): string {
  const iconA = routeA.mode === 'transit' ? '🚇' : '🚶';
  const iconB = routeB.mode === 'transit' ? '🚇' : '🚶';
  return `${iconA} ${routeA.minutes}m you · ${iconB} ${routeB.minutes}m friend`;
}

/**
 * Generates match quality tag indicating fairness and difference in travel time.
 * e.g. "★ Best match (Δ 2m)" or "Fair match (Δ 5m)"
 */
export function formatMatchTag(deltaMinutes: number, isBestMatch: boolean): string {
  return isBestMatch
    ? `★ Best match (Δ ${deltaMinutes}m)`
    : `Fair match (Δ ${deltaMinutes}m)`;
}

/**
 * Evaluates and ranks places by fairness of travel time from two origins (A and B).
 *
 * 1. Computes optimal route (transit vs walk) from originA and originB for each place.
 * 2. Scores each place using calculateEquidistantScore.
 * 3. Sorts by fairness score ascending.
 * 4. Breaks ties when scores are equal using lowest combined straight-line distance.
 * 5. Tags top 3 results as best matches.
 */
export function rankEquidistantPlaces(
  places: Place[],
  originA: Coordinates,
  originB: Coordinates,
  network?: TransitNetwork
): EquidistantMatch[] {
  if (places.length === 0) {
    return [];
  }

  const evaluated = places.map((place) => {
    const routeA: RouteEstimate = findOptimalRoute(originA, place, network);
    const routeB: RouteEstimate = findOptimalRoute(originB, place, network);
    const timeA = routeA.minutes;
    const timeB = routeB.minutes;
    const deltaMinutes = Math.abs(timeA - timeB);
    const score = calculateEquidistantScore(timeA, timeB);
    const distA = distanceKm(place, originA) ?? 0;
    const distB = distanceKm(place, originB) ?? 0;
    const combinedDistance = distA + distB;

    return {
      place,
      routeA,
      routeB,
      timeA,
      modeA: routeA.mode,
      timeB,
      modeB: routeB.mode,
      deltaMinutes,
      score,
      combinedDistance,
    };
  });

  // Sort ascending by score (strictly primary); tie-break by combined distance when scores are equal
  evaluated.sort((a, b) => {
    const scoreDiff = a.score - b.score;
    if (Math.abs(scoreDiff) > 1e-5) {
      return scoreDiff;
    }
    const distDiff = a.combinedDistance - b.combinedDistance;
    if (Math.abs(distDiff) > 1e-5) {
      return distDiff;
    }
    return a.place.id.localeCompare(b.place.id);
  });

  return evaluated.map((item, index) => {
    const isBestMatch = index < 3;
    const badgeLabel = formatEquidistantBadge(item.routeA, item.routeB);
    const matchTag = formatMatchTag(item.deltaMinutes, isBestMatch);

    return {
      place: item.place,
      timeA: item.timeA,
      modeA: item.modeA,
      timeB: item.timeB,
      modeB: item.modeB,
      deltaMinutes: item.deltaMinutes,
      score: item.score,
      isBestMatch,
      badgeLabel,
      matchTag,
    };
  });
}

/**
 * Calculates the meeting intersection radius for two coordinates.
 * Formula: max(distance * factor, distance / 2 + minBuffer)
 */
export function calculateMeetingRadius(
  distanceBetweenKm: number,
  factor = DEFAULT_MEET_RADIUS_FACTOR,
  minBufferKm = DEFAULT_MEET_MIN_BUFFER_KM
): number {
  return Math.max(distanceBetweenKm * factor, distanceBetweenKm / 2 + minBufferKm);
}

/**
 * Checks if a place coordinate falls within the meeting area defined by two origins.
 */
export function isWithinMeetingArea(
  placeCoord: Coordinates,
  originA: Coordinates,
  originB: Coordinates,
  radiusKm: number
): boolean {
  const distA = distanceKm(placeCoord, originA);
  const distB = distanceKm(placeCoord, originB);
  if (distA === null || distB === null) return false;
  return distA <= radiusKm && distB <= radiusKm;
}

/**
 * Filters places to only those located in the meeting intersection area between originA and originB,
 * ranks them by fairness, and caps the result to maxResults (default: 12).
 */
export function filterMeetingPlaces(
  places: Place[],
  originA: Coordinates,
  originB: Coordinates,
  options?: FilterMeetingPlacesOptions
): EquidistantMatch[] {
  if (places.length === 0) {
    return [];
  }

  const distanceBetween = distanceKm(originA, originB) ?? 0;
  const radius = calculateMeetingRadius(
    distanceBetween,
    options?.radiusFactor ?? DEFAULT_MEET_RADIUS_FACTOR,
    options?.minBufferKm ?? DEFAULT_MEET_MIN_BUFFER_KM
  );

  let candidates = places.filter((p) => isWithinMeetingArea(p, originA, originB, radius));

  // If active chain or query filters resulted in too few places (e.g. < 3),
  // but places were available in `places`, gently expand the radius up to 0.70 * distance
  // so the user still gets viable suggestions rather than an empty screen.
  if (candidates.length < 3 && places.length >= 3) {
    const expandedRadius = calculateMeetingRadius(distanceBetween, 0.70, 0.5);
    const expanded = places.filter((p) => isWithinMeetingArea(p, originA, originB, expandedRadius));
    if (expanded.length > candidates.length) {
      candidates = expanded;
    }
  }

  if (candidates.length === 0) {
    // If points are far apart (> 35km), fall back to best compromise across whole catalog
    if (distanceBetween > 35) {
      candidates = places;
    } else {
      return [];
    }
  }

  const ranked = rankEquidistantPlaces(candidates, originA, originB, options?.network);
  const maxResults = options?.maxResults ?? DEFAULT_MEET_MAX_RESULTS;

  const results = ranked.slice(0, maxResults);
  return results.map((item, index) => {
    const isBestMatch = index < 3;
    return {
      ...item,
      isBestMatch,
      matchTag: formatMatchTag(item.deltaMinutes, isBestMatch),
    };
  });
}

