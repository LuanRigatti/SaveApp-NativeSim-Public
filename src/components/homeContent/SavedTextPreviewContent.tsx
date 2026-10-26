import { StyleSheet, Text, View } from 'react-native';

import { getSavedTextPresentation } from '@/features/home-content/savedTextPresentation';
import { useAppTheme } from '@/theme';

const PREVIEW_TEXT_LINE_HEIGHT = 23;

type SavedTextPreviewContentProps = {
  height: number;
  text: string;
  width: number;
};

export function SavedTextPreviewContent({
  height,
  text,
  width,
}: SavedTextPreviewContentProps) {
  const { theme } = useAppTheme();
  const presentation = getSavedTextPresentation(text);
  const previewLineCount = Math.max(
    1,
    Math.floor((height - theme.spacing.lg * 2) / PREVIEW_TEXT_LINE_HEIGHT),
  );

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.separator,
        borderRadius: theme.radius.linkCard,
        borderWidth: StyleSheet.hairlineWidth,
        height,
        overflow: 'hidden',
        padding: theme.spacing.lg,
        width,
      }}
    >
      <Text
        ellipsizeMode="tail"
        numberOfLines={previewLineCount}
        style={[
          theme.typography.body,
          {
            color: theme.colors.textPrimary,
            lineHeight: PREVIEW_TEXT_LINE_HEIGHT,
            textAlignVertical: 'top',
          },
        ]}
      >
        {presentation.previewText}
      </Text>
    </View>
  );
}
