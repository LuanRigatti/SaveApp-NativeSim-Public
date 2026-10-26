import { Text, View } from 'react-native';

import { getSavedTextPresentation } from '@/features/home-content/savedTextPresentation';
import { useAppTheme } from '@/theme';

type SavedTextThumbnailProps = {
  borderRadius?: number;
  height: number;
  text: string;
  width: number;
};

export function SavedTextThumbnail({ borderRadius, height, text, width }: SavedTextThumbnailProps) {
  const { theme } = useAppTheme();
  const presentation = getSavedTextPresentation(text);
  const inset = Math.max(3, Math.round(Math.min(width, height) * 0.09));
  const cornerRadius = borderRadius ?? Math.min(theme.radius.md, Math.round(Math.min(width, height) * 0.18));
  const fontSize = Math.max(7, Math.min(10, width * 0.14));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.separator,
        borderRadius: cornerRadius,
        borderWidth: 0.5,
        flexShrink: 0,
        height,
        overflow: 'hidden',
        padding: inset,
        width,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: Math.max(2, cornerRadius * 0.55),
          flex: 1,
          justifyContent: 'center',
          overflow: 'hidden',
          padding: Math.max(2, inset * 0.55),
        }}
      >
        <Text
          numberOfLines={Math.max(3, Math.floor((height - inset * 2) / (fontSize * 1.2)))}
          style={{
            color: theme.colors.textSecondary,
            fontSize,
            lineHeight: fontSize * 1.2,
          }}
        >
          {presentation.thumbnailText}
        </Text>
      </View>
    </View>
  );
}
