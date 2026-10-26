import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { HomeGridCardMetrics, HomeGridCardMode } from '@/features/home-content/homeViewMode';
import type { AccentColorName } from '@/theme/colors';
import HomeFolderIndicator from '@/features/home-folders/HomeFolderIndicator';
import { HomeTagDots } from '@/components/homeContent/HomeTagDots';
import type { SavedTagAssignment } from '@/features/home-tags/tagTypes';
import { useAppTheme, type ResolvedThemeMode } from '@/theme';

type HomeGridCardProps = {
  mode: HomeGridCardMode;
  metrics: HomeGridCardMetrics;
  title: string;
  detail?: string | null;
  metadata?: string | null;
  folderColor?: AccentColorName | null;
  folderName?: string | null;
  tagDots?: readonly SavedTagAssignment[];
  preview: ReactNode;
  glassColorScheme?: ResolvedThemeMode;
};

export function HomeGridCard({
  detail,
  folderColor = null,
  folderName,
  tagDots = [],
  glassColorScheme,
  metadata,
  metrics,
  mode,
  preview,
  title,
}: HomeGridCardProps) {
  const { theme } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const isCompact = mode === 'small';
  const titleStyle = isCompact ? theme.typography.subheadline : theme.typography.headline;
  const metadataAccessories = folderName || tagDots.length > 0 ? (
    <View style={{ alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: theme.spacing.xxs, maxWidth: '48%', minWidth: 0 }}>
      {folderName ? <HomeFolderIndicator folderColor={folderColor} maxWidth="100%" name={folderName} /> : null}
      <HomeTagDots tags={tagDots} />
    </View>
  ) : null;

  if (isCompact) {
    return (
      <View
        style={{
          alignItems: 'center',
          alignSelf: 'stretch',
          backgroundColor: glassColorScheme ? 'transparent' : theme.colors.surface,
          borderColor: theme.colors.separator,
          borderRadius: theme.radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          height: metrics.height,
          overflow: 'hidden',
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
          position: 'relative',
          width: '100%',
        }}
      >
        {glassColorScheme ? (
          <GlassView
            colorScheme={glassColorScheme}
            glassEffectStyle="regular"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.card }]}
          />
        ) : null}
        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.md,
            height: metrics.previewHeight,
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            width: metrics.previewHeight,
          }}
        >
          {preview}
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            minWidth: 0,
            overflow: 'hidden',
            paddingVertical: theme.spacing.xxs,
          }}
        >
          <View style={{ gap: theme.spacing.xxs, justifyContent: 'center', minWidth: 0 }}>
            <Text
              ellipsizeMode="tail"
              numberOfLines={2}
              style={[titleStyle, { color: theme.colors.textPrimary, flexShrink: 1, minWidth: 0 }]}
            >
              {title}
            </Text>
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                height: 14,
                justifyContent: 'space-between',
                minWidth: 0,
              }}
            >
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  theme.typography.caption,
                  {
                    color: theme.colors.textSecondary,
                    flex: 1,
                    fontSize: theme.typography.caption.fontSize - 1,
                    lineHeight: 14,
                    minWidth: 0,
                  },
                ]}
              >
                {metadata ?? ''}
              </Text>
              {metadataAccessories}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: 'stretch',
        backgroundColor: glassColorScheme ? 'transparent' : theme.colors.surface,
        borderColor: theme.colors.separator,
        borderRadius: theme.radius.card,
        borderWidth: StyleSheet.hairlineWidth,
        height: metrics.height,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceMuted,
          height: metrics.previewHeight,
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        {preview}
      </View>
      <View
        style={{
          gap: theme.spacing.xxs,
          height: metrics.contentHeight,
          justifyContent: 'center',
          paddingHorizontal: isCompact ? theme.spacing.xs : theme.spacing.sm,
          paddingVertical: theme.spacing.xxs,
          position: 'relative',
        }}
      >
        {glassColorScheme ? (
          <GlassView
            colorScheme={glassColorScheme}
            glassEffectStyle="regular"
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={{ gap: theme.spacing.xxs, minWidth: 0 }}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={[
              titleStyle,
              {
                color: theme.colors.textPrimary,
                flexShrink: 1,
                lineHeight: Math.ceil(theme.typography.headline.lineHeight * fontScale),
                minHeight: 0,
                minWidth: 0,
              },
            ]}
          >
            {title}
          </Text>
          {!isCompact && detail ? (
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[
                theme.typography.footnote,
                {
                  color: theme.colors.textSecondary,
                  flexShrink: 0,
                  lineHeight: Math.ceil(theme.typography.footnote.lineHeight * fontScale),
                  minWidth: 0,
                },
              ]}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            height: isCompact
              ? 14
              : Math.max(16, Math.ceil(theme.typography.caption.lineHeight * fontScale)),
            justifyContent: 'space-between',
            minWidth: 0,
          }}
        >
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[
              theme.typography.caption,
              {
                color: theme.colors.textSecondary,
                flex: 1,
                fontSize: isCompact ? theme.typography.caption.fontSize - 1 : undefined,
                lineHeight: isCompact
                  ? 14
                  : Math.ceil(theme.typography.caption.lineHeight * fontScale),
                minWidth: 0,
              },
            ]}
          >
            {metadata ?? ''}
          </Text>
          {metadataAccessories}
        </View>
      </View>
    </View>
  );
}
