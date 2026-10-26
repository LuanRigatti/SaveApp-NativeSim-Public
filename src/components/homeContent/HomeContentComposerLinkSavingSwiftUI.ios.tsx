import { HStack, Host, ProgressView, Text, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  font,
  foregroundStyle,
  frame,
  padding,
  shadow,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { useAppTheme } from '@/theme';

export default function HomeContentComposerLinkSavingSwiftUI() {
  const { resolvedMode, theme } = useAppTheme();

  return (
    <Host
      colorScheme={resolvedMode}
      ignoreSafeArea="container"
      matchContents={false}
      pointerEvents="none"
      seedColor={theme.colors.info}
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
      useViewportSizeMeasurement
    >
      <ZStack modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
        <HStack
          alignment="center"
          spacing={theme.spacing.md}
          modifiers={[
            padding({ horizontal: theme.spacing.lg, vertical: theme.spacing.md }),
            background(
              { type: 'material', material: 'regular' },
              shapes.capsule({ roundedCornerStyle: 'continuous' }),
            ),
            shadow({ radius: 18, y: 8, color: '#00000024' }),
          ]}
        >
          <ProgressView modifiers={[tint(theme.colors.info)]} />
          <Text
            modifiers={[
              font({ textStyle: 'subheadline', weight: 'medium' }),
              foregroundStyle(theme.colors.textPrimary),
            ]}
          >
            Salvando link…
          </Text>
        </HStack>
      </ZStack>
    </Host>
  );
}
