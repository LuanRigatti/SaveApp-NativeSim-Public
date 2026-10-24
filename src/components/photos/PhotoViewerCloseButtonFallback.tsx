import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView } from 'expo-glass-effect';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme';

import type { PhotoViewerCloseButtonProps } from './PhotoViewerCloseButton.types';

const PHOTO_VIEWER_CLOSE_BUTTON_SIZE = 50;

type PhotoViewerCloseButtonFallbackProps = PhotoViewerCloseButtonProps & {
  glassAvailable?: boolean;
};

export default function PhotoViewerCloseButtonFallback({
  glassAvailable = false,
  onPress,
  style,
}: PhotoViewerCloseButtonFallbackProps) {
  const { resolvedMode, theme } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel="Fechar foto"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          borderRadius: PHOTO_VIEWER_CLOSE_BUTTON_SIZE / 2,
          height: PHOTO_VIEWER_CLOSE_BUTTON_SIZE,
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: pressed ? 0.76 : 1,
          width: PHOTO_VIEWER_CLOSE_BUTTON_SIZE,
        },
        style,
      ]}
    >
      {glassAvailable ? (
        <GlassView
          colorScheme={resolvedMode}
          glassEffectStyle="regular"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: PHOTO_VIEWER_CLOSE_BUTTON_SIZE / 2 }]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.separator,
              borderRadius: PHOTO_VIEWER_CLOSE_BUTTON_SIZE / 2,
              borderWidth: StyleSheet.hairlineWidth,
            },
          ]}
        />
      )}
      <Ionicons color={theme.colors.textPrimary} name="close" size={24} />
    </Pressable>
  );
}
