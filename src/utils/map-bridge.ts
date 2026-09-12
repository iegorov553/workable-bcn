import type { Coordinates, Place } from '../types';
import type { CameraCommand } from './map-camera';

export type MapPayload = {
  places: Place[];
  selectedId: string | null;
  userLocation: Coordinates | null;
  friendLocation?: Coordinates | null;
  meetMode?: boolean;
  cameraCommand: CameraCommand | null;
  chainColors?: Record<string, string>;
  topMatchIds?: string[];
};

// Keep catalogue text inert while transporting it to the map document.
// The document decodes it only after initialization; no injectedObjectJson is used.
export function encodeMapPayload(payload: MapPayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeMapPayload(payload: string): MapPayload {
  return JSON.parse(decodeURIComponent(payload)) as MapPayload;
}

export function mapUpdateScript(payload: string): string {
  return `window.workableMapUpdate && window.workableMapUpdate(${JSON.stringify(payload)}); true;`;
}

export type MapMessage =
  | { type: 'ready' | 'updated' | 'error' }
  | { type: 'select'; id: string }
  | { type: 'mapClick'; latitude: number; longitude: number };
export function parseMapMessage(data: string): MapMessage | null {
  try {
    const message = JSON.parse(data);
    if (!message || typeof message !== 'object') return null;
    if (message.type === 'select' && typeof message.id === 'string') return message;
    if (
      message.type === 'mapClick' &&
      typeof message.latitude === 'number' &&
      Number.isFinite(message.latitude) &&
      typeof message.longitude === 'number' &&
      Number.isFinite(message.longitude)
    ) {
      return message;
    }
    if (['ready', 'updated', 'error'].includes(message.type)) return message;
  } catch { /* Ignore messages that are not from the map protocol. */ }
  return null;
}
