export type PlaceNotes = Record<string, string>;

export const DEFAULT_MAX_NOTE_LENGTH = 2000;

export function sanitizeNote(text: string, maxLength: number = DEFAULT_MAX_NOTE_LENGTH): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function parseNotes(raw: string | null | undefined, validIds: Set<string>): PlaceNotes {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: PlaceNotes = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (validIds.has(id) && typeof value === 'string') {
        const cleaned = sanitizeNote(value);
        if (cleaned.length > 0) {
          result[id] = cleaned;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeNotes(notes: PlaceNotes): string {
  return JSON.stringify(notes);
}
