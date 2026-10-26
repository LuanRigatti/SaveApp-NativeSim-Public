import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';

import type { ProgressiveCollapsibleScrollContentProps } from '@/components/premium/ProgressiveCollapsibleScreen';
import { getHomeFolderRoute } from '@/features/home-folders/homeFolderNavigation';
import { getFolderAuthenticationFailureMessage } from '@/features/home-folders/folderFaceIdAuthentication';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import type { HomeFolder } from '@/features/home-folders/homeFolderTypes';
import { useAppTheme } from '@/theme';

type HomeFolderOverviewProps = Pick<
  ProgressiveCollapsibleScrollContentProps,
  'contentContainerStyle' | 'contentGap' | 'largeTitle' | 'onScroll' | 'showsVerticalScrollIndicator'
> & {
  folders: readonly HomeFolder[];
  isReady: boolean;
  hidden: boolean;
};

export function HomeFolderOverview({
  contentContainerStyle,
  contentGap,
  folders,
  hidden,
  isReady,
  largeTitle,
  onScroll,
  showsVerticalScrollIndicator,
}: HomeFolderOverviewProps) {
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const router = useRouter();
  const { authorizeFolder, isFolderAuthorized } = useLocalHomeFolders();
  const listRef = useRef<FlashListRef<HomeFolder> | null>(null);
  const listHeader = useMemo(() => <>{largeTitle}</>, [largeTitle]);
  const listHeaderStyle: StyleProp<ViewStyle> = useMemo(
    () => ({ marginBottom: contentGap }),
    [contentGap],
  );

  useEffect(() => {
    if (!hidden) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [hidden]);

  const renderFolder = useCallback(
    ({ item, index }: { item: HomeFolder; index: number }) => (
      <Pressable
        accessibilityLabel={item.isProtected
          ? `${item.name}, protegida com Face ID, abrir pasta`
          : `${item.name}, ${item.itemCount} ${item.itemCount === 1 ? 'item' : 'itens'}, abrir pasta`}
        accessibilityRole="button"
        onPress={() => {
          void (async () => {
            const outcome = await authorizeFolder(item.id);
            if (outcome === 'authenticated' && isFolderAuthorized(item.id)) {
              router.push(getHomeFolderRoute(item.id));
            } else if (outcome === 'unavailable' || outcome === 'failed') {
              Alert.alert('Pasta protegida', getFolderAuthenticationFailureMessage(outcome));
            }
          })();
        }}
        style={({ pressed }) => ({
          alignItems: 'center',
          borderBottomColor: theme.colors.separator,
          borderBottomWidth: index === folders.length - 1 ? 0 : StyleSheet.hairlineWidth,
          flexDirection: 'row',
          minHeight: theme.sizes.touchTargetMinimum + theme.spacing.xs,
          paddingHorizontal: theme.layout.screenHorizontalPadding,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Ionicons color={getHomeFolderAccentColor(item.color, accentColor, resolvedMode)} name="folder-outline" size={19} />
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[
            theme.typography.body,
            { color: theme.colors.textPrimary, flex: 1, marginLeft: theme.spacing.sm, minWidth: 0 },
          ]}
        >
          {item.name}
        </Text>
        {item.isProtected ? (
          <Ionicons
            accessibilityLabel="Protegida com Face ID"
            color={theme.colors.textSecondary}
            name="lock-closed-outline"
            size={16}
            style={{ marginLeft: theme.spacing.sm }}
          />
        ) : (
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textSecondary, marginLeft: theme.spacing.sm },
            ]}
          >
            {item.itemCount} {item.itemCount === 1 ? 'item' : 'itens'}
          </Text>
        )}
        <Ionicons
          color={theme.colors.textTertiary}
          name="chevron-forward"
          size={15}
          style={{ marginLeft: theme.spacing.sm }}
        />
      </Pressable>
    ),
    [accentColor, authorizeFolder, folders.length, isFolderAuthorized, resolvedMode, router, theme],
  );

  const emptyMessage = isReady ? (
    <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding, paddingVertical: theme.spacing.lg }}>
      <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
        Nenhuma pasta criada. Crie uma em Configurações.
      </Text>
    </View>
  ) : null;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => onScroll(event),
    [onScroll],
  );

  return (
    <FlashList
      contentContainerStyle={contentContainerStyle}
      data={folders}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={emptyMessage}
      ListHeaderComponent={listHeader}
      ListHeaderComponentStyle={listHeaderStyle}
      onScroll={handleScroll}
      ref={listRef}
      renderItem={renderFolder}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      style={{ display: hidden ? 'none' : 'flex', flex: 1 }}
    />
  );
}
