import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chainColors, colors, fallbackChainColor } from '../theme';
import type { Place } from '../types';
import { applyTypography } from '../typography';

type Props = { place: Place; distanceLabel: string | null; favorite: boolean; onPress: () => void; onDirections: () => void; onFavorite: () => void };
export function PlaceCard({ place, distanceLabel, favorite, onPress, onDirections, onFavorite }: Props) {
  const accent = chainColors[place.chain] ?? fallbackChainColor;
  return <View style={s.card}>
    <View style={[s.stripe, { backgroundColor: accent }]} />
    <View style={s.row}><View style={[s.dot, { backgroundColor: accent }]} /><Text style={s.chain}>{place.chain.toUpperCase()}{distanceLabel ? ` · ${distanceLabel}` : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel={favorite ? 'Remove from saved' : 'Save place'} accessibilityState={{ selected: favorite }} onPress={onFavorite} hitSlop={6} style={s.icon}><Ionicons name={favorite ? 'heart' : 'heart-outline'} size={25} color={favorite ? colors.tomato : colors.ink} /></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${place.name}`} onPress={onPress} style={({ pressed }) => [s.addressButton, pressed && { opacity: 0.6 }]}><Text numberOfLines={2} style={s.name}>{place.name}</Text><Text numberOfLines={2} style={s.address}>{place.address}</Text></Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel={`Get directions to ${place.name}`} onPress={onDirections} hitSlop={4} style={({ pressed }) => [s.route, pressed && { opacity: 0.65 }]}><Ionicons name="navigate" size={17} color={colors.ink} /><Text style={s.routeText}>Directions</Text></Pressable>
  </View>;
}
const s = applyTypography(StyleSheet.create({
  card: { padding: 14, paddingLeft: 22, backgroundColor: colors.paper, borderRadius: 24, marginBottom: 14, borderWidth: 1, borderColor: '#EFEBDD', overflow: 'hidden', boxShadow: '0 4px 7px #17211b26' },
  stripe: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 28 }, dot: { width: 8, height: 8, borderRadius: 4 },
  chain: { flex: 1, fontSize: 11, fontWeight: '700', color: colors.inkSoft }, icon: { width: 32, height: 32, marginRight: -2, marginTop: -4, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.cream },
  addressButton: { paddingTop: 7, paddingBottom: 10 }, name: { fontFamily: 'FrauncesBold', fontSize: 20, color: colors.ink, lineHeight: 26 }, address: { marginTop: 5, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
  route: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.honey }, routeText: { fontSize: 13, color: colors.ink, fontWeight: '700' },
}));
