import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { Place } from '../types';
import { applyTypography } from '../typography';
import { DEFAULT_MAX_NOTE_LENGTH } from '../utils/notes';

export type NoteModalProps = {
  visible: boolean;
  place: Place | null;
  initialNote?: string;
  onClose: () => void;
  onSave: (text: string) => void;
  onDelete?: () => void;
};

const haptic = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
};

export function NoteModal({
  visible,
  place,
  initialNote = '',
  onClose,
  onSave,
  onDelete,
}: NoteModalProps) {
  const [text, setText] = useState(initialNote);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    if (visible) {
      setText(initialNote);
    }
  }, [visible, initialNote]);

  if (!place) return null;

  const handleSave = () => {
    haptic();
    Keyboard.dismiss();
    onSave(text);
  };

  const handleDelete = () => {
    haptic();
    Keyboard.dismiss();
    onDelete?.();
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const charsLeft = Math.max(0, DEFAULT_MAX_NOTE_LENGTH - text.length);
  const sheetHeight = Math.min(Math.max(windowHeight * 0.52, 380), windowHeight * 0.75);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <Pressable
          style={s.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close note editor"
          onPress={handleClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[s.sheet, { height: sheetHeight }]}
        >
          <View style={s.handleBar}>
            <View style={s.handle} />
          </View>
          <View style={s.header}>
            <View style={s.headerTitleWrap}>
              <Text style={s.headerEyebrow}>PERSONAL NOTE</Text>
              <Text numberOfLines={1} style={s.headerTitle}>
                {place.name}
              </Text>
              <Text numberOfLines={1} style={s.headerSubtitle}>
                {place.address}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close note editor"
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => [s.closeButton, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}
          >
            <TextInput
              accessible
              accessibilityLabel="Note text"
              placeholder="Wi-Fi password, quiet tables, outlets, coffee notes..."
              placeholderTextColor={colors.inkSoft}
              multiline
              autoFocus
              maxLength={DEFAULT_MAX_NOTE_LENGTH}
              value={text}
              onChangeText={setText}
              style={s.input}
              textAlignVertical="top"
            />
            {charsLeft < 200 && (
              <Text style={s.charCount}>
                {charsLeft} characters remaining
              </Text>
            )}
          </ScrollView>

          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            {initialNote ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete this note"
                onPress={handleDelete}
                style={({ pressed }) => [s.deleteButton, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
              >
                <Ionicons name="trash-outline" size={17} color={colors.tomato} />
                <Text style={s.deleteButtonText}>Delete</Text>
              </Pressable>
            ) : <View style={{ flex: 1 }} />}

            <View style={s.actionButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                onPress={handleClose}
                style={({ pressed }) => [s.cancelButton, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
              >
                <Text style={s.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save note"
                onPress={handleSave}
                style={({ pressed }) => [s.saveButton, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
              >
                <Text style={s.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = applyTypography(
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(23, 33, 27, 0.45)',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheet: {
      backgroundColor: colors.cream,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      boxShadow: '0 -4px 24px rgba(23, 33, 27, 0.15)',
      elevation: 16,
      overflow: 'hidden',
    },
    handleBar: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 4,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitleWrap: { flex: 1, marginRight: 12 },
    headerEyebrow: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: colors.tomato,
      marginBottom: 3,
    },
    headerTitle: {
      fontFamily: 'FrauncesBold',
      fontSize: 20,
      color: colors.ink,
      lineHeight: 26,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    closeButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.border,
    },
    body: { flexGrow: 1, padding: 16 },
    input: {
      flex: 1,
      minHeight: 110,
      backgroundColor: colors.paper,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      fontSize: 15,
      lineHeight: 21,
      color: colors.ink,
    },
    charCount: {
      fontSize: 11,
      color: colors.inkSoft,
      alignSelf: 'flex-end',
      marginTop: 6,
    },
    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.paper,
      gap: 12,
      rowGap: 10,
    },
    deleteButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    deleteButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.tomato,
    },
    actionButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    },
    cancelButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.cream,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink,
    },
    saveButton: {
      minHeight: 44,
      paddingHorizontal: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.honey,
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.ink,
    },
  })
);
