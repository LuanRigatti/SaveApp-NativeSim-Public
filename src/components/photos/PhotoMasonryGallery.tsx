import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { GlassView } from 'expo-glass-effect';
import { Link, type Href } from 'expo-router';
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  AppState,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type PressableProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import type { ProgressiveCollapsibleScrollContentProps } from '@/components/premium/ProgressiveCollapsibleScreen';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import {
  getHomeGalleryEntrySpan,
  getHomeListMetrics,
  getHomeViewLayout,
} from '@/features/home-content/homeViewMode';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { buildHomeGalleryEntries } from '@/features/home-content/homeFeed';
import type { HomeGalleryEntry, SavedHomeContent } from '@/features/home-content/homeContentTypes';
import { getLinkPreviewSize } from '@/features/home-content/linkPreviewLayout';
import { getSavedLinkPresentation } from '@/features/home-content/savedLinkPresentation';
import { SavedLinkPreviewContent } from '@/components/homeContent/SavedLinkPreviewContent';
import { formatVideoDuration } from '@/features/photos/videoDuration';
import { getPhotoPreviewSize } from '@/features/photos/photoPreviewLayout';
import { getPhotoDisplayTitle, getPhotoSavedDateLabel } from '@/features/photos/photoTitle';
import type { SavedMedia } from '@/features/photos/photoTypes';
import {
  useAppTheme,
  useVisualCapabilities,
  type AppTheme,
} from '@/theme';
import { triggerSelectionHaptic } from '@/utils/haptics';

// Set false to restore the direct Link rendering used before native media menus.
const NATIVE_PHOTO_CONTEXT_MENU_ENABLED = true;
// Disable only the link-card material to compare with its solid fallback.
const LINK_CARD_LIQUID_GLASS_ENABLED = true;
const LIST_THUMBNAIL_IMAGE_RADIUS = 14;

function getListRowLayoutStyle(theme: AppTheme, rowHeight: number, isCompact: boolean): ViewStyle {
  return {
    alignSelf: 'stretch',
    height: rowHeight,
    marginBottom: isCompact ? theme.spacing.xxs : theme.spacing.xs,
    marginHorizontal: theme.spacing.xxs,
  };
}

const AnimatedNativePressable = Animated.createAnimatedComponent(Pressable);

type LinkCardPressableProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const LinkCardPressable = forwardRef<ComponentRef<typeof Pressable>, LinkCardPressableProps>(
  function LinkCardPressable({ children, onPress, onPressIn, onPressOut, style, ...props }, ref) {
    const { reduceMotionEnabled, theme } = useAppTheme();
    const pressProgress = useSharedValue(0);
    const pressScaleStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: 1 + (theme.animations.scale.subtle - 1) * pressProgress.value },
      ],
    }));
    const pressHighlightStyle = useAnimatedStyle(() => ({
      opacity: pressProgress.value * 0.3,
    }));

    const animatePress = (pressed: boolean) => {
      if (reduceMotionEnabled) {
        pressProgress.set(0);
        return;
      }

      pressProgress.set(withSpring(pressed ? 1 : 0, theme.animations.spring.responsive));
    };

    return (
      <AnimatedNativePressable
        {...props}
        ref={ref}
        onPress={(event) => {
          triggerSelectionHaptic();
          onPress?.(event);
        }}
        onPressIn={(event) => {
          animatePress(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animatePress(false);
          onPressOut?.(event);
        }}
        style={[style, pressScaleStyle]}
      >
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderColor: theme.colors.focus,
              borderRadius: theme.radius.linkCard,
              borderWidth: StyleSheet.hairlineWidth,
            },
            pressHighlightStyle,
          ]}
        />
      </AnimatedNativePressable>
    );
  },
);

type PhotoMasonryGalleryProps = Pick<
  ProgressiveCollapsibleScrollContentProps,
  'contentContainerStyle' | 'contentGap' | 'largeTitle' | 'onScroll' | 'showsVerticalScrollIndicator'
> & {
  media: SavedMedia[];
  contents: SavedHomeContent[];
};

export function PhotoMasonryGallery({
  contentContainerStyle,
  contentGap,
  largeTitle,
  media,
  contents,
  onScroll,
  showsVerticalScrollIndicator,
}: PhotoMasonryGalleryProps) {
  const { reduceMotionEnabled, resolvedMode, theme } = useAppTheme();
  const { viewMode } = useHomeViewMode();
  const viewLayout = getHomeViewLayout(viewMode);
  const isListView = viewMode === 'list' || viewMode === 'compact-list';
  const isCompactListView = viewMode === 'compact-list';
  const isCompactMasonry = viewMode === 'small';
  const { useGlass } = useVisualCapabilities();
  const useLinkCardGlass = LINK_CARD_LIQUID_GLASS_ENABLED && useGlass;
  const { requestDeleteMedia, requestRenamePhoto } = useLocalPhotoLibrary();
  const { requestDeleteContent } = useLocalSavedContent();
  const listRef = useRef<FlashListRef<HomeGalleryEntry> | null>(null);
  const scrollOffsetRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const previousViewModeRef = useRef(viewMode);
  const { fontScale, height: screenHeight, width: screenWidth } = useWindowDimensions();
  const listMetrics = getHomeListMetrics(viewMode, fontScale);
  const listRowHeight = listMetrics.rowHeight;
  const listThumbnailSize = listMetrics.thumbnailSize;
  const supportsAppleZoom = Platform.OS === 'ios' && Number(Platform.Version) >= 18;
  const supportsNativeContextMenu = Platform.OS === 'ios' && NATIVE_PHOTO_CONTEXT_MENU_ENABLED;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refreshDate = () => setNow(new Date());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDate();
    });
    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleMidnightRefresh = () => {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 250);
      midnightTimer = setTimeout(() => {
        refreshDate();
        scheduleMidnightRefresh();
      }, Math.max(1, nextMidnight.getTime() - Date.now()));
    };
    scheduleMidnightRefresh();

    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);

  const listHeader = useMemo(() => <>{largeTitle}</>, [largeTitle]);
  const entries = useMemo(() => buildHomeGalleryEntries([...media, ...contents], now), [contents, media, now]);

  useLayoutEffect(() => {
    if (previousViewModeRef.current !== viewMode) {
      pendingScrollRestoreRef.current = scrollOffsetRef.current;
      previousViewModeRef.current = viewMode;
    }
  }, [viewMode]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      onScroll(event);
    },
    [onScroll],
  );

  const handleListLoad = useCallback(() => {
    const offset = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;

    if (offset != null && offset > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset, animated: false }));
    }
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      scrollOffsetRef.current = 0;
      pendingScrollRestoreRef.current = null;
    }
  }, [entries.length]);

  const prepareForMediaRemovalAnimation = useCallback(() => {
    const list = listRef.current;
    if (!list || reduceMotionEnabled || Platform.OS !== 'ios') {
      return;
    }

    try {
      list.prepareForLayoutAnimationRender();
      LayoutAnimation.configureNext({
        duration: theme.animations.duration.standard,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
    } catch {
      // Persistence already succeeded; the gallery still updates without animation.
    }
  }, [reduceMotionEnabled, theme.animations.duration.standard]);

  const renderMediaItem = useCallback(
    (item: SavedMedia) => {
      const isVideo = item.mediaType === 'video';
      const previewUri = isVideo ? item.thumbnailUri : item.uri;
      const photoDateLabel = isVideo ? null : getPhotoSavedDateLabel(item.createdAt, now);
      const listThumbnailRadius = isListView
        ? LIST_THUMBNAIL_IMAGE_RADIUS
        : theme.radius.md;
      const mediaImage = (
        <Image
          accessibilityLabel={isVideo ? 'Miniatura de vídeo salvo' : 'Foto salva'}
          contentFit="cover"
          recyclingKey={`${item.mediaType}-${item.id}`}
          source={{ uri: previewUri }}
          style={
            isListView
              ? {
                  borderRadius: listThumbnailRadius,
                  height: listThumbnailSize,
                  overflow: 'hidden',
                  width: listThumbnailSize,
                }
              : {
                  aspectRatio: item.width / item.height,
                  borderRadius: theme.radius.lg,
                  overflow: 'hidden',
                  width: '100%',
                }
          }
          transition={120}
        />
      );
      const zoomableMediaImage = supportsAppleZoom ? (
        <Link.AppleZoom>{mediaImage}</Link.AppleZoom>
      ) : (
        mediaImage
      );

      const mediaTrigger = (
        <Pressable
          accessibilityLabel={isVideo ? 'Reproduzir vídeo salvo' : 'Abrir foto salva'}
          accessibilityRole="button"
          style={
            isListView
              ? StyleSheet.flatten([
                  getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
                  {
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: isCompactListView ? theme.spacing.xs : theme.spacing.sm,
                    padding: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
                  },
                ])
              : {
                  alignSelf: 'stretch',
                  marginBottom: theme.spacing.xs,
                  marginHorizontal: theme.spacing.xxs,
                }
          }
        >
          {isListView ? (
            <>
              <View
                style={{
                  borderRadius: listThumbnailRadius,
                  flexShrink: 0,
                  height: listThumbnailSize,
                  overflow: 'hidden',
                  position: 'relative',
                  width: listThumbnailSize,
                }}
              >
                {zoomableMediaImage}
                {isVideo ? (
                  <>
                    <Ionicons
                      accessibilityElementsHidden
                      color={theme.colors.textInverse}
                      name="play"
                      pointerEvents="none"
                      size={isCompactListView ? 18 : 20}
                      style={{
                        left: '50%',
                        position: 'absolute',
                        top: '50%',
                        transform: [
                          { translateX: isCompactListView ? -9 : -10 },
                          { translateY: isCompactListView ? -9 : -10 },
                        ],
                      }}
                    />
                    {item.durationMs != null && item.durationMs > 0 ? (
                      <Text
                        accessibilityElementsHidden
                        pointerEvents="none"
                        style={[
                          theme.typography.caption,
                          {
                            backgroundColor: theme.colors.overlay,
                            borderRadius: theme.radius.sm,
                            bottom: theme.spacing.xxs,
                            color: theme.colors.textInverse,
                            overflow: 'hidden',
                            paddingHorizontal: theme.spacing.xxs,
                            paddingVertical: 1,
                            position: 'absolute',
                            right: theme.spacing.xxs,
                          },
                        ]}
                      >
                        {formatVideoDuration(item.durationMs)}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
              <View
                style={{
                  flex: 1,
                  gap: theme.spacing.xxs,
                  justifyContent: 'center',
                  minHeight: 0,
                  minWidth: 0,
                  paddingVertical: theme.spacing.xxs,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    isCompactListView ? theme.typography.subheadline : theme.typography.headline,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  {isVideo ? 'Vídeo' : getPhotoDisplayTitle(item)}
                </Text>
                {isVideo && item.durationMs != null && item.durationMs > 0 ? (
                  <Text
                    numberOfLines={1}
                    style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                  >
                    {formatVideoDuration(item.durationMs)}
                  </Text>
                ) : !isVideo && photoDateLabel ? (
                  <Text
                    numberOfLines={1}
                    style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                  >
                    {photoDateLabel}
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <>
              {zoomableMediaImage}
              {isVideo ? (
                <>
                  <Ionicons
                    accessibilityElementsHidden
                    color={theme.colors.textInverse}
                    name="play"
                    pointerEvents="none"
                    size={26}
                    style={{
                      left: '50%',
                      position: 'absolute',
                      top: '50%',
                      transform: [{ translateX: -13 }, { translateY: -13 }],
                    }}
                  />
                  {item.durationMs != null && item.durationMs > 0 ? (
                    <Text
                      accessibilityElementsHidden
                      pointerEvents="none"
                      style={[
                        theme.typography.caption,
                        {
                          backgroundColor: theme.colors.overlay,
                          borderRadius: theme.radius.sm,
                          bottom: theme.spacing.xs,
                          color: theme.colors.textInverse,
                          overflow: 'hidden',
                          paddingHorizontal: theme.spacing.xs,
                          paddingVertical: theme.spacing.xxs,
                          position: 'absolute',
                          right: theme.spacing.xs,
                        },
                      ]}
                    >
                      {formatVideoDuration(item.durationMs)}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </Pressable>
      );

      const href =
        item.mediaType === 'video'
          ? { pathname: '/videos/[id]' as const, params: { id: String(item.id) } }
          : { pathname: '/photos/[id]' as const, params: { id: String(item.id) } };

      if (!supportsNativeContextMenu) {
        return (
          <Link asChild href={href}>
            {mediaTrigger}
          </Link>
        );
      }

      const previewSize = getPhotoPreviewSize(
        item.width,
        item.height,
        Math.min(screenWidth * 0.84, 360),
        screenHeight * 0.68,
      );

      return (
        <Link asChild href={href}>
          <Link.Trigger>{mediaTrigger}</Link.Trigger>
          <Link.Preview style={{ width: previewSize.width, height: previewSize.height }}>
            <Image
              accessibilityLabel={isVideo ? 'Prévia do vídeo salvo' : 'Prévia da foto salva'}
              contentFit="contain"
              source={{ uri: previewUri }}
              style={{
                borderRadius: theme.radius.lg,
                height: previewSize.height,
                overflow: 'hidden',
                width: previewSize.width,
              }}
            />
          </Link.Preview>
          <Link.Menu>
            {!isVideo ? (
              <Link.MenuAction
                title="Renomear"
                icon="pencil"
                onPress={() => requestRenamePhoto(item)}
              />
            ) : null}
            <Link.MenuAction
              title={isVideo ? 'Apagar vídeo' : 'Apagar imagem'}
              icon="trash"
              destructive
              onPress={() =>
                requestDeleteMedia(item.id, item.mediaType, prepareForMediaRemovalAnimation)
              }
            />
          </Link.Menu>
        </Link>
      );
    },
    [
      prepareForMediaRemovalAnimation,
      isListView,
      isCompactListView,
      listRowHeight,
      listThumbnailSize,
      requestDeleteMedia,
      requestRenamePhoto,
      screenHeight,
      screenWidth,
      supportsAppleZoom,
      supportsNativeContextMenu,
      theme,
      now,
    ],
  );

  const renderSavedContentItem = useCallback(
    (item: SavedHomeContent) => {
      const linkPresentation =
        item.contentType === 'link' && isListView ? getSavedLinkPresentation(item) : null;
      const contentTrigger =
        item.contentType === 'link' ? (
          isListView ? (
            <LinkCardPressable
              accessibilityLabel={`Abrir link ${item.title}`}
              accessibilityRole="link"
              style={StyleSheet.flatten([
                getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
                {
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: isCompactListView ? theme.spacing.xs : theme.spacing.sm,
                  padding: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
                },
              ])}
            >
              {item.previewImageUri ? (
                <View
                  style={{
                    borderRadius: LIST_THUMBNAIL_IMAGE_RADIUS,
                    flexShrink: 0,
                    height: listThumbnailSize,
                    overflow: 'hidden',
                    width: listThumbnailSize,
                  }}
                >
                  <Image
                    accessibilityLabel="Prévia do link"
                    cachePolicy="disk"
                    contentFit="cover"
                    recyclingKey={`link-preview-${item.id}`}
                    source={{ uri: item.previewImageUri }}
                    style={{
                      borderRadius: LIST_THUMBNAIL_IMAGE_RADIUS,
                      height: listThumbnailSize,
                      overflow: 'hidden',
                      width: listThumbnailSize,
                    }}
                    transition={120}
                  />
                </View>
              ) : null}
              <View
                style={{
                  flex: 1,
                  gap: theme.spacing.xxs,
                  justifyContent: 'center',
                  minHeight: 0,
                  minWidth: 0,
                  paddingVertical: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[theme.typography.caption, { color: theme.colors.textTertiary }]}
                >
                  {linkPresentation?.sourceLabel}
                </Text>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[
                    isCompactListView ? theme.typography.subheadline : theme.typography.headline,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  {linkPresentation?.primaryText ?? item.title}
                </Text>
                {linkPresentation?.secondaryText ? (
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                  >
                    {linkPresentation.secondaryText}
                  </Text>
                ) : null}
              </View>
            </LinkCardPressable>
          ) : (
            <LinkCardPressable
              accessibilityLabel={`Abrir link ${item.title}`}
              accessibilityRole="link"
              style={{
                alignSelf: 'stretch',
                backgroundColor: useLinkCardGlass ? 'transparent' : theme.colors.surface,
                borderColor: theme.colors.separator,
                borderRadius: theme.radius.linkCard,
                borderWidth: StyleSheet.hairlineWidth,
                marginBottom: theme.spacing.xs,
                marginHorizontal: theme.spacing.xxs,
                overflow: 'hidden',
              }}
            >
              {item.previewImageUri ? (
                <>
                  <Image
                    accessibilityLabel="Prévia do link"
                    cachePolicy="disk"
                    contentFit="cover"
                    recyclingKey={`link-preview-${item.id}`}
                    source={{ uri: item.previewImageUri }}
                    style={{
                      aspectRatio: 16 / 9,
                      borderTopLeftRadius: theme.radius.linkCard,
                      borderTopRightRadius: theme.radius.linkCard,
                      width: '100%',
                    }}
                    transition={120}
                  />
                  <View style={{ gap: theme.spacing.xxs, padding: theme.spacing.sm, position: 'relative' }}>
                    {useLinkCardGlass ? (
                      <GlassView
                        colorScheme={resolvedMode}
                        glassEffectStyle="regular"
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                      />
                    ) : null}
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={3}
                      style={[theme.typography.headline, { color: theme.colors.textPrimary }]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                    >
                      {item.domain}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={{ gap: theme.spacing.xs, padding: theme.spacing.sm, position: 'relative' }}>
                  {useLinkCardGlass ? (
                    <GlassView
                      colorScheme={resolvedMode}
                      glassEffectStyle="regular"
                      pointerEvents="none"
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={3}
                    style={[theme.typography.headline, { color: theme.colors.textPrimary }]}
                  >
                    {item.title}
                  </Text>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xxs }}>
                    <Ionicons color={theme.colors.textTertiary} name="link-outline" size={13} />
                    <Text
                      numberOfLines={1}
                      style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
                    >
                      {item.domain}
                    </Text>
                  </View>
                </View>
              )}
            </LinkCardPressable>
          )
        ) : isListView ? (
          <Pressable
            accessibilityLabel="Ler texto salvo"
            accessibilityRole="button"
            style={StyleSheet.flatten([
              getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
              {
                justifyContent: 'center',
                paddingHorizontal: isCompactListView ? theme.spacing.xs : theme.spacing.md,
                paddingVertical: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
              },
            ])}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={2}
              style={[
                isCompactListView ? theme.typography.subheadline : theme.typography.body,
                {
                  color: theme.colors.textPrimary,
                  ...(isCompactListView ? {} : { lineHeight: 23 }),
                },
              ]}
            >
              {item.text}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Ler texto salvo"
            accessibilityRole="button"
            style={{
              alignSelf: 'stretch',
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.separator,
              borderRadius: theme.radius.lg,
              borderWidth: StyleSheet.hairlineWidth,
              marginBottom: theme.spacing.xs,
              marginHorizontal: theme.spacing.xxs,
              padding: theme.spacing.md,
            }}
          >
            <Text
              numberOfLines={isCompactMasonry ? 4 : 6}
              style={[theme.typography.body, { color: theme.colors.textPrimary, lineHeight: 23 }]}
            >
              {item.text}
            </Text>
          </Pressable>
        );

      const href: Href =
        item.contentType === 'link'
          ? Platform.OS === 'ios'
            ? { pathname: '/links/[id]', params: { id: String(item.id) } }
            : (item.url as Href)
          : { pathname: '/texts/[id]', params: { id: String(item.id) } };

      const deleteItem = () =>
        requestDeleteContent(item.id, item.contentType, prepareForMediaRemovalAnimation);

      if (item.contentType === 'link') {
        const previewSize = getLinkPreviewSize(
          screenWidth,
          Boolean(item.previewImageUri),
          Boolean(item.description?.trim()),
        );

        return (
          <Link
            asChild
            href={href}
            onPress={
              Platform.OS === 'ios'
                ? (event) => {
                    // Link.Preview does not render custom previews for external hrefs in SDK 58.
                    // Keep the native preview target internal, while simple taps still open the URL.
                    event.preventDefault();
                    void Linking.openURL(item.url).catch(() => undefined);
                  }
                : undefined
            }
          >
            <Link.Trigger>{contentTrigger}</Link.Trigger>
            {Platform.OS === 'ios' ? (
              <Link.Preview style={previewSize}>
                <SavedLinkPreviewContent link={item} width={previewSize.width} />
              </Link.Preview>
            ) : null}
            <Link.Menu>
              <Link.MenuAction title="Apagar link" icon="trash" destructive onPress={deleteItem} />
            </Link.Menu>
          </Link>
        );
      }

      return (
        <Link asChild href={href}>
          <Link.Trigger>{contentTrigger}</Link.Trigger>
          <Link.Menu>
            <Link.MenuAction title="Apagar texto" icon="trash" destructive onPress={deleteItem} />
          </Link.Menu>
        </Link>
      );
    },
    [
      isCompactMasonry,
      isListView,
      isCompactListView,
      listRowHeight,
      listThumbnailSize,
      prepareForMediaRemovalAnimation,
      requestDeleteContent,
      resolvedMode,
      screenWidth,
      theme,
      useLinkCardGlass,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: HomeGalleryEntry }) => {
      if (item.kind === 'day-separator') {
        return (
          <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textSecondary }]}>
              {item.title}
            </Text>
          </View>
        );
      }

      return 'mediaType' in item.content
        ? renderMediaItem(item.content)
        : renderSavedContentItem(item.content);
    },
    [renderMediaItem, renderSavedContentItem, theme],
  );

  const getItemType = useCallback((item: HomeGalleryEntry) => {
    if (item.kind === 'day-separator') {
      return 'day-separator';
    }

    if ('mediaType' in item.content) {
      return item.content.mediaType;
    }

    return item.content.contentType;
  }, []);

  const overrideItemLayout = useCallback(
    (layout: { span?: number }, item: HomeGalleryEntry) => {
      const span = getHomeGalleryEntrySpan(item, viewLayout.numColumns);
      if (span != null) {
        layout.span = span;
      }
    },
    [viewLayout.numColumns],
  );

  const listHeaderStyle: StyleProp<ViewStyle> = useMemo(
    () => ({ marginBottom: contentGap }),
    [contentGap],
  );

  return (
    <FlashList
      alwaysBounceVertical={Platform.OS === 'ios'}
      contentContainerStyle={contentContainerStyle}
      data={entries}
      getItemType={getItemType}
      key={viewLayout.key}
      keyExtractor={(item) => item.id}
      ref={listRef}
      ListHeaderComponent={listHeader}
      ListHeaderComponentStyle={listHeaderStyle}
      masonry={viewLayout.masonry}
      numColumns={viewLayout.numColumns}
      onLoad={handleListLoad}
      onScroll={handleScroll}
      optimizeItemArrangement={false}
      overrideItemLayout={overrideItemLayout}
      renderItem={renderItem}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      style={{ flex: 1 }}
    />
  );
}
