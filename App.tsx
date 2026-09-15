import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Image, Keyboard, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MapCanvas from './src/components/MapCanvas';
import { PlaceCard } from './src/components/PlaceCard';
import placesJson from './src/data/places.json';
import { chainColors, colors, fallbackChainColor } from './src/theme';
import type { Coordinates, MapOrientation, Place, ViewMode } from './src/types';
import { distanceKm, formatDistance } from './src/utils/distance';
import { getDirectionsUrl } from './src/utils/directions';
import { LocationRequestError, type Provider, requestLocation, requestLocationIfGranted, withTimeout } from './src/utils/location-request';
import type { CameraCommand } from './src/utils/map-camera';
import { formatPlaceCount, matchesSearch, parseFavorites } from './src/utils/places';
import { requestBrowserLocation } from './src/utils/browser-location';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL } from './src/config';
import { applyTypography } from './src/typography';
import { rankEquidistantPlaces, type EquidistantMatch } from './src/utils/equidistant-ranking';

const places = placesJson as Place[];
const chains = Array.from(new Set(places.map(p => p.chain)));
const validIds = new Set(places.map(p => p.id));
const FAVORITES_KEY = 'workable-bcn:favorites:v1';
const ORIENTATION_KEY = 'workable-bcn:map-orientation:v1';
const haptic = () => { if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); };

function AppContent() {
  const [mode, setMode] = useState<ViewMode>('map');
  const [query, setQuery] = useState('');
  const [chain, setChain] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const locationPending = useRef(false);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const cameraSequence = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const mounted = useRef(true);
  const saveQueue = useRef(Promise.resolve());

  // Meet Halfway state
  const [meetMode, setMeetMode] = useState(false);
  const [friendLocation, setFriendLocation] = useState<Coordinates | null>(null);
  const [settingOrigin, setSettingOrigin] = useState<'you' | 'friend' | null>(null);
  const [showMetro, setShowMetro] = useState(false);
  const [orientation, setOrientation] = useState<MapOrientation>('north');

  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(FAVORITES_KEY)
      .then(value => { if (mounted.current) setFavorites(parseFavorites(value, validIds)); })
      .catch(() => { if (mounted.current) setNotice('Could not load saved places. Please restart the app.'); })
      .finally(() => { if (mounted.current) setLoaded(true); });
    AsyncStorage.getItem(ORIENTATION_KEY)
      .then(value => {
        if (mounted.current && (value === 'grid' || value === 'north')) {
          setOrientation(value);
        }
      })
      .catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  const baseFiltered = useMemo(() => {
    return places.filter(p => (mode !== 'saved' || favorites.has(p.id)) && (chain === 'All' || p.chain === chain) && matchesSearch(p, query));
  }, [mode, favorites, chain, query]);

  const equidistantMatches = useMemo(() => {
    if (!meetMode || !location || !friendLocation) return null;
    return rankEquidistantPlaces(baseFiltered, location, friendLocation);
  }, [meetMode, location, friendLocation, baseFiltered]);

  const topMatchIds = useMemo(() => {
    if (!meetMode || !location || !friendLocation || !equidistantMatches) return undefined;
    return equidistantMatches.slice(0, 3).map(m => m.place.id);
  }, [meetMode, location, friendLocation, equidistantMatches]);

  const equidistantMap = useMemo(() => {
    if (!equidistantMatches) return null;
    const map = new Map<string, EquidistantMatch>();
    for (const match of equidistantMatches) {
      map.set(match.place.id, match);
    }
    return map;
  }, [equidistantMatches]);

  const filtered = useMemo(() => {
    if (equidistantMatches) {
      return equidistantMatches.map(m => m.place);
    }
    return location ? [...baseFiltered].sort((a, b) => distanceKm(a, location)! - distanceKm(b, location)!) : baseFiltered;
  }, [equidistantMatches, location, baseFiltered]);

  const selected = filtered.find(p => p.id === selectedId) ?? null;
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedId) { setSelectedId(null); return true; }
      if (meetMode) {
        setMeetMode(false);
        setFriendLocation(null);
        setSettingOrigin(null);
        return true;
      }
      if (mode !== 'map') { setMode('map'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [selectedId, meetMode, mode]);

  const focus = useCallback((target: Coordinates) => {
    setCamera({ latitude: target.latitude, longitude: target.longitude, requestId: ++cameraSequence.current });
  }, []);
  const selectPlace = useCallback(async (id: string) => {
    const place = places.find(p => p.id === id);
    if (!place) return;
    Keyboard.dismiss();
    setSelectedId(id);
    setMode('map');
    focus(place);
    haptic();
  }, [focus]);

  const toggleFavorite = (id: string) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFavorites(next);
    // Serialize writes so a slow old write cannot undo a newer tap.
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])))
      .catch(() => { if (mounted.current) setNotice('Could not save your places on this device.'); });
    haptic();
  };
  const openDirections = (place: Place) => {
    void Linking.openURL(getDirectionsUrl(place))
      .catch(() => setNotice('Could not open directions. Check your maps app or browser.'));
  };
  const shareFriendDirections = useCallback((place: Place) => {
    if (!friendLocation) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${friendLocation.latitude},${friendLocation.longitude}&destination=${place.latitude},${place.longitude}`;
    void Share.share({
      message: `Directions to ${place.name}: ${url}`,
      url,
    }).catch(() => {});
  }, [friendLocation]);

  const locate = useCallback(async (centerMap = true, onlyIfGranted = false) => {
    if (locationPending.current) return;
    locationPending.current = true;
    setLocating(true);
    if (!onlyIfGranted) { setNotice(null); setShowSettings(false); Keyboard.dismiss(); }
    try {
      const provider: Provider = {
        permission: onlyIfGranted ? Location.getForegroundPermissionsAsync : Location.requestForegroundPermissionsAsync,
        servicesEnabled: Platform.OS === 'web' ? async () => true : Location.hasServicesEnabledAsync,
        lastKnown: Platform.OS === 'web' ? undefined : async () => {
          try {
            const loc = await Location.getLastKnownPositionAsync({ maxAge: 24 * 60 * 60 * 1000 });
            return loc ? { coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, timestamp: loc.timestamp } : null;
          } catch {
            return null;
          }
        },
        current: Platform.OS === 'web'
          ? async () => ({ coords: await requestBrowserLocation() })
          : async () => {
              try {
                return await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8000);
              } catch {
                return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
              }
            },
      };

      if (provider.lastKnown) {
        provider.lastKnown().then(fast => {
          if (mounted.current && fast?.coords) {
            setLocation(prev => prev ?? fast.coords);
            if (centerMap) { setSelectedId(null); setMode('map'); focus(fast.coords); }
          }
        }).catch(() => {});
      }

      const coords = await (onlyIfGranted ? requestLocationIfGranted(provider) : Platform.OS === 'web' ? requestBrowserLocation() : requestLocation(provider));
      if (!mounted.current || !coords) return;
      setLocation(coords);
      if (centerMap) { setSelectedId(null); setMode('map'); focus(coords); }
      if (!onlyIfGranted) haptic();
    } catch (error) {
      if (!mounted.current || onlyIfGranted) return;
      setNotice(error instanceof LocationRequestError ? error.message : 'Could not find your location. Check location access and try again.');
      setShowSettings(error instanceof LocationRequestError && error.settingsAvailable && Platform.OS !== 'web');
    } finally {
      locationPending.current = false;
      if (mounted.current) setLocating(false);
    }
  }, [focus]);
  useEffect(() => { void locate(false, true); }, [locate]);
  const resetFilters = () => { setQuery(''); setChain('All'); };

  const toggleMeetMode = () => {
    const next = !meetMode;
    setMeetMode(next);
    if (next) {
      setMode('map');
      setSelectedId(null);
      setSettingOrigin(!location ? 'you' : !friendLocation ? 'friend' : null);
    } else {
      setFriendLocation(null);
      setSettingOrigin(null);
    }
    haptic();
  };

  const toggleOrientation = useCallback(() => {
    const next: MapOrientation = orientation === 'north' ? 'grid' : 'north';
    setOrientation(next);
    haptic();
    void AsyncStorage.setItem(ORIENTATION_KEY, next).catch(() => {});
  }, [orientation]);

  const handleMapClick = useCallback((coords: Coordinates) => {
    if (!meetMode) return;
    if (settingOrigin === 'you') {
      setLocation(coords);
      setSettingOrigin(null);
      haptic();
    } else {
      setFriendLocation(coords);
      setSettingOrigin(null);
      haptic();
    }
  }, [meetMode, settingOrigin]);

  if (!loaded) return <View style={s.loading}><ActivityIndicator color={colors.tomato} /><Text style={s.secondary}>Opening the map…</Text></View>;

  return <SafeAreaView edges={['top', 'left', 'right']} style={s.root}>
    <StatusBar style="dark" />
    <View style={s.header}>
      <View style={s.titleRow}>
        <View style={s.brandRow}><Text style={s.eyebrow}>FIND YOUR SPOT</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={s.brand}>Workable BCN</Text></View>
        <View style={s.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={meetMode ? 'Exit Meet halfway mode' : 'Meet halfway with a friend'}
            accessibilityState={{ selected: meetMode }}
            onPress={toggleMeetMode}
            style={[s.meetToggle, meetMode && s.meetToggleActive]}
          >
            <Ionicons name="people" size={16} color={colors.ink} />
            <Text style={[s.meetToggleText, meetMode && s.meetToggleTextActive]}>Meet</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="About this app and its data" onPress={() => setAbout(true)} style={s.countBadge}><Text style={s.countNumber}>{filtered.length}</Text><Text style={s.countLabel}>places</Text></Pressable>
        </View>
      </View>
      <View style={s.search}>
        <Ionicons name="search-outline" size={20} color={colors.inkSoft} />
        <TextInput accessibilityLabel="Search places" value={query} onChangeText={setQuery} placeholder="Café, street or neighbourhood" placeholderTextColor={colors.inkSoft} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={s.input} />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={s.iconButton}><Ionicons name="close-circle" size={20} color={colors.inkSoft} /></Pressable>}
      </View>
    </View>
    <View style={s.filterWrap}><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.filters}>
      {['All', ...chains].map(name => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: chain === name }} onPress={() => { setChain(name); setSelectedId(null); haptic(); }} style={[s.chip, chain === name && s.chipActive]}>
        {name !== 'All' && <View style={[s.dot, { backgroundColor: chainColors[name] ?? fallbackChainColor }]} />}
        <Text style={[s.chipText, chain === name && s.chipTextActive]}>{name}</Text>
      </Pressable>)}
    </ScrollView></View>
    {meetMode ? (
      <View style={s.meetBar}>
        <View style={s.meetBarContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set your location"
            onPress={() => {
              setSettingOrigin(settingOrigin === 'you' ? null : 'you');
              setMode('map');
              haptic();
            }}
            style={[s.meetPill, settingOrigin === 'you' && s.meetPillActive]}
          >
            <Ionicons name="person" size={14} color={settingOrigin === 'you' ? colors.tomato : colors.ink} />
            <View style={s.meetPillTextWrap}>
              <Text style={s.meetPillTitle}>You</Text>
              <Text numberOfLines={1} style={[s.meetPillSubtitle, settingOrigin === 'you' && s.meetPillSubtitlePrompt]}>
                {settingOrigin === 'you' ? 'Tap map to set' : location ? 'Location set' : 'Set your pin'}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set friend location"
            onPress={() => {
              setSettingOrigin(settingOrigin === 'friend' ? null : 'friend');
              setMode('map');
              haptic();
            }}
            style={[s.meetPill, (settingOrigin === 'friend' || (!friendLocation && settingOrigin !== 'you')) && s.meetPillActive]}
          >
            <Ionicons name="people" size={15} color={friendLocation ? '#8166C8' : colors.ink} />
            <View style={s.meetPillTextWrap}>
              <Text style={s.meetPillTitle}>Friend</Text>
              <Text numberOfLines={1} style={[s.meetPillSubtitle, !friendLocation && s.meetPillSubtitlePrompt]}>
                {friendLocation ? 'Friend pin set' : 'Tap map to set'}
              </Text>
            </View>
            {friendLocation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear friend pin"
                hitSlop={8}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  setFriendLocation(null);
                  setSettingOrigin('friend');
                  haptic();
                }}
                style={s.meetClearPill}
              >
                <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
              </Pressable>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit Meet mode"
            hitSlop={6}
            onPress={() => {
              setMeetMode(false);
              setFriendLocation(null);
              setSettingOrigin(null);
              haptic();
            }}
            style={s.meetCloseButton}
          >
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        </View>
        {location && friendLocation && distanceKm(location, friendLocation)! > 35 ? (
          <View style={s.meetFarNotice}>
            <Ionicons name="information-circle-outline" size={14} color={colors.inkSoft} />
            <Text style={s.meetFarNoticeText}>
              Points are far apart. Showing the best compromise in the metropolitan area
            </Text>
          </View>
        ) : null}
      </View>
    ) : null}
    {notice && <View accessibilityLiveRegion="polite" style={s.notice}><View style={{ flex: 1 }}><Text selectable style={s.noticeText}>{notice}</Text>{showSettings && <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings().catch(() => setNotice('Open device Settings → Apps → Workable BCN → Permissions.'))}><Text style={s.settings}>Open settings</Text></Pressable>}</View><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setNotice(null)} style={s.iconButton}><Ionicons name="close" size={20} color={colors.ink} /></Pressable></View>}
    <View style={s.content}>
      {mode === 'map' ? <View style={s.map}>
        <MapCanvas
          places={filtered}
          selectedId={selectedId}
          userLocation={location}
          friendLocation={friendLocation}
          meetMode={meetMode}
          cameraCommand={camera}
          topMatchIds={topMatchIds}
          showMetro={showMetro}
          orientation={orientation}
          onSelect={selectPlace}
          onMapClick={handleMapClick}
        />
        <View style={s.mapControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={orientation === 'grid' ? 'Reset map orientation to North' : 'Rotate map to Barcelona grid'}
            accessibilityState={{ selected: orientation === 'grid' }}
            onPress={toggleOrientation}
            style={[s.mapButton, orientation === 'grid' && s.mapButtonActive]}
          >
            <View style={{ transform: [{ rotate: orientation === 'grid' ? '45deg' : '0deg' }] }}>
              <Ionicons
                name="compass-outline"
                size={24}
                color={orientation === 'grid' ? colors.tomato : colors.ink}
              />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showMetro ? 'Hide metro lines' : 'Show metro lines'}
            accessibilityState={{ selected: showMetro }}
            onPress={() => { setShowMetro(v => !v); haptic(); }}
            style={[s.mapButton, showMetro && s.mapButtonActive]}
          >
            <Ionicons name="subway-outline" size={22} color={showMetro ? colors.ink : colors.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Return to my location" accessibilityState={{ busy: locating, disabled: locating }} disabled={locating} onPress={() => void locate()} style={s.mapButton}>{locating ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="locate-outline" size={24} color={colors.ink} />}</Pressable>
        </View>
        {selected ? <View style={s.selected}>
          <View style={s.sheetHeader}><Text style={s.sheetLabel}>SELECTED PLACE</Text><Pressable accessibilityRole="button" accessibilityLabel="Close place details" onPress={() => setSelectedId(null)} style={s.iconButton}><Ionicons name="close" size={22} color={colors.inkSoft} /></Pressable></View>
          <PlaceCard
            place={selected}
            favorite={favorites.has(selected.id)}
            distanceLabel={equidistantMap?.get(selected.id)?.badgeLabel ?? formatDistance(distanceKm(selected, location))}
            matchBadge={equidistantMap?.get(selected.id)?.matchTag}
            isBestMatch={equidistantMap?.get(selected.id)?.isBestMatch}
            onPress={() => openDirections(selected)}
            onDirections={() => openDirections(selected)}
            onFavorite={() => toggleFavorite(selected.id)}
            onShareFriend={meetMode && friendLocation ? () => shareFriendDirections(selected) : undefined}
          />
        </View> : <View style={s.mapSummary}><View style={s.handle} /><View style={s.summaryRow}><View style={{ flex: 1 }}><Text style={s.summaryTitle}>{meetMode && location && friendLocation ? (filtered.length ? `${formatPlaceCount(filtered.length)} ranked by travel time` : 'No places found') : (filtered.length ? `${formatPlaceCount(filtered.length)} on the map` : 'No places found')}</Text><Text style={s.secondary}>{meetMode ? (!location ? 'Tap map to set your location pin' : !friendLocation ? "Tap map to set your friend's pin" : 'Sorted by balanced travel time for both') : (filtered.length ? 'Tap a pin to explore a café' : 'Try a different street or chain')}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={filtered.length ? 'Open the list of places' : 'Reset filters'} onPress={() => filtered.length ? setMode('list') : resetFilters()} style={s.roundButton}><Ionicons name={filtered.length ? 'list-outline' : 'refresh-outline'} size={23} color={colors.ink} /></Pressable></View></View>}
      </View> : <FlatList data={filtered} keyExtractor={p => p.id} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={[s.list, !filtered.length && { flexGrow: 1 }]} initialNumToRender={12}
        ListHeaderComponent={filtered.length ? <View style={s.listHeaderRow}><View style={s.listHeading}><Text style={s.heading}>{mode === 'saved' ? 'Your favourites' : 'All places'}</Text><Text style={s.secondary}>{formatPlaceCount(filtered.length)}{meetMode && location && friendLocation ? ' · ranked by travel time' : (location ? ' · nearest first' : '')}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={location ? 'Refresh distances' : 'Show distances'} accessibilityState={{ busy: locating, disabled: locating }} disabled={locating} onPress={() => void locate(false)} style={s.iconButton}>{locating ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="locate-outline" size={22} color={colors.ink} />}</Pressable></View> : null}
        ListEmptyComponent={<View style={s.empty}><View style={s.emptyIcon}><Ionicons name={mode === 'saved' ? 'heart-outline' : 'search-outline'} size={28} color={colors.ink} /></View><Text style={[s.heading, s.emptyHeading]}>{mode === 'saved' && !favorites.size ? 'Nothing saved yet' : 'No matching places'}</Text><Text style={s.emptyCopy}>{mode === 'saved' && !favorites.size ? 'Tap the heart on a café to keep it here.' : 'Try another search or reset the filters.'}</Text>{(query || chain !== 'All') && <Pressable accessibilityRole="button" onPress={resetFilters} style={s.reset}><Text style={s.settings}>Reset filters</Text></Pressable>}</View>}
        renderItem={({ item }) => {
          const match = equidistantMap?.get(item.id);
          return <PlaceCard
            place={item}
            favorite={favorites.has(item.id)}
            distanceLabel={match?.badgeLabel ?? formatDistance(distanceKm(item, location))}
            matchBadge={match?.matchTag}
            isBestMatch={match?.isBestMatch}
            onPress={() => void selectPlace(item.id)}
            onDirections={() => openDirections(item)}
            onFavorite={() => toggleFavorite(item.id)}
            onShareFriend={meetMode && friendLocation ? () => shareFriendDirections(item) : undefined}
          />;
        }}
      />}
    </View>
    <SafeAreaView edges={['bottom']} style={s.navSafe}><View style={s.nav}>
      {([['map', 'map-outline', 'map-outline', 'Map'], ['list', 'list-outline', 'list', 'List'], ['saved', 'heart-outline', 'heart', 'Favourites']] as const).map(([key, icon, activeIcon, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: mode === key }} onPress={() => { setMode(key); setSelectedId(null); Keyboard.dismiss(); haptic(); }} style={s.navItem}><View style={[s.navIcon, mode === key && s.navIconActive]}><Ionicons name={mode === key ? activeIcon : icon} size={25} color={mode === key ? colors.ink : colors.inkSoft} />{key === 'saved' && favorites.size > 0 ? <View style={s.favoriteBadge}><Text style={s.favoriteCount}>{favorites.size}</Text></View> : null}</View><Text style={[s.navLabel, mode === key && { color: colors.ink, fontFamily: 'RobotoBold' }]}>{label}</Text></Pressable>)}
    </View></SafeAreaView>
    <Modal visible={about} animationType="slide" onRequestClose={() => setAbout(false)}>
      <SafeAreaView style={s.root}><View style={s.aboutHeader}><Text style={s.heading}>About Workable BCN</Text><Pressable accessibilityRole="button" accessibilityLabel="Close about" onPress={() => setAbout(false)} style={s.iconButton}><Ionicons name="close" size={24} /></Pressable></View><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.aboutContent}>
        <View><Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => { setAbout(false); setNotice('Could not open the privacy policy. Please try again.'); })}><Text style={s.settings}>Privacy policy ↗</Text></Pressable><Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => { setAbout(false); setNotice(`Please email ${SUPPORT_EMAIL} using your mail app.`); })}><Text style={s.settings}>Support · {SUPPORT_EMAIL}</Text></Pressable></View>
        <Image source={require('./assets/workable-icon.png')} style={s.brandIcon} accessibilityIgnoresInvertColors /><Text selectable style={s.heading}>Coffee. City. Your places.</Text><Text selectable style={s.aboutText}>An independent guide to cafés in Barcelona and nearby towns. We are not affiliated with the featured chains. Check opening hours, Wi-Fi and laptop policies before visiting.</Text>
        <Text style={s.heading}>Privacy</Text><Text selectable style={s.aboutText}>Location access is requested when you use a location button. If you already allowed access, the app gets your current location at startup to show distances. Location buttons refresh distances or centre the map. We do not save a location history or track you in the background. Saved places stay on your device. There are no accounts, ads or analytics.</Text>
        <Text selectable style={s.aboutText}>The map requests tiles from CARTO and OpenStreetMap, which receives your IP address and the area you are viewing. After centring on your location, that area may reveal your location. Directions open Google Maps with the selected café as the destination. These services process requests under their own privacy policies.</Text>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://carto.com/privacy').catch(() => setNotice('Could not open the link. Please try again.'))}><Text style={s.settings}>CARTO privacy policy ↗</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://osmfoundation.org/wiki/Privacy_Policy').catch(() => setNotice('Could not open the link. Please try again.'))}><Text style={s.settings}>OpenStreetMap privacy policy ↗</Text></Pressable>
        <Text style={s.secondary}>Workable BCN · 1.0.0</Text>
      </ScrollView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    FrauncesBold: require('./assets/fonts/Fraunces-Bold.ttf'), FrauncesSemiBold: require('./assets/fonts/Fraunces-SemiBold.ttf'),
    RobotoRegular: require('./assets/fonts/Roboto-Regular.ttf'), RobotoMedium: require('./assets/fonts/Roboto-Medium.ttf'),
    RobotoSemiBold: require('./assets/fonts/Roboto-SemiBold.ttf'), RobotoBold: require('./assets/fonts/Roboto-Bold.ttf'),
  });
  return <SafeAreaProvider>{fontsLoaded || fontError ? <AppContent /> : <View style={s.loading}><ActivityIndicator color={colors.ink} /></View>}</SafeAreaProvider>;
}

const s = applyTypography(StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.cream },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  brandRow: { gap: 7, flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meetToggle: { minHeight: 44, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  meetToggleActive: { backgroundColor: colors.honey, borderColor: colors.honey },
  meetToggleText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  meetToggleTextActive: { fontWeight: '700', color: colors.ink },
  brandIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tomato, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: 'FrauncesSemiBold', fontSize: 32, letterSpacing: -0.8, color: colors.ink },
  eyebrow: { fontSize: 10, fontWeight: '600', letterSpacing: 2, color: colors.tomato },
  countBadge: { width: 58, height: 58, backgroundColor: colors.honey, borderRadius: 20, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '4deg' }] },
  countNumber: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: colors.ink }, countLabel: { fontSize: 10, fontWeight: '500', color: colors.inkSoft },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  search: { marginTop: 18, minHeight: 48, paddingLeft: 14, paddingRight: 4, gap: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 15, color: colors.ink },
  filterWrap: { paddingBottom: 12 },
  filters: { gap: 8, paddingHorizontal: 18 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, flexDirection: 'row', gap: 7, alignItems: 'center' },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' }, dot: { width: 7, height: 7, borderRadius: 4 },
  meetBar: { paddingHorizontal: 18, paddingBottom: 10 },
  meetBarContent: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.paper, borderRadius: 18, padding: 8, borderWidth: 1, borderColor: colors.border, boxShadow: '0 2px 8px #17211b14' },
  meetPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border },
  meetPillActive: { borderColor: colors.honey, backgroundColor: colors.honeyLight },
  meetPillTextWrap: { flex: 1 },
  meetPillTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.inkSoft },
  meetPillSubtitle: { fontSize: 12, fontWeight: '600', color: colors.ink },
  meetPillSubtitlePrompt: { color: colors.tomato, fontWeight: '700' },
  meetClearPill: { padding: 2 },
  meetCloseButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  meetFarNotice: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: colors.honeyLight, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  meetFarNoticeText: { flex: 1, fontSize: 11, lineHeight: 15, color: colors.inkSoft, fontWeight: '500' },
  content: { flex: 1 }, map: { flex: 1 },
  mapControls: { position: 'absolute', top: 16, right: 16, gap: 10 },
  mapButton: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, boxShadow: '0 2px 10px #00000018' },
  mapButtonActive: { backgroundColor: colors.honey },
  locate: { position: 'absolute', top: 16, right: 16, width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, boxShadow: '0 2px 10px #00000018' },
  mapSummary: { position: 'absolute', bottom: 24, left: 12, right: 12, padding: 16, paddingTop: 10, borderRadius: 20, backgroundColor: colors.paper, boxShadow: '0 2px 16px #00000012' },
  handle: { alignSelf: 'center', width: 28, height: 3, backgroundColor: colors.border, borderRadius: 2, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  summaryTitle: { fontWeight: '700', color: colors.ink, fontSize: 17, marginBottom: 5 },
  secondary: { color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  roundButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.honey, alignItems: 'center', justifyContent: 'center' },
  selected: { position: 'absolute', bottom: 24, left: 12, right: 12, borderRadius: 20, backgroundColor: colors.paper, overflow: 'hidden', boxShadow: '0 2px 16px #00000018' },
  sheetHeader: { paddingLeft: 18, paddingRight: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sheetLabel: { fontSize: 10, letterSpacing: 1, fontWeight: '600', color: colors.inkSoft },
  list: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.listBackground }, listHeading: { paddingTop: 22, paddingBottom: 16, gap: 6 },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 }, emptyCopy: { color: colors.inkSoft, textAlign: 'center', lineHeight: 22 }, reset: { padding: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.honey, alignItems: 'center', justifyContent: 'center', marginBottom: 8, transform: [{ rotate: '-5deg' }] },
  emptyHeading: { textAlign: 'center', fontSize: 21, lineHeight: 27 },
  navSafe: { backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.border },
  nav: { minHeight: 70, flexDirection: 'row', paddingHorizontal: 16 }, navItem: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navIcon: { width: 42, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, navIconActive: { backgroundColor: colors.honey }, navLabel: { fontSize: 11, color: colors.inkSoft },
  favoriteBadge: { position: 'absolute', right: -3, top: -3, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.tomato, alignItems: 'center', justifyContent: 'center' }, favoriteCount: { fontSize: 9, fontWeight: '700', color: colors.white },
  notice: { backgroundColor: '#F4EBD8', paddingLeft: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }, noticeText: { fontSize: 13, lineHeight: 19, color: colors.ink }, settings: { color: colors.tomato, fontWeight: '600', fontSize: 14, paddingVertical: 8 },
  aboutHeader: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, aboutContent: { padding: 24, gap: 20 }, aboutText: { fontSize: 15, lineHeight: 24, color: colors.inkSoft },
}));
