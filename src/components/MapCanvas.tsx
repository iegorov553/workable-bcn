import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getMapHtml } from '../map/map-html';
import { chainColors } from '../theme';
import type { Coordinates } from '../types';
import { encodeMapPayload, mapUpdateScript, parseMapMessage, type MapPayload } from '../utils/map-bridge';

export type MapCanvasProps = MapPayload & {
  onSelect: (id: string) => Promise<void> | void;
  onMapClick?: (coords: Coordinates) => void;
};
const cartoApiKey = process.env.EXPO_PUBLIC_CARTO_API_KEY;
const source = { html: getMapHtml(cartoApiKey) };

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
  const webview = useRef<WebView>(null);
  const ready = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const payload = useMemo(
    () => encodeMapPayload({ places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, chainColors, topMatchIds, showMetro, orientation }),
    [places, selectedId, userLocation, friendLocation, meetMode, cameraCommand, topMatchIds, showMetro, orientation]
  );
  const latest = useRef(payload);
  latest.current = payload;
  const send = useCallback(() => webview.current?.injectJavaScript(mapUpdateScript(latest.current)), []);
  useEffect(() => { if (ready.current) send(); }, [payload, send]);
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(timeout);
  }, [loading, generation]);
  const retry = () => { ready.current = false; setFailed(false); setLoading(true); setGeneration(value => value + 1); };

  return <View style={styles.root}>
    <WebView key={generation} ref={webview} source={source} style={styles.root}
      originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} setSupportMultipleWindows={false}
      onLoadStart={() => { ready.current = false; }}
      onLoadEnd={() => { ready.current = true; send(); }}
      onError={() => setFailed(true)} onRenderProcessGone={() => setFailed(true)} onContentProcessDidTerminate={() => setFailed(true)}
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'about:blank' || request.url.startsWith('about:blank#')) return true;
        if (request.url.startsWith('https://www.openstreetmap.org/') || request.url.startsWith('https://carto.com') || request.url === 'https://leafletjs.com' || request.url === 'https://leafletjs.com/') void Linking.openURL(request.url).catch(() => {});
        return false;
      }}
      onMessage={event => {
        const message = parseMapMessage(event.nativeEvent.data);
        if (message?.type === 'ready') { ready.current = true; send(); }
        if (message?.type === 'updated') { setLoading(false); setFailed(false); }
        if (message?.type === 'error') setFailed(true);
        if (message?.type === 'select' && places.some(place => place.id === message.id)) void onSelect(message.id);
        if (message?.type === 'mapClick') onMapClick?.({ latitude: message.latitude, longitude: message.longitude });
      }}
    />
    {loading && !failed ? <View pointerEvents="none" style={styles.overlay}><ActivityIndicator color="#214D3F" /><Text>Loading map…</Text></View> : null}
    {failed ? <View style={styles.overlay}><Text style={styles.message}>The map could not start. Your places are still available in the list.</Text><Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text>Retry map</Text></Pressable></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f1ec' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f0f1ec', padding: 28 },
  message: { textAlign: 'center', color: '#202820' },
  retry: { padding: 14, borderRadius: 12, backgroundColor: '#E4EDE5' },
});
