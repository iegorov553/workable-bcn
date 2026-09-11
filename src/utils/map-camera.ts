import type { Coordinates } from '../types';

export type CameraCommand = Coordinates & { requestId: number };
type MapCamera = { stop: () => unknown; flyTo: (center: [number, number], zoom: number, options: { duration: number }) => unknown; closePopup: () => unknown };

export function applyCameraCommand(map: MapCamera, command: CameraCommand) {
  map.stop();
  map.closePopup();
  map.flyTo([command.latitude, command.longitude], 16, { duration: 0.45 });
}
