export function parseHiddenPlaces(
  value: string | null | undefined,
  validIds: Set<string>
): Set<string> {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const result = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string' && item.length > 0 && validIds.has(item)) {
        result.add(item);
      }
    }
    return result;
  } catch {
    return new Set();
  }
}

export function serializeHiddenPlaces(hidden: Set<string>): string {
  return JSON.stringify(Array.from(hidden));
}
