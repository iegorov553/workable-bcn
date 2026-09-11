import type { Place } from '../types';

export function formatPlaceCount(count: number): string {
  return `${count} ${count === 1 ? 'place' : 'places'}`;
}

export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[’']/g, '');

export function matchesSearch(place: Place, query: string) {
  return normalizeSearch(`${place.name} ${place.address} ${place.chain}`).includes(normalizeSearch(query.trim()));
}

export function parseFavorites(value: string | null, validIds: Set<string>): Set<string> {
  try {
    const data: unknown = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string' && validIds.has(id)) : []);
  } catch { return new Set(); }
}
