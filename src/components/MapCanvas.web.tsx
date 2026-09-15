import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MapCanvasProps } from './MapCanvas';
import { getMapHtml } from '../map/map-html';
import { chainColors, colors } from '../theme';
import { encodeMapPayload, parseMapMessage } from '../utils/map-bridge';

const cartoApiKey = process.env.EXPO_PUBLIC_CARTO_API_KEY;
const html = getMapHtml(cartoApiKey);

export default function MapCanvas({
  places,
  selectedId,
  userLocation,
  friendLocation,
  meetMode,
  cameraCommand,
  topMatchIds,
  showMetro,
  orientation,
  onSelect,
  onMapClick,
}: MapCanvasProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const payload = useMemo(
    () => encodeMapPayload({ places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, chainColors, topMatchIds, showMetro, orientation }),
    [places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, topMatchIds, showMetro, orientation]
  );
  const send = useCallback(() => frame.current?.contentWindow?.postMessage(payload, '*'), [payload]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      const message = parseMapMessage(event.data);
      if (message?.type === 'ready') send();
      if (message?.type === 'select' && places.some(place => place.id === message.id)) void onSelect(message.id);
      if (message?.type === 'mapClick') onMapClick?.({ latitude: message.latitude, longitude: message.longitude });
    };
    window.addEventListener('message', receive);
    send();
    return () => window.removeEventListener('message', receive);
  }, [send, onSelect, onMapClick, places]);
  return <iframe ref={frame} title="Cafés in Barcelona" srcDoc={html} onLoad={send} style={{ width: '100%', height: '100%', border: 0, display: 'block', background: colors.cream }} />;
}
