import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chainColors, colors, fallbackChainColor } from '../theme';
import type { Place } from '../types';
import { applyTypography } from '../typography';

export type PlaceCardProps = {
  place: Place;
  distanceLabel: string | null;
  favorite: boolean;
  onPress: () => void;
  onDirections: () => void;
  onFavorite: () => void;
  matchBadge?: string | null;
  isBestMatch?: boolean;
  onShareFriend?: () => void;
  note?: string;
  onEditNote?: () => void;
};

export function PlaceCard({
  place,
  distanceLabel,
  favorite,
  onPress,
  onDirections,
  onFavorite,
  matchBadge,
  isBestMatch = false,
  onShareFriend,
  note,
  onEditNote,
}: PlaceCardProps) {
  const accent = chainColors[place.chain] ?? fallbackChainColor;
  return (
    <View style={s.card}>
      <View style={[s.stripe, { backgroundColor: accent }]} />
      <View style={s.row}>
        <View style={[s.dot, { backgroundColor: accent }]} />
        <Text style={s.chain}>
          {place.chain.toUpperCase()}{distanceLabel ? ` · ${distanceLabel}` : ''}
        </Text>
        {matchBadge ? (
          <View style={[s.matchBadge, isBestMatch ? s.matchBadgeBest : s.matchBadgeNeutral]}>
            <Text numberOfLines={1} style={[s.matchBadgeText, isBestMatch ? s.matchBadgeTextBest : s.matchBadgeTextNeutral]}>
              {matchBadge}
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Remove from saved' : 'Save place'}
          accessibilityState={{ selected: favorite }}
          onPress={onFavorite}
          hitSlop={6}
          style={s.icon}
        >
          <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={25} color={favorite ? colors.tomato : colors.ink} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${place.name}`}
        onPress={onPress}
        style={({ pressed }) => [s.addressButton, pressed && { opacity: 0.6 }]}
      >
        <Text numberOfLines={2} style={s.name}>{place.name}</Text>
        <Text numberOfLines={2} style={s.address}>{place.address}</Text>
      </Pressable>
      {note ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit note"
          onPress={onEditNote}
          style={({ pressed }) => [s.noteBox, pressed && { opacity: 0.7 }]}
        >
          <View style={s.noteHeader}>
            <Ionicons name="document-text-outline" size={13} color={colors.inkSoft} />
            <Text style={s.noteLabel}>YOUR NOTE</Text>
          </View>
          <Text numberOfLines={3} style={s.noteText}>{note}</Text>
        </Pressable>
      ) : null}
      <View style={s.actionsRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Get directions to ${place.name}`}
          onPress={onDirections}
          hitSlop={4}
          style={({ pressed }) => [s.route, pressed && { opacity: 0.65 }]}
        >
          <Ionicons name="navigate" size={17} color={colors.ink} />
          <Text style={s.routeText}>Directions</Text>
        </Pressable>
        {onShareFriend ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share directions to ${place.name} with friend`}
            onPress={onShareFriend}
            hitSlop={4}
            style={({ pressed }) => [s.shareFriend, pressed && { opacity: 0.65 }]}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.ink} />
          </Pressable>
        ) : null}
        {onEditNote && !note ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add note for this cafe"
            onPress={onEditNote}
            hitSlop={4}
            style={({ pressed }) => [s.addNoteButton, pressed && { opacity: 0.65 }]}
          >
            <Ionicons name="create-outline" size={15} color={colors.ink} />
            <Text style={s.addNoteText}>Add note</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = applyTypography(StyleSheet.create({
  card: { padding: 14, paddingLeft: 22, backgroundColor: colors.paper, borderRadius: 24, marginBottom: 14, borderWidth: 1, borderColor: '#EFEBDD', overflow: 'hidden', boxShadow: '0 4px 7px #17211b26' },
  stripe: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 28 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chain: { flex: 1, fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  matchBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  matchBadgeBest: { backgroundColor: colors.honey },
  matchBadgeNeutral: { backgroundColor: colors.border },
  matchBadgeText: { fontSize: 11, fontWeight: '700' },
  matchBadgeTextBest: { color: colors.ink },
  matchBadgeTextNeutral: { color: colors.inkSoft },
  icon: { width: 32, height: 32, marginRight: -2, marginTop: -4, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.cream },
  addressButton: { paddingTop: 7, paddingBottom: 10 },
  name: { fontFamily: 'FrauncesBold', fontSize: 20, color: colors.ink, lineHeight: 26 },
  address: { marginTop: 5, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
  noteBox: { backgroundColor: colors.cream, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  noteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.inkSoft },
  noteText: { fontSize: 13, lineHeight: 18, color: colors.ink },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  route: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.honey },
  routeText: { fontSize: 13, color: colors.ink, fontWeight: '700' },
  shareFriend: { width: 36, height: 36, borderRadius: 13, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  addNoteButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border },
  addNoteText: { fontSize: 13, color: colors.ink, fontWeight: '600' },
}));
