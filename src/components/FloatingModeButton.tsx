import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { ViewMode } from '../types';

export type FloatingModeButtonProps = {
  mode: ViewMode;
  onToggle: () => void;
  visible?: boolean;
};

export function FloatingModeButton({ mode, onToggle, visible = true }: FloatingModeButtonProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const isMap = mode === 'map';
  const label = isMap ? 'List' : 'Map';
  const icon = isMap ? 'list-outline' : 'map-outline';

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: Math.max(insets.bottom, 16) + 16 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${label} view`}
        onPress={onToggle}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name={icon} size={18} color={colors.paper} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 90,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 22,
    borderRadius: 23,
    backgroundColor: colors.ink,
    boxShadow: '0 4px 14px rgba(23, 33, 27, 0.28)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'RobotoBold',
    fontSize: 14,
    color: colors.paper,
    letterSpacing: 0.2,
  },
});
