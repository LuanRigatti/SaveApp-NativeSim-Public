import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useRouter, type Href } from 'expo-router';
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
  ActionSheetIOS,
  Alert,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type PressableProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import type { ProgressiveCollapsibleScrollContentProps } from '@/components/premium/ProgressiveCollapsibleScreen';
import { HomeGridCard } from '@/components/homeContent/HomeGridCard';
import { HomeTagDots } from '@/components/homeContent/HomeTagDots';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import {
  getHomeGalleryEntrySpan,
  getHomeGridCardMetrics,
  getHomeListMetrics,
  getHomeViewLayout,
  type HomeGridCardMode,
} from '@/features/home-content/homeViewMode';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { useLocalDocumentLibrary } from '@/features/documents/LocalDocumentLibraryProvider';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { buildHomeGalleryEntriesWhenReady } from '@/features/home-content/homeFeed';
import { filterHomeFavoriteItems } from '@/features/home-content/homeFavorites';
import { createHomeSearchIndex, filterHomeSearchIndex } from '@/features/home-content/homeSearch';
import { useHomeFavorites } from '@/features/home-content/HomeFavoritesProvider';
import { hasSavedTextGalleryEntry } from '@/features/home-content/textComposerNavigation';
import type { HomeGalleryEntry, SavedHomeContent } from '@/features/home-content/homeContentTypes';
import type { SavedChecklistSummary } from '@/features/home-content/checklistTypes';
import { getLinkPreviewSize } from '@/features/home-content/linkPreviewLayout';
import { getSavedLinkPresentation } from '@/features/home-content/savedLinkPresentation';
import { confirmSavedLinkOpen } from '@/features/home-content/savedLinkOpenConfirmation';
import { SavedLinkPreviewContent } from '@/components/homeContent/SavedLinkPreviewContent';
import { SavedTextPreviewContent } from '@/components/homeContent/SavedTextPreviewContent';
import { SavedTextThumbnail } from '@/components/homeContent/SavedTextThumbnail';
import { SavedDocumentPreviewContent } from '@/components/homeContent/SavedDocumentPreviewContent';
import { SavedDocumentThumbnail } from '@/components/homeContent/SavedDocumentThumbnail';
import { SavedChecklistPreviewContent } from '@/components/homeContent/SavedChecklistPreviewContent';
import { getSavedTextPresentation, getSavedTextPreviewSize } from '@/features/home-content/savedTextPresentation';
import { getChecklistPreviewSize } from '@/features/home-content/checklistPreviewLayout';
import { getHomeSingleLineTitle } from '@/features/home-content/homeSingleLinePresentation';
import { formatDocumentSize, getDocumentTypeLabel } from '@/features/documents/documentPresentation';
import type { SavedDocument } from '@/features/documents/documentTypes';
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
import { NativeCardContextMenu, type NativeCardContextMenuAction } from '@/components/native';
import HomeFolderIndicator from '@/features/home-folders/HomeFolderIndicator';
import { HomeFolderAssignmentPicker } from '@/features/home-folders/HomeFolderAssignmentPicker';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { getFolderAuthenticationFailureMessage } from '@/features/home-folders/folderFaceIdAuthentication';
import { getHomeFolderItemAssignment } from '@/features/home-folders/homeFolderLibrary';
import {
  filterHomeFolderItems,
  getHomeFolderItemType,
  getHomeFolderItemKey,
  type HomeFolderItemFilter,
  type HomeFolderItemType,
} from '@/features/home-folders/homeFolderTypes';
import { useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { getNativeCapabilities } from '@/platform/nativeCapabilities';
import { listSavedTagAssignments, listSavedTags, setSavedTagAssociation } from '@/features/home-tags/tagLibrary';
import { getVisibleSavedTagDots } from '@/features/home-tags/tagPresentation';
import type { SavedTag, SavedTagAssignment, SavedTagItemReference } from '@/features/home-tags/tagTypes';
import { getAccentColorTokens } from '@/theme/colors';
import { recordSaveAppDiagnosticEvent } from '../../../modules/clipboard-url-detection/src';

const LIST_THUMBNAIL_IMAGE_RADIUS = 14;

function getListRowLayoutStyle(theme: AppTheme, rowHeight: number, isCompact: boolean): ViewStyle {
  return {
    alignSelf: 'stretch',
    height: rowHeight,
    marginBottom: isCompact ? theme.spacing.xxs : theme.spacing.xs,
    marginHorizontal: theme.spacing.xxs,
  };
}

function getSingleLineRowLayoutStyle(theme: AppTheme, rowHeight: number): ViewStyle {
  return {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    height: rowHeight,
    marginBottom: theme.spacing.xxs,
    marginHorizontal: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
  };
}

function getSingleLineTitleTextStyle(theme: AppTheme, hasFolder: boolean): TextStyle {
  return {
    ...theme.typography.subheadline,
    color: theme.colors.textPrimary,
    flexGrow: hasFolder ? 0 : 1,
    flexShrink: 1,
    minWidth: 0,
  };
}

function getGridCardPressStyle(theme: AppTheme, mode: HomeGridCardMode, width: number): ViewStyle {
  if (mode === 'large') {
    return {
      alignSelf: 'center',
      marginBottom: theme.spacing.sm,
      width,
    };
  }

  return {
    alignSelf: 'stretch',
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.xs,
  };
}

const AnimatedNativePressable = Animated.createAnimatedComponent(Pressable);

type LinkCardPressableProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  highlightRadius?: number;
  style?: StyleProp<ViewStyle>;
};

type HomeFolderAssignmentTarget = {
  itemId: number;
  itemType: HomeFolderItemType;
  currentFolderId: string | null;
};

type SavedTagPickerTarget = SavedTagItemReference;

const LinkCardPressable = forwardRef<ComponentRef<typeof Pressable>, LinkCardPressableProps>(
  function LinkCardPressable({ children, highlightRadius, onPress, onPressIn, onPressOut, style, ...props }, ref) {
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
              borderRadius: highlightRadius ?? theme.radius.linkCard,
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
  documents: SavedDocument[];
  checklists: SavedChecklistSummary[];
  folderFilter: HomeFolderItemFilter;
  favoriteKeys: ReadonlySet<string>;
  favoritesOnly: boolean;
  searchQuery?: string;
  hidden?: boolean;
  isInitialFeedReady: boolean;
  revealNewestSignal?: number;
  revealSavedTextId: number | null;
};

export function PhotoMasonryGallery({
  contentContainerStyle,
  contentGap,
  largeTitle,
  media,
  contents,
  documents,
  checklists,
  folderFilter,
  favoriteKeys,
  favoritesOnly,
  searchQuery = '',
  hidden = false,
  isInitialFeedReady,
  revealNewestSignal = 0,
  revealSavedTextId,
  onScroll,
  showsVerticalScrollIndicator,
}: PhotoMasonryGalleryProps) {
  const { reduceMotionEnabled, resolvedMode, theme } = useAppTheme();
  const { viewMode } = useHomeViewMode();
  const { setFavorite } = useHomeFavorites();
  const viewLayout = getHomeViewLayout(viewMode);
  const gridCardMode: HomeGridCardMode | null = viewMode === 'large' || viewMode === 'small' ? viewMode : null;
  const isSingleLineView = viewMode === 'single-line';
  const isListView = viewMode === 'list' || viewMode === 'compact-list' || isSingleLineView;
  const isCompactListView = viewMode === 'compact-list';
  const { useGlass } = useVisualCapabilities();
  const useLinkCardGlass = useGlass;
  const smallGridCardGlassColorScheme = useGlass ? resolvedMode : undefined;
  const { requestDeleteMedia, requestRenamePhoto } = useLocalPhotoLibrary();
  const { requestDeleteContent } = useLocalSavedContent();
  const { openDocument, requestDeleteDocument } = useLocalDocumentLibrary();
  const { deleteChecklist } = useLocalChecklists();
  const {
    authorizeFolder,
    folderIdByItemKey,
    folders,
    isAppActive,
    isFolderAuthorized,
    lockEpoch,
    isReady: homeFoldersReady,
    unlockedFolderIds,
    setItemFolder,
  } = useLocalHomeFolders();
  const { openSettingsSheet, savedTagsChangeSignal } = useHomeSettingsSheet();
  const router = useRouter();
  const listRef = useRef<FlashListRef<HomeGalleryEntry> | null>(null);
  const lastRevealedTextIdRef = useRef<number | null>(null);
  const lastRevealNewestSignalRef = useRef(revealNewestSignal);
  const scrollOffsetRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const previousViewModeRef = useRef(viewMode);
  const lastLoggedCatalogVisibilityKeyRef = useRef<string | null>(null);
  const currentFolderFilterKey = favoritesOnly
    ? 'favorites'
    : folderFilter.kind === 'folder'
      ? `folder:${folderFilter.folderId}`
      : folderFilter.kind;
  const previousFolderFilterKeyRef = useRef(currentFolderFilterKey);
  const { fontScale, height: screenHeight, width: screenWidth } = useWindowDimensions();
  const listMetrics = getHomeListMetrics(viewMode, fontScale);
  const listRowHeight = listMetrics.rowHeight;
  const listThumbnailSize = listMetrics.thumbnailSize;
  const galleryContentContainerStyle = useMemo<StyleProp<ViewStyle>>(
    () => viewMode === 'small'
      ? [contentContainerStyle, { paddingHorizontal: theme.spacing.xs }]
      : contentContainerStyle,
    [contentContainerStyle, theme.spacing.xs, viewMode],
  );
  const flattenedContentStyle = StyleSheet.flatten(galleryContentContainerStyle);
  const fallbackHorizontalPadding = theme.layout.screenHorizontalPadding;
  const contentLeftPadding = typeof flattenedContentStyle?.paddingLeft === 'number'
    ? flattenedContentStyle.paddingLeft
    : typeof flattenedContentStyle?.paddingHorizontal === 'number'
      ? flattenedContentStyle.paddingHorizontal
      : fallbackHorizontalPadding;
  const contentRightPadding = typeof flattenedContentStyle?.paddingRight === 'number'
    ? flattenedContentStyle.paddingRight
    : typeof flattenedContentStyle?.paddingHorizontal === 'number'
      ? flattenedContentStyle.paddingHorizontal
      : fallbackHorizontalPadding;
  const gridCardHorizontalMargin = gridCardMode === 'small' ? theme.spacing.xs : theme.spacing.xxs;
  const gridCardMetrics = useMemo(
    () => gridCardMode
      ? getHomeGridCardMetrics(
          gridCardMode,
          screenWidth,
          (contentLeftPadding + contentRightPadding) / 2,
          gridCardHorizontalMargin,
          fontScale,
        )
      : null,
    [contentLeftPadding, contentRightPadding, fontScale, gridCardHorizontalMargin, gridCardMode, screenWidth],
  );
  const supportsAppleZoom = Platform.OS === 'ios' && Number(Platform.Version) >= 18;
  const supportsNativeContextMenu = Platform.OS === 'ios';
  const supportsNativeDocumentContextMenu = Platform.OS === 'ios';
  const [now, setNow] = useState(() => new Date());
  const [isTagAppActive, setIsTagAppActive] = useState(() => AppState.currentState === 'active');
  const [assignmentTarget, setAssignmentTarget] = useState<HomeFolderAssignmentTarget | null>(null);
  const [savedTags, setSavedTags] = useState<SavedTag[]>([]);
  const [tagAssignmentData, setTagAssignmentData] = useState<{
    scopeKey: string | null;
    byItemKey: Map<string, SavedTagAssignment[]>;
  }>({ scopeKey: null, byItemKey: new Map() });
  const tagQueryScopeKeyRef = useRef<string | null>(null);
  const [tagPickerTarget, setTagPickerTarget] = useState<SavedTagPickerTarget | null>(null);

  const folderForItem = useCallback(
    (itemType: HomeFolderItemType, itemId: number) => {
      const folderId = folderIdByItemKey.get(getHomeFolderItemKey(itemType, itemId));
      return folderId ? folders.find((folder) => folder.id === folderId) ?? null : null;
    },
    [folderIdByItemKey, folders],
  );

  const authorizeItemForAction = useCallback(
    async (itemType: HomeFolderItemType, itemId: number) => {
      const folderId = folderIdByItemKey.get(getHomeFolderItemKey(itemType, itemId));
      if (!folderId) return true;
      const outcome = await authorizeFolder(folderId);
      if (outcome === 'authenticated') return true;
      if (outcome === 'unavailable' || outcome === 'failed') {
        Alert.alert('Pasta protegida', getFolderAuthenticationFailureMessage(outcome));
      }
      return false;
    },
    [authorizeFolder, folderIdByItemKey],
  );

  const authorizeChecklistDelete = useCallback(async (checklistId: number) => {
    if (!isAppActive) return { authorized: false as const, folderId: null };
    const operationEpoch = lockEpoch;
    const initialFolderId = await getHomeFolderItemAssignment('checklist', checklistId);
    const folder = initialFolderId == null
      ? null
      : folders.find((item) => item.id === initialFolderId) ?? null;
    if (initialFolderId != null && !folder) {
      return { authorized: false as const, folderId: null };
    }
    if (folder?.isProtected) {
      const outcome = await authorizeFolder(folder.id);
      if (outcome !== 'authenticated') {
        if (outcome === 'unavailable' || outcome === 'failed') {
          Alert.alert('Pasta protegida', getFolderAuthenticationFailureMessage(outcome));
        }
        return { authorized: false as const, folderId: null };
      }
    }

    const currentFolderId = await getHomeFolderItemAssignment('checklist', checklistId);
    const currentFolder = currentFolderId == null
      ? null
      : folders.find((item) => item.id === currentFolderId) ?? null;
    const authorized = currentFolderId === initialFolderId &&
      (currentFolderId == null || currentFolder != null) &&
      (!currentFolder?.isProtected || (currentFolder != null && isFolderAuthorized(currentFolder.id))) &&
      isAppActive && lockEpoch === operationEpoch;
    return { authorized, folderId: authorized ? currentFolderId : null };
  }, [authorizeFolder, folders, isAppActive, isFolderAuthorized, lockEpoch]);

  const withItemAuthorization = useCallback(
    (itemType: HomeFolderItemType, itemId: number, action: () => void | Promise<void>) => () => {
      void (async () => {
        if (!(await authorizeItemForAction(itemType, itemId))) return;
        await action();
      })();
    },
    [authorizeItemForAction],
  );

  const createFavoriteAction = useCallback((itemType: HomeFolderItemType, itemId: number): NativeCardContextMenuAction => {
    const key = getHomeFolderItemKey(itemType, itemId);
    const currentlyFavorite = favoriteKeys.has(key);
    return {
      id: 'toggle-favorite',
      title: currentlyFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
      systemImage: currentlyFavorite ? 'star.slash' : 'star',
      onPress: withItemAuthorization(itemType, itemId, async () => {
        try {
          await setFavorite({ itemType, itemId }, !currentlyFavorite);
        } catch {
          Alert.alert('Não foi possível atualizar Favoritos', 'Tente novamente.');
        }
      }),
    };
  }, [favoriteKeys, setFavorite, withItemAuthorization]);

  const renderFavoriteMenuAction = useCallback((itemType: HomeFolderItemType, itemId: number) => {
    const action = createFavoriteAction(itemType, itemId);
    return (
      <Link.MenuAction
        key={`favorite-${itemType}-${itemId}`}
        title={action.title}
        icon={action.systemImage}
        onPress={action.onPress}
      />
    );
  }, [createFavoriteAction]);

  const authorizeTagOperation = useCallback(async (itemType: HomeFolderItemType, itemId: number) => {
    if (!homeFoldersReady || !isAppActive || !isTagAppActive || hidden || AppState.currentState !== 'active') return false;
    const operationEpoch = lockEpoch;
    const initialFolderId = await getHomeFolderItemAssignment(itemType, itemId);
    const initialFolder = initialFolderId == null
      ? null
      : folders.find((folder) => folder.id === initialFolderId) ?? null;
    if (initialFolderId != null && !initialFolder) return false;

    if (initialFolder?.isProtected) {
      const outcome = await authorizeFolder(initialFolder.id);
      if (outcome !== 'authenticated') {
        if (outcome === 'unavailable' || outcome === 'failed') {
          Alert.alert('Pasta protegida', getFolderAuthenticationFailureMessage(outcome));
        }
        return false;
      }
    }

    const currentFolderId = await getHomeFolderItemAssignment(itemType, itemId);
    const currentFolder = currentFolderId == null
      ? null
      : folders.find((folder) => folder.id === currentFolderId) ?? null;
    return currentFolderId === initialFolderId &&
      (currentFolderId == null || currentFolder != null) &&
      (!currentFolder?.isProtected || (currentFolder != null && isFolderAuthorized(currentFolder.id))) &&
      isAppActive && isTagAppActive && AppState.currentState === 'active' && lockEpoch === operationEpoch;
  }, [authorizeFolder, folders, hidden, homeFoldersReady, isAppActive, isFolderAuthorized, isTagAppActive, lockEpoch]);

  const toggleSavedTag = useCallback(async (
    reference: SavedTagItemReference,
    tagId: string,
    currentlySelected: boolean,
  ) => {
    const scopeKey = tagQueryScopeKeyRef.current;
    if (!scopeKey) return;
    if (!await authorizeTagOperation(reference.itemType, reference.itemId)) return;
    try {
      await setSavedTagAssociation(reference, tagId, !currentlySelected);
      const assignments = await listSavedTagAssignments([reference]);
      if (tagQueryScopeKeyRef.current !== scopeKey || !await authorizeTagOperation(reference.itemType, reference.itemId)) return;
      const key = getHomeFolderItemKey(reference.itemType, reference.itemId);
      setTagAssignmentData((current) => {
        const next = new Map(current.scopeKey === scopeKey ? current.byItemKey : []);
        if (assignments.length === 0) next.delete(key);
        else next.set(key, assignments);
        return { scopeKey, byItemKey: next };
      });
    } catch {
      Alert.alert('Não foi possível atualizar as etiquetas', 'A associação anterior foi mantida. Tente novamente.');
    }
  }, [authorizeTagOperation]);

  const openTagPicker = useCallback(async (reference: SavedTagItemReference) => {
    const scopeKey = tagQueryScopeKeyRef.current;
    if (!scopeKey) return;
    if (!await authorizeTagOperation(reference.itemType, reference.itemId)) return;
    try {
      const assignments = await listSavedTagAssignments([reference]);
      if (tagQueryScopeKeyRef.current !== scopeKey || !await authorizeTagOperation(reference.itemType, reference.itemId)) return;
      const key = getHomeFolderItemKey(reference.itemType, reference.itemId);
      setTagAssignmentData((current) => {
        const next = new Map(current.scopeKey === scopeKey ? current.byItemKey : []);
        if (assignments.length === 0) next.delete(key);
        else next.set(key, assignments);
        return { scopeKey, byItemKey: next };
      });
      setTagPickerTarget(reference);
    } catch {
      Alert.alert('Não foi possível carregar as etiquetas', 'Tente novamente.');
    }
  }, [authorizeTagOperation]);
  const openDocumentSafely = useCallback(
    (document: SavedDocument) => withItemAuthorization('document', document.id, () => openDocument(document)),
    [openDocument, withItemAuthorization],
  );

  useEffect(() => {
    const refreshDate = () => setNow(new Date());
    const subscription = AppState.addEventListener('change', (state) => {
      setIsTagAppActive(state === 'active');
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
  const protectedFolderIds = useMemo(
    () => new Set(folders.filter((folder) => folder.isProtected).map((folder) => folder.id)),
    [folders],
  );
  const accessibleUnlockedFolderIds = useMemo(
    () => isAppActive ? unlockedFolderIds : new Set<string>(),
    [isAppActive, unlockedFolderIds],
  );
  const folderAndFavoriteFilteredItems = useMemo(() => {
    const allItems = [...media, ...contents, ...documents, ...checklists];
    if (favoritesOnly) {
      return filterHomeFavoriteItems(
        allItems,
        favoriteKeys,
        folderIdByItemKey,
        protectedFolderIds,
        accessibleUnlockedFolderIds,
        homeFoldersReady,
      );
    }
    if (!homeFoldersReady) return allItems;
    return filterHomeFolderItems(
      allItems,
      folderFilter,
      folderIdByItemKey,
      protectedFolderIds,
      accessibleUnlockedFolderIds,
    );
  }, [accessibleUnlockedFolderIds, checklists, contents, documents, favoriteKeys, favoritesOnly, folderFilter, folderIdByItemKey, homeFoldersReady, media, protectedFolderIds]);
  const homeSearchIndex = useMemo(
    () => createHomeSearchIndex(folderAndFavoriteFilteredItems),
    [folderAndFavoriteFilteredItems],
  );
  const filteredItems = useMemo(
    () => filterHomeSearchIndex(homeSearchIndex, searchQuery),
    [homeSearchIndex, searchQuery],
  );
  const tagQueryReferences = useMemo<SavedTagItemReference[]>(
    () => filteredItems.map((item) => ({ itemType: getHomeFolderItemType(item), itemId: item.id })),
    [filteredItems],
  );
  const tagQueryScopeKey = useMemo(() => {
    if (!homeFoldersReady || !isAppActive || !isTagAppActive || hidden || AppState.currentState !== 'active') return null;
    const itemKeys = tagQueryReferences
      .map(({ itemType, itemId }) => getHomeFolderItemKey(itemType, itemId))
      .join(',');
    return `${folderFilter.kind}:${folderFilter.kind === 'folder' ? folderFilter.folderId : ''}:${itemKeys}:${savedTagsChangeSignal}`;
  }, [folderFilter, hidden, homeFoldersReady, isAppActive, isTagAppActive, savedTagsChangeSignal, tagQueryReferences]);
  const entries = useMemo(
    () => buildHomeGalleryEntriesWhenReady(filteredItems, now, isInitialFeedReady && homeFoldersReady),
    [filteredItems, homeFoldersReady, isInitialFeedReady, now],
  );
  const hasVisibleLinkAfterFilters = filteredItems.some(
    (item) => 'contentType' in item && item.contentType === 'link',
  );
  const hasCatalogLink = contents.some((item) => item.contentType === 'link');

  useEffect(() => {
    const filterEvent = favoritesOnly
      ? 'home.filter.favorites'
      : folderFilter.kind === 'folder'
        ? 'home.filter.folder'
        : 'home.filter.all';
    const visibilityKey = [
      isInitialFeedReady && homeFoldersReady,
      hidden,
      hasCatalogLink,
      favoritesOnly,
      folderFilter.kind,
      Boolean(searchQuery.trim()),
      hasVisibleLinkAfterFilters,
    ].join(':');
    if (lastLoggedCatalogVisibilityKeyRef.current === visibilityKey) return;
    lastLoggedCatalogVisibilityKeyRef.current = visibilityKey;
    recordSaveAppDiagnosticEvent(filterEvent);

    if (!isInitialFeedReady || !homeFoldersReady) {
      recordSaveAppDiagnosticEvent('home.gallery.awaiting_data');
    } else if (hidden) {
      recordSaveAppDiagnosticEvent('home.gallery.content_hidden');
    } else if (!hasCatalogLink) {
      recordSaveAppDiagnosticEvent('home.gallery.no_links_in_catalog');
    } else {
      recordSaveAppDiagnosticEvent(hasVisibleLinkAfterFilters
        ? 'home.gallery.links_visible'
        : 'home.gallery.links_filtered_out');
    }
  }, [favoritesOnly, folderFilter.kind, hasCatalogLink, hasVisibleLinkAfterFilters, hidden, homeFoldersReady, isInitialFeedReady, searchQuery]);

  useLayoutEffect(() => {
    tagQueryScopeKeyRef.current = tagQueryScopeKey;
  }, [tagQueryScopeKey]);

  useEffect(() => {
    if (!tagQueryScopeKey) return;

    let cancelled = false;
    void Promise.all([listSavedTags(), listSavedTagAssignments(tagQueryReferences)])
      .then(([tags, assignments]) => {
        if (cancelled || tagQueryScopeKeyRef.current !== tagQueryScopeKey) return;
        setSavedTags(tags);
        const nextAssignments = new Map<string, SavedTagAssignment[]>();
        for (const assignment of assignments) {
          const key = getHomeFolderItemKey(assignment.itemType, assignment.itemId);
          const itemAssignments = nextAssignments.get(key) ?? [];
          itemAssignments.push(assignment);
          nextAssignments.set(key, itemAssignments);
        }
        setTagAssignmentData({ scopeKey: tagQueryScopeKey, byItemKey: nextAssignments });
      })
      .catch(() => {
        if (!cancelled && tagQueryScopeKeyRef.current === tagQueryScopeKey) {
          setTagAssignmentData({ scopeKey: tagQueryScopeKey, byItemKey: new Map() });
        }
      });

    return () => { cancelled = true; };
  }, [tagQueryReferences, tagQueryScopeKey]);

  const tagsForItem = useCallback((itemType: HomeFolderItemType, itemId: number) => (
    tagAssignmentData.scopeKey === tagQueryScopeKey
      ? tagAssignmentData.byItemKey.get(getHomeFolderItemKey(itemType, itemId)) ?? []
      : []
  ), [tagAssignmentData, tagQueryScopeKey]);

  const visibleTagDotsForItem = useCallback((itemType: HomeFolderItemType, itemId: number) => (
    getVisibleSavedTagDots(folderFilter.kind === 'folder', tagsForItem(itemType, itemId))
  ), [folderFilter.kind, tagsForItem]);

  const openFolderManager = useCallback(() => {
    if (Platform.OS === 'ios' && getNativeCapabilities().canUseNativeSwiftUI) {
      openSettingsSheet('folders');
      return;
    }
    router.push({ pathname: '/settings-sheet-fallback', params: { page: 'folders' } });
  }, [openSettingsSheet, router]);

  const openTagManager = useCallback(() => {
    if (Platform.OS === 'ios' && getNativeCapabilities().canUseNativeSwiftUI) {
      openSettingsSheet('tags');
      return;
    }
    router.push({ pathname: '/settings-sheet-fallback', params: { page: 'tags' } });
  }, [openSettingsSheet, router]);

  const assignItemToFolder = useCallback(
    async (itemType: HomeFolderItemType, itemId: number, folderId: string | null) => {
      try {
        await setItemFolder(itemType, itemId, folderId);
      } catch {
        Alert.alert('Não foi possível mover o item', 'A pasta atual foi mantida. Tente novamente.');
      }
    },
    [setItemFolder],
  );

  const openAssignmentPicker = useCallback(
    (itemType: HomeFolderItemType, itemId: number) => {
      const currentFolderId = folderIdByItemKey.get(getHomeFolderItemKey(itemType, itemId)) ?? null;
      if (Platform.OS === 'ios') {
        if (folders.length === 0) {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              title: 'Organizar item',
              message: 'Crie uma pasta para começar.',
              options: ['Criar pasta', 'Cancelar'],
              cancelButtonIndex: 1,
            },
            (index) => {
              if (index === 0) openFolderManager();
            },
          );
          return;
        }

        const options = folders.map((folder) =>
          folder.id === currentFolderId ? `${folder.name} · atual` : folder.name,
        );
        const removeIndex = currentFolderId ? options.push('Remover da pasta') - 1 : -1;
        const manageIndex = options.push('Gerenciar pastas') - 1;
        const cancelIndex = options.push('Cancelar') - 1;
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: currentFolderId ? 'Alterar pasta' : 'Adicionar à pasta',
            options,
            cancelButtonIndex: cancelIndex,
          },
          (index) => {
            if (index < folders.length) {
              void assignItemToFolder(itemType, itemId, folders[index].id);
            } else if (index === removeIndex) {
              void assignItemToFolder(itemType, itemId, null);
            } else if (index === manageIndex) {
              openFolderManager();
            }
          },
        );
        return;
      }

      setAssignmentTarget({ itemType, itemId, currentFolderId });
    },
    [assignItemToFolder, folderIdByItemKey, folders, openFolderManager],
  );

  const chooseFolderFromPicker = useCallback(
    (folderId: string | null) => {
      if (!assignmentTarget) return;
      const target = assignmentTarget;
      setAssignmentTarget(null);
      void assignItemToFolder(target.itemType, target.itemId, folderId);
    },
    [assignmentTarget, assignItemToFolder],
  );

  const homeFolderContextActions = useCallback(
    (
      itemType: HomeFolderItemType,
      itemId: number,
      currentFolderId: string | null,
      deleteAction: NativeCardContextMenuAction,
      renameAction?: NativeCardContextMenuAction,
    ): NativeCardContextMenuAction[] => [
      {
        id: 'tags',
        title: 'Etiquetas',
        systemImage: 'tag',
        onPress: () => { void openTagPicker({ itemType, itemId }); },
      },
      createFavoriteAction(itemType, itemId),
      ...(renameAction ? [{
        ...renameAction,
        onPress: withItemAuthorization(itemType, itemId, renameAction.onPress),
      }] : []),
      {
        id: 'folder-assign',
        title: currentFolderId ? 'Alterar pasta' : 'Adicionar à pasta',
        systemImage: 'folder',
        onPress: withItemAuthorization(itemType, itemId, () => openAssignmentPicker(itemType, itemId)),
      },
      ...(currentFolderId
        ? [{
            id: 'folder-remove',
            title: 'Remover da pasta',
            systemImage: 'folder.badge.minus' as const,
            onPress: withItemAuthorization(itemType, itemId, () => assignItemToFolder(itemType, itemId, null)),
          }]
        : []),
      {
        ...deleteAction,
        onPress: withItemAuthorization(itemType, itemId, deleteAction.onPress),
      },
    ],
    [assignItemToFolder, createFavoriteAction, openAssignmentPicker, openTagPicker, withItemAuthorization],
  );

  const renderSavedTagSubmenu = useCallback((itemType: HomeFolderItemType, itemId: number) => {
    const reference = { itemType, itemId } satisfies SavedTagItemReference;
    const selectedTagIds = new Set(tagsForItem(itemType, itemId).map(({ tagId }) => tagId));
    return (
      <Link.Menu icon="tag" title="Etiquetas">
        {savedTags.map((savedTag) => (
          <Link.MenuAction
            key={savedTag.id}
            icon="tag"
            isOn={selectedTagIds.has(savedTag.id)}
            title={savedTag.name}
            onPress={() => void toggleSavedTag(reference, savedTag.id, selectedTagIds.has(savedTag.id))}
          />
        ))}
        <Link.MenuAction icon="slider.horizontal.3" title="Gerenciar etiquetas" onPress={openTagManager} />
      </Link.Menu>
    );
  }, [openTagManager, savedTags, tagsForItem, toggleSavedTag]);

  useLayoutEffect(() => {
    if (previousViewModeRef.current !== viewMode) {
      pendingScrollRestoreRef.current = scrollOffsetRef.current;
      previousViewModeRef.current = viewMode;
    }
  }, [viewMode]);

  useLayoutEffect(() => {
    if (previousFolderFilterKeyRef.current === currentFolderFilterKey) return;
    previousFolderFilterKeyRef.current = currentFolderFilterKey;
    scrollOffsetRef.current = 0;
    pendingScrollRestoreRef.current = null;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [currentFolderFilterKey]);

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

  useEffect(() => {
    if (lastRevealNewestSignalRef.current === revealNewestSignal) return;
    lastRevealNewestSignalRef.current = revealNewestSignal;
    const frame = requestAnimationFrame(() => {
      scrollOffsetRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotionEnabled });
    });

    return () => cancelAnimationFrame(frame);
  }, [reduceMotionEnabled, revealNewestSignal]);

  useEffect(() => {
    if (
      revealSavedTextId == null ||
      revealSavedTextId === lastRevealedTextIdRef.current ||
      !isInitialFeedReady ||
      !hasSavedTextGalleryEntry(entries, revealSavedTextId)
    ) {
      return;
    }

    lastRevealedTextIdRef.current = revealSavedTextId;
    const frame = requestAnimationFrame(() => {
      scrollOffsetRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotionEnabled });
    });

    return () => cancelAnimationFrame(frame);
  }, [entries, isInitialFeedReady, reduceMotionEnabled, revealSavedTextId]);

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
      const folder = folderForItem(item.mediaType, item.id);
      const folderName = folder?.name ?? null;
      const previewUri = isVideo ? item.thumbnailUri : item.uri;
      const photoDateLabel = isVideo ? null : getPhotoSavedDateLabel(item.createdAt, now);
      const listThumbnailRadius = isSingleLineView
        ? theme.radius.sm
        : isListView
          ? LIST_THUMBNAIL_IMAGE_RADIUS
          : theme.radius.md;
      const videoPlayIconSize = isSingleLineView ? 14 : isCompactListView ? 18 : 20;
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
                  height: '100%',
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

      const mediaGridPreview = (
        <View style={StyleSheet.absoluteFill}>
          {zoomableMediaImage}
          {isVideo ? (
            <>
              <Ionicons
                accessibilityElementsHidden
                color={theme.colors.textInverse}
                name="play"
                pointerEvents="none"
                size={gridCardMode === 'small' ? 20 : 26}
                style={{
                  left: '50%',
                  position: 'absolute',
                  top: '50%',
                  transform: [
                    { translateX: gridCardMode === 'small' ? -10 : -13 },
                    { translateY: gridCardMode === 'small' ? -10 : -13 },
                  ],
                }}
              />
              {item.durationMs != null && item.durationMs > 0 ? (
                <Text
                  accessibilityElementsHidden
                  numberOfLines={1}
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
        </View>
      );

      const mediaTrigger = isListView ? (
        <Pressable
          accessibilityLabel={isVideo ? 'Reproduzir vídeo salvo' : 'Abrir foto salva'}
          accessibilityRole="button"
          style={isSingleLineView
            ? getSingleLineRowLayoutStyle(theme, listRowHeight)
            : StyleSheet.flatten([
                getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
                {
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: isCompactListView ? theme.spacing.xs : theme.spacing.sm,
                  padding: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
                },
              ])}
        >
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
                  size={videoPlayIconSize}
                  style={{
                    left: '50%',
                    position: 'absolute',
                    top: '50%',
                    transform: [
                      { translateX: -videoPlayIconSize / 2 },
                      { translateY: -videoPlayIconSize / 2 },
                    ],
                  }}
                />
                {!isSingleLineView && item.durationMs != null && item.durationMs > 0 ? (
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
          {isSingleLineView ? (
            <>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={getSingleLineTitleTextStyle(theme, Boolean(folderName))}
              >
                {getHomeSingleLineTitle(item)}
              </Text>
              {folderName ? <HomeFolderIndicator maxWidth="28%" folderColor={folder?.color ?? null} name={folderName} /> : null}
              <HomeTagDots tags={visibleTagDotsForItem(item.mediaType, item.id)} />
            </>
          ) : (
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
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs, minWidth: 0 }}>
                  <Text ellipsizeMode="tail" numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 1, maxWidth: folderName ? '56%' : undefined, minWidth: 0 }]}>
                    {formatVideoDuration(item.durationMs)}
                  </Text>
                  {folderName ? <HomeFolderIndicator maxWidth="40%" folderColor={folder?.color ?? null} name={folderName} /> : null}
                  <HomeTagDots tags={visibleTagDotsForItem(item.mediaType, item.id)} />
                </View>
              ) : !isVideo && photoDateLabel ? (
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs, minWidth: 0 }}>
                  <Text ellipsizeMode="tail" numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 1, maxWidth: folderName ? '56%' : undefined, minWidth: 0 }]}>
                    {photoDateLabel}
                  </Text>
                  {folderName ? <HomeFolderIndicator maxWidth="40%" folderColor={folder?.color ?? null} name={folderName} /> : null}
                  <HomeTagDots tags={visibleTagDotsForItem(item.mediaType, item.id)} />
                </View>
              ) : folderName ? (
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
                  <HomeFolderIndicator maxWidth="40%" folderColor={folder?.color ?? null} name={folderName} />
                  <HomeTagDots tags={visibleTagDotsForItem(item.mediaType, item.id)} />
                </View>
              ) : null}
            </View>
          )}
        </Pressable>
      ) : gridCardMode && gridCardMetrics ? (
        <Pressable
          accessibilityLabel={isVideo ? 'Reproduzir vídeo salvo' : 'Abrir foto salva'}
          accessibilityRole="button"
          style={getGridCardPressStyle(theme, gridCardMode, gridCardMetrics.width)}
        >
          <HomeGridCard
            detail={gridCardMode === 'large' ? photoDateLabel : null}
            folderColor={folder?.color ?? null} folderName={folderName}
            tagDots={visibleTagDotsForItem(item.mediaType, item.id)}
            glassColorScheme={gridCardMode === 'small' ? smallGridCardGlassColorScheme : undefined}
            metadata={isVideo && item.durationMs != null && item.durationMs > 0
              ? formatVideoDuration(item.durationMs)
              : isVideo ? 'Vídeo' : 'Foto'}
            metrics={gridCardMetrics}
            mode={gridCardMode}
            preview={mediaGridPreview}
            title={isVideo ? 'Vídeo' : getPhotoDisplayTitle(item)}
          />
        </Pressable>
      ) : null;

      const href =
        item.mediaType === 'video'
          ? { pathname: '/videos/[id]' as const, params: { id: String(item.id) } }
          : { pathname: '/photos/[id]' as const, params: { id: String(item.id) } };

      const mediaDeleteAction: NativeCardContextMenuAction = {
        id: 'delete-media',
        title: isVideo ? 'Apagar vídeo' : 'Apagar imagem',
        systemImage: 'trash',
        destructive: true,
        onPress: withItemAuthorization(
          item.mediaType,
          item.id,
          () => requestDeleteMedia(
            item.id,
            item.mediaType,
            prepareForMediaRemovalAnimation,
            () => authorizeItemForAction(item.mediaType, item.id),
          ),
        ),
      };
      const renameAction: NativeCardContextMenuAction | undefined = isVideo
        ? undefined
        : {
            id: 'rename-photo',
            title: 'Renomear',
            systemImage: 'pencil',
            onPress: withItemAuthorization(item.mediaType, item.id, () => requestRenamePhoto(item)),
          };
      const contextActions = homeFolderContextActions(
        item.mediaType,
        item.id,
        folderIdByItemKey.get(getHomeFolderItemKey(item.mediaType, item.id)) ?? null,
        mediaDeleteAction,
        renameAction,
      );

      if (!supportsNativeContextMenu) {
        return (
          <NativeCardContextMenu actions={contextActions}>
            <Link asChild href={href}>{mediaTrigger}</Link>
          </NativeCardContextMenu>
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
            <Link.MenuAction
              title={folderName ? 'Alterar pasta' : 'Adicionar à pasta'}
              icon="folder"
              onPress={withItemAuthorization(item.mediaType, item.id, () => openAssignmentPicker(item.mediaType, item.id))}
            />
            {folderName ? (
              <Link.MenuAction
                title="Remover da pasta"
                icon="folder"
                onPress={withItemAuthorization(item.mediaType, item.id, () => assignItemToFolder(item.mediaType, item.id, null))}
              />
            ) : null}
            {renderFavoriteMenuAction(item.mediaType, item.id)}
            {renderSavedTagSubmenu(item.mediaType, item.id)}
            {!isVideo ? (
              <Link.MenuAction
                title="Renomear"
                icon="pencil"
                onPress={withItemAuthorization(item.mediaType, item.id, () => requestRenamePhoto(item))}
              />
            ) : null}
            <Link.MenuAction
              title={isVideo ? 'Apagar vídeo' : 'Apagar imagem'}
              icon="trash"
              destructive
              onPress={withItemAuthorization(
                item.mediaType,
                item.id,
                () => requestDeleteMedia(
                  item.id,
                  item.mediaType,
                  prepareForMediaRemovalAnimation,
                  () => authorizeItemForAction(item.mediaType, item.id),
                ),
              )}
            />
          </Link.Menu>
        </Link>
      );
    },
    [
      prepareForMediaRemovalAnimation,
      assignItemToFolder,
      folderForItem,
      folderIdByItemKey,
      homeFolderContextActions,
      isListView,
      isCompactListView,
      isSingleLineView,
      listRowHeight,
      listThumbnailSize,
      gridCardMetrics,
      gridCardMode,
      smallGridCardGlassColorScheme,
      requestDeleteMedia,
      authorizeItemForAction,
      requestRenamePhoto,
      screenHeight,
      screenWidth,
      supportsAppleZoom,
      supportsNativeContextMenu,
      theme,
      withItemAuthorization,
      now,
      openAssignmentPicker,
      renderFavoriteMenuAction,
      renderSavedTagSubmenu,
      visibleTagDotsForItem,
    ],
  );

  const renderSavedContentItem = useCallback(
    (item: SavedHomeContent) => {
      const linkPresentation = item.contentType === 'link' && isListView ? getSavedLinkPresentation(item) : null;
      const textPresentation = item.contentType === 'text' ? getSavedTextPresentation(item.text) : null;
      const folder = folderForItem(item.contentType, item.id);
      const folderName = folder?.name ?? null;
      const contentTrigger =
        item.contentType === 'link' ? (
          isSingleLineView ? (
            <LinkCardPressable
              accessibilityLabel={`Abrir link ${item.title}`}
              accessibilityRole="link"
              style={getSingleLineRowLayoutStyle(theme, listRowHeight)}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.radius.sm,
                  flexShrink: 0,
                  height: listThumbnailSize,
                  justifyContent: 'center',
                  overflow: 'hidden',
                  width: listThumbnailSize,
                }}
              >
                {item.previewImageUri ? (
                  <Image
                    accessibilityLabel="Prévia do link"
                    cachePolicy="disk"
                    contentFit="cover"
                    recyclingKey={`link-preview-${item.id}`}
                    source={{ uri: item.previewImageUri }}
                    style={StyleSheet.absoluteFill}
                    transition={120}
                  />
                ) : (
                  <Ionicons color={theme.colors.textTertiary} name="link-outline" size={18} />
                )}
              </View>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={getSingleLineTitleTextStyle(theme, Boolean(folderName))}
              >
                {getHomeSingleLineTitle(item)}
              </Text>
              {folderName ? <HomeFolderIndicator maxWidth="28%" folderColor={folder?.color ?? null} name={folderName} /> : null}
              <HomeTagDots tags={visibleTagDotsForItem('link', item.id)} />
            </LinkCardPressable>
          ) : isListView ? (
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
                {linkPresentation?.secondaryText || folderName ? (
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs, minWidth: 0 }}>
                    {linkPresentation?.secondaryText ? (
                      <Text
                        ellipsizeMode="tail"
                        numberOfLines={1}
                        style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 1, maxWidth: folderName ? '56%' : undefined, minWidth: 0 }]}
                      >
                        {linkPresentation.secondaryText}
                      </Text>
                    ) : null}
                    {folderName ? <HomeFolderIndicator maxWidth="40%" folderColor={folder?.color ?? null} name={folderName} /> : null}
                    <HomeTagDots tags={visibleTagDotsForItem('link', item.id)} />
                  </View>
                ) : null}
              </View>
            </LinkCardPressable>
          ) : gridCardMode && gridCardMetrics ? (
            <LinkCardPressable
              accessibilityLabel={`Abrir link ${item.title}`}
              accessibilityRole="link"
              highlightRadius={theme.radius.card}
              style={getGridCardPressStyle(theme, gridCardMode, gridCardMetrics.width)}
            >
              <HomeGridCard
                detail={gridCardMode === 'large' ? item.description : null}
                folderColor={folder?.color ?? null} folderName={folderName}
                tagDots={visibleTagDotsForItem('link', item.id)}
                glassColorScheme={useLinkCardGlass ? resolvedMode : undefined}
                metadata={item.domain || 'Link'}
                metrics={gridCardMetrics}
                mode={gridCardMode}
                preview={item.previewImageUri ? (
                  <Image
                    accessibilityLabel="Prévia do link"
                    cachePolicy="disk"
                    contentFit="cover"
                    recyclingKey={`link-preview-${item.id}`}
                    source={{ uri: item.previewImageUri }}
                    style={StyleSheet.absoluteFill}
                    transition={120}
                  />
                ) : (
                  <Ionicons color={theme.colors.textTertiary} name="link-outline" size={36} />
                )}
                title={item.title}
              />
            </LinkCardPressable>
          ) : null
        ) : isSingleLineView ? (
          <Pressable
            accessibilityLabel="Ler texto salvo"
            accessibilityRole="button"
            style={getSingleLineRowLayoutStyle(theme, listRowHeight)}
          >
            <SavedTextThumbnail height={listThumbnailSize} text={item.text} width={listThumbnailSize} />
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={getSingleLineTitleTextStyle(theme, Boolean(folderName))}
            >
              {getHomeSingleLineTitle(item)}
            </Text>
            {folderName ? <HomeFolderIndicator maxWidth="28%" folderColor={folder?.color ?? null} name={folderName} /> : null}
            <HomeTagDots tags={visibleTagDotsForItem('text', item.id)} />
          </Pressable>
        ) : isListView ? (
          <Pressable
            accessibilityLabel="Ler texto salvo"
            accessibilityRole="button"
            style={StyleSheet.flatten([
              getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
              {
                alignItems: 'center',
                flexDirection: 'row',
                gap: isCompactListView ? theme.spacing.xs : theme.spacing.sm,
                paddingHorizontal: isCompactListView ? theme.spacing.xs : theme.spacing.md,
                paddingVertical: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
              },
            ])}
          >
            <SavedTextThumbnail height={listThumbnailSize} text={item.text} width={listThumbnailSize} />
            <View style={{ flex: 1, gap: theme.spacing.xxs, justifyContent: 'center', minWidth: 0 }}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  isCompactListView ? theme.typography.subheadline : theme.typography.headline,
                  { color: theme.colors.textPrimary },
                ]}
              >
                {textPresentation?.title}
              </Text>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs, minWidth: 0 }}>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 1, maxWidth: folderName ? '56%' : undefined, minWidth: 0 }]}
                >
                  {textPresentation?.secondaryText ?? 'Nota salva'}
                </Text>
                {folderName ? <HomeFolderIndicator maxWidth="40%" folderColor={folder?.color ?? null} name={folderName} /> : null}
                <HomeTagDots tags={visibleTagDotsForItem('text', item.id)} />
              </View>
            </View>
          </Pressable>
        ) : gridCardMode && gridCardMetrics ? (
          <Pressable
            accessibilityLabel="Ler texto salvo"
            accessibilityRole="button"
            style={getGridCardPressStyle(theme, gridCardMode, gridCardMetrics.width)}
          >
            <HomeGridCard
              detail={textPresentation?.secondaryText}
              folderColor={folder?.color ?? null} folderName={folderName}
              tagDots={visibleTagDotsForItem('text', item.id)}
              glassColorScheme={gridCardMode === 'small' ? smallGridCardGlassColorScheme : undefined}
              metadata="Nota"
              metrics={gridCardMetrics}
              mode={gridCardMode}
              preview={<SavedTextThumbnail
                borderRadius={0}
                height={gridCardMetrics.previewHeight}
                text={item.text}
                width={gridCardMode === 'small' ? gridCardMetrics.previewHeight : gridCardMetrics.width}
              />}
              title={textPresentation?.title ?? 'Texto salvo'}
            />
          </Pressable>
        ) : null;

      const href: Href =
        item.contentType === 'link'
          ? Platform.OS === 'ios'
            ? { pathname: '/links/[id]', params: { id: String(item.id) } }
            : (item.url as Href)
          : { pathname: '/texts/[id]', params: { id: String(item.id) } };

      const requestOpenLink = () => {
        if (item.contentType !== 'link') return;
        const savedLink = item;
        confirmSavedLinkOpen(async () => {
          if (!(await authorizeItemForAction('link', savedLink.id))) return;
          await Linking.openURL(savedLink.url).catch(() => undefined);
        });
      };

      const deleteItem = withItemAuthorization(item.contentType, item.id, () =>
        requestDeleteContent(
          item.id,
          item.contentType,
          prepareForMediaRemovalAnimation,
          () => authorizeItemForAction(item.contentType, item.id),
        ),
      );
      const folderId = folderIdByItemKey.get(getHomeFolderItemKey(item.contentType, item.id)) ?? null;
      const deleteAction: NativeCardContextMenuAction = {
        id: `delete-${item.contentType}`,
        title: `Apagar ${item.contentType === 'link' ? 'link' : 'texto'}`,
        systemImage: 'trash',
        destructive: true,
        onPress: deleteItem,
      };
      const contextActions = homeFolderContextActions(item.contentType, item.id, folderId, deleteAction);

      if (item.contentType === 'link') {
        const previewSize = getLinkPreviewSize(
          screenWidth,
          Boolean(item.previewImageUri),
          Boolean(item.description?.trim()),
        );

        const link = (
          <Link
            asChild
            href={href}
            onPress={
              Platform.OS === 'web'
                ? undefined
                : (event) => {
                    // Keep the native preview target internal and confirm before opening the saved URL.
                    event.preventDefault();
                    requestOpenLink();
                  }
            }
          >
            <Link.Trigger>{contentTrigger}</Link.Trigger>
            {Platform.OS === 'ios' ? (
              <Link.Preview style={previewSize}>
                <SavedLinkPreviewContent link={item} width={previewSize.width} />
              </Link.Preview>
            ) : null}
            {Platform.OS === 'ios' ? (
              <Link.Menu>
                <Link.MenuAction
                  title={folderName ? 'Alterar pasta' : 'Adicionar à pasta'}
                  icon="folder"
                  onPress={withItemAuthorization('link', item.id, () => openAssignmentPicker('link', item.id))}
                />
                {folderName ? (
                  <Link.MenuAction
                    title="Remover da pasta"
                    icon="folder"
                    onPress={withItemAuthorization('link', item.id, () => assignItemToFolder('link', item.id, null))}
                  />
                ) : null}
                {renderFavoriteMenuAction('link', item.id)}
                {renderSavedTagSubmenu('link', item.id)}
                <Link.MenuAction title="Apagar link" icon="trash" destructive onPress={deleteItem} />
              </Link.Menu>
            ) : null}
          </Link>
        );
        return Platform.OS === 'ios' ? link : <NativeCardContextMenu actions={contextActions}>{link}</NativeCardContextMenu>;
      }

      const textPreviewSize = getSavedTextPreviewSize(screenWidth);

      const textLink = (
        <Link asChild href={href}>
          <Link.Trigger>{contentTrigger}</Link.Trigger>
          {Platform.OS === 'ios' ? (
            <Link.Preview style={textPreviewSize}>
              <SavedTextPreviewContent
                height={textPreviewSize.height}
                text={item.text}
                width={textPreviewSize.width}
              />
            </Link.Preview>
          ) : null}
          {Platform.OS === 'ios' ? (
            <Link.Menu>
              <Link.MenuAction
                title={folderName ? 'Alterar pasta' : 'Adicionar à pasta'}
                icon="folder"
                  onPress={withItemAuthorization('text', item.id, () => openAssignmentPicker('text', item.id))}
              />
              {folderName ? (
                <Link.MenuAction
                  title="Remover da pasta"
                  icon="folder"
                    onPress={withItemAuthorization('text', item.id, () => assignItemToFolder('text', item.id, null))}
                />
              ) : null}
              {renderFavoriteMenuAction('text', item.id)}
              {renderSavedTagSubmenu('text', item.id)}
              <Link.MenuAction title="Apagar texto" icon="trash" destructive onPress={deleteItem} />
            </Link.Menu>
          ) : null}
        </Link>
      );
      return Platform.OS === 'ios'
        ? textLink
        : <NativeCardContextMenu actions={contextActions}>{textLink}</NativeCardContextMenu>;
    },
    [
      isSingleLineView,
      isListView,
      isCompactListView,
      gridCardMetrics,
      gridCardMode,
      smallGridCardGlassColorScheme,
      listRowHeight,
      listThumbnailSize,
      prepareForMediaRemovalAnimation,
      assignItemToFolder,
      folderForItem,
      folderIdByItemKey,
      homeFolderContextActions,
      openAssignmentPicker,
      renderFavoriteMenuAction,
      renderSavedTagSubmenu,
      visibleTagDotsForItem,
      requestDeleteContent,
      authorizeItemForAction,
      resolvedMode,
      screenWidth,
      theme,
      withItemAuthorization,
      useLinkCardGlass,
    ],
  );

  const renderSavedDocumentItem = useCallback(
    (document: SavedDocument) => {
      const documentSize = formatDocumentSize(document.sizeBytes);
      const secondaryText = `${getDocumentTypeLabel(document.extension)}${documentSize ? ` · ${documentSize}` : ''}`;
      const folder = folderForItem('document', document.id);
      const folderName = folder?.name ?? null;
      const folderId = folderIdByItemKey.get(getHomeFolderItemKey('document', document.id)) ?? null;
      const deleteAction: NativeCardContextMenuAction = {
        id: 'delete-document',
        title: 'Apagar arquivo',
        systemImage: 'trash',
        destructive: true,
        onPress: withItemAuthorization(
          'document',
          document.id,
          () => requestDeleteDocument(
            document.id,
            prepareForMediaRemovalAnimation,
            () => authorizeItemForAction('document', document.id),
          ),
        ),
      };
      const contextActions = homeFolderContextActions('document', document.id, folderId, deleteAction);
      const trigger = isListView ? (
        <Pressable
          accessibilityLabel={`Abrir arquivo ${document.originalName}`}
          accessibilityRole="button"
          onPress={supportsNativeDocumentContextMenu ? undefined : openDocumentSafely(document)}
          style={
            isSingleLineView
              ? getSingleLineRowLayoutStyle(theme, listRowHeight)
              : StyleSheet.flatten([
                  getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
                  {
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: isCompactListView ? theme.spacing.xs : theme.spacing.sm,
                    paddingHorizontal: isCompactListView ? theme.spacing.xs : theme.spacing.md,
                    paddingVertical: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
                  },
                ])
          }
        >
          <SavedDocumentThumbnail
            borderRadius={isSingleLineView ? Math.min(theme.radius.md, listThumbnailSize * 0.2) : undefined}
            document={document}
            height={listThumbnailSize}
            width={listThumbnailSize}
          />
          {isSingleLineView ? (
            <>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={getSingleLineTitleTextStyle(theme, Boolean(folderName))}
              >
                {getHomeSingleLineTitle(document)}
              </Text>
              {folderName ? <HomeFolderIndicator maxWidth="28%" folderColor={folder?.color ?? null} name={folderName} /> : null}
              <HomeTagDots tags={visibleTagDotsForItem('document', document.id)} />
            </>
          ) : (
            <View style={{ flex: 1, gap: theme.spacing.xxs, justifyContent: 'center', minWidth: 0 }}>
              <Text
                ellipsizeMode="middle"
                numberOfLines={1}
                style={[
                  isCompactListView ? theme.typography.subheadline : theme.typography.headline,
                  { color: theme.colors.textPrimary },
                ]}
              >
                {document.originalName}
              </Text>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs, minWidth: 0 }}>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 1, maxWidth: folderName ? '56%' : undefined, minWidth: 0 }]}
                >
                  {secondaryText}
                </Text>
                {folderName ? <HomeFolderIndicator maxWidth="40%" folderColor={folder?.color ?? null} name={folderName} /> : null}
                <HomeTagDots tags={visibleTagDotsForItem('document', document.id)} />
              </View>
            </View>
          )}
        </Pressable>
      ) : gridCardMode && gridCardMetrics ? (
        <Pressable
          accessibilityLabel={`Abrir arquivo ${document.originalName}`}
          accessibilityRole="button"
          onPress={supportsNativeDocumentContextMenu ? undefined : openDocumentSafely(document)}
          style={getGridCardPressStyle(theme, gridCardMode, gridCardMetrics.width)}
        >
          <HomeGridCard
            folderColor={folder?.color ?? null} folderName={folderName}
            tagDots={visibleTagDotsForItem('document', document.id)}
            glassColorScheme={gridCardMode === 'small' ? smallGridCardGlassColorScheme : undefined}
            metadata={secondaryText}
            metrics={gridCardMetrics}
            mode={gridCardMode}
            preview={(
              <SavedDocumentThumbnail
                borderRadius={0}
                document={document}
                height={gridCardMetrics.previewHeight}
                width="100%"
              />
            )}
            title={document.originalName}
          />
        </Pressable>
      ) : null;

      if (!supportsNativeDocumentContextMenu) {
        return <NativeCardContextMenu actions={contextActions}>{trigger}</NativeCardContextMenu>;
      }

      const previewSize = getSavedTextPreviewSize(screenWidth);
      return (
        <Link
          asChild
          href={{ pathname: '/documents/[id]', params: { id: String(document.id) } }}
        >
          <Link.Trigger>{trigger}</Link.Trigger>
          <Link.Preview style={previewSize}>
            <SavedDocumentPreviewContent
              document={document}
              height={previewSize.height}
              width={previewSize.width}
            />
          </Link.Preview>
          <Link.Menu>
            <Link.MenuAction
              title={folderName ? 'Alterar pasta' : 'Adicionar à pasta'}
              icon="folder"
              onPress={withItemAuthorization('document', document.id, () => openAssignmentPicker('document', document.id))}
            />
            {folderName ? (
              <Link.MenuAction
                title="Remover da pasta"
                icon="folder"
                onPress={withItemAuthorization('document', document.id, () => assignItemToFolder('document', document.id, null))}
              />
            ) : null}
            {renderFavoriteMenuAction('document', document.id)}
            {renderSavedTagSubmenu('document', document.id)}
            <Link.MenuAction
              title="Apagar arquivo"
              icon="trash"
              destructive
              onPress={withItemAuthorization(
                'document',
                document.id,
                () => requestDeleteDocument(
                  document.id,
                  prepareForMediaRemovalAnimation,
                  () => authorizeItemForAction('document', document.id),
                ),
              )}
            />
          </Link.Menu>
        </Link>
      );
    },
    [
      isListView,
      isSingleLineView,
      assignItemToFolder,
      folderForItem,
      folderIdByItemKey,
      homeFolderContextActions,
      isCompactListView,
      gridCardMetrics,
      gridCardMode,
      smallGridCardGlassColorScheme,
      listRowHeight,
      listThumbnailSize,
      openDocumentSafely,
      prepareForMediaRemovalAnimation,
      requestDeleteDocument,
      authorizeItemForAction,
      openAssignmentPicker,
      renderFavoriteMenuAction,
      renderSavedTagSubmenu,
      visibleTagDotsForItem,
      screenWidth,
      supportsNativeDocumentContextMenu,
      theme,
      withItemAuthorization,
    ],
  );

  const renderSavedChecklistItem = useCallback(
    (checklist: SavedChecklistSummary) => {
      const folder = folderForItem('checklist', checklist.id);
      const folderName = folder?.name ?? null;
      const folderId = folderIdByItemKey.get(getHomeFolderItemKey('checklist', checklist.id)) ?? null;
      const checklistPreviewSize = getChecklistPreviewSize(
        screenWidth,
        checklist.previewTasks.length,
        checklist.totalTaskCount,
        fontScale,
        theme,
      );
      const canRevealChecklistPreview = folderId == null || (
        folder != null && (!folder.isProtected || (isAppActive && isFolderAuthorized(folder.id)))
      );
      const progress = checklist.totalTaskCount > 0
        ? `${checklist.completedTaskCount} de ${checklist.totalTaskCount} concluídas`
        : 'Nenhuma tarefa';
      const compactProgress = `${checklist.completedTaskCount}/${checklist.totalTaskCount}`;
      const iconSize = isSingleLineView ? 18 : 23;

      const deleteAction: NativeCardContextMenuAction = {
        id: 'delete-checklist',
        title: 'Apagar lista',
        systemImage: 'trash',
        destructive: true,
        onPress: () => Alert.alert(
          'Mover lista para Apagados recentemente?',
          'A lista e suas tarefas ficarão disponíveis para restauração por 30 dias.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Mover para apagados',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  const authorization = await authorizeChecklistDelete(checklist.id);
                  if (!authorization.authorized) return;
                  try {
                    const deleted = await deleteChecklist(checklist.id, authorization.folderId);
                    if (!deleted) throw new Error('CHECKLIST_NOT_FOUND');
                  } catch {
                    Alert.alert('Não foi possível apagar a lista', 'Tente novamente.');
                  }
                })();
              },
            },
          ],
        ),
      };
      const actions = homeFolderContextActions('checklist', checklist.id, folderId, deleteAction);

      const trigger = isSingleLineView ? (
        <Pressable
          accessibilityLabel={`Abrir lista ${checklist.title}, ${progress}`}
          accessibilityRole="button"
          onPress={Platform.OS === 'ios' ? undefined : () => router.push({ pathname: '/checklists/[id]', params: { id: String(checklist.id) } })}
          style={getSingleLineRowLayoutStyle(theme, listRowHeight)}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.separator,
              borderRadius: Math.min(theme.radius.md, listThumbnailSize * 0.2),
              borderWidth: StyleSheet.hairlineWidth,
              flexShrink: 0,
              height: listThumbnailSize,
              justifyContent: 'center',
              overflow: 'hidden',
              width: listThumbnailSize,
            }}
          >
            <Ionicons color={theme.colors.textSecondary} name="checkbox-outline" size={iconSize} />
          </View>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={getSingleLineTitleTextStyle(theme, Boolean(folderName))}
          >
            {checklist.title}
          </Text>
          {folderName ? <HomeFolderIndicator maxWidth="24%" folderColor={folder?.color ?? null} name={folderName} /> : null}
          <HomeTagDots tags={visibleTagDotsForItem('checklist', checklist.id)} />
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 0 }]}>
            {compactProgress}
          </Text>
        </Pressable>
      ) : isListView ? (
        <Pressable
          accessibilityLabel={`Abrir lista ${checklist.title}, ${progress}`}
          accessibilityRole="button"
          onPress={Platform.OS === 'ios' ? undefined : () => router.push({ pathname: '/checklists/[id]', params: { id: String(checklist.id) } })}
          style={StyleSheet.flatten([
            getListRowLayoutStyle(theme, listRowHeight, isCompactListView),
            {
              alignItems: 'center',
              flexDirection: 'row',
              gap: isCompactListView ? theme.spacing.xs : theme.spacing.sm,
              paddingHorizontal: isCompactListView ? theme.spacing.xs : theme.spacing.md,
              paddingVertical: isCompactListView ? theme.spacing.xxs : theme.spacing.xs,
            },
          ])}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.sm,
              flexShrink: 0,
              height: listThumbnailSize,
              justifyContent: 'center',
              width: listThumbnailSize,
            }}
          >
            <Ionicons color={theme.colors.textSecondary} name="checkbox-outline" size={iconSize} />
          </View>
          <View style={{ flex: 1, gap: theme.spacing.xxs, justifyContent: 'center', minWidth: 0 }}>
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[isCompactListView ? theme.typography.subheadline : theme.typography.headline, { color: theme.colors.textPrimary }]}
            >
              {checklist.title}
            </Text>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs, minWidth: 0 }}>
              <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, flexShrink: 0 }]}>
                {progress}
              </Text>
              {folderName ? <HomeFolderIndicator maxWidth="48%" folderColor={folder?.color ?? null} name={folderName} /> : null}
              <HomeTagDots tags={visibleTagDotsForItem('checklist', checklist.id)} />
            </View>
          </View>
        </Pressable>
      ) : gridCardMode && gridCardMetrics ? (
        <Pressable
          accessibilityLabel={`Abrir lista ${checklist.title}, ${progress}`}
          accessibilityRole="button"
          onPress={Platform.OS === 'ios' ? undefined : () => router.push({ pathname: '/checklists/[id]', params: { id: String(checklist.id) } })}
          style={getGridCardPressStyle(theme, gridCardMode, gridCardMetrics.width)}
        >
          <HomeGridCard
            detail={gridCardMode === 'large' ? checklist.previewTasks[0]?.text ?? null : null}
            folderColor={folder?.color ?? null} folderName={folderName}
            tagDots={visibleTagDotsForItem('checklist', checklist.id)}
            glassColorScheme={gridCardMode === 'small' ? smallGridCardGlassColorScheme : undefined}
            metadata={gridCardMode === 'small' ? compactProgress : `${compactProgress} concluídas`}
            metrics={gridCardMetrics}
            mode={gridCardMode}
            preview={(
              <Ionicons
                color={theme.colors.textSecondary}
                name="checkbox-outline"
                size={gridCardMode === 'small'
                  ? Math.min(gridCardMetrics.previewHeight * 0.56, 36)
                  : Math.min(gridCardMetrics.previewHeight * 0.44, 64)}
              />
            )}
            title={checklist.title}
          />
        </Pressable>
      ) : null;

      if (Platform.OS !== 'ios') {
        return <NativeCardContextMenu actions={actions}>{trigger}</NativeCardContextMenu>;
      }

      return (
        <Link asChild href={{ pathname: '/checklists/[id]', params: { id: String(checklist.id) } }}>
          <Link.Trigger>{trigger}</Link.Trigger>
          {canRevealChecklistPreview ? (
            <Link.Preview style={checklistPreviewSize}>
              <SavedChecklistPreviewContent
                checklist={checklist}
                height={checklistPreviewSize.height}
                width={checklistPreviewSize.width}
              />
            </Link.Preview>
          ) : null}
          <Link.Menu>
            <Link.MenuAction
              title={folderName ? 'Alterar pasta' : 'Adicionar à pasta'}
              icon="folder"
              onPress={withItemAuthorization('checklist', checklist.id, () => openAssignmentPicker('checklist', checklist.id))}
            />
            {folderName ? (
              <Link.MenuAction
                title="Remover da pasta"
                icon="folder"
                onPress={withItemAuthorization('checklist', checklist.id, () => assignItemToFolder('checklist', checklist.id, null))}
              />
            ) : null}
            {renderFavoriteMenuAction('checklist', checklist.id)}
            {renderSavedTagSubmenu('checklist', checklist.id)}
            <Link.MenuAction title="Apagar lista" icon="trash" destructive onPress={withItemAuthorization('checklist', checklist.id, deleteAction.onPress)} />
          </Link.Menu>
        </Link>
      );
    },
    [
      assignItemToFolder,
      authorizeChecklistDelete,
      deleteChecklist,
      folderIdByItemKey,
      folderForItem,
      homeFolderContextActions,
      isCompactListView,
      fontScale,
      gridCardMetrics,
      gridCardMode,
      smallGridCardGlassColorScheme,
      isListView,
      isSingleLineView,
      isAppActive,
      isFolderAuthorized,
      listRowHeight,
      listThumbnailSize,
      openAssignmentPicker,
      renderFavoriteMenuAction,
      renderSavedTagSubmenu,
      router,
      screenWidth,
      theme,
      withItemAuthorization,
      visibleTagDotsForItem,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: HomeGalleryEntry }) => {
      if (item.kind === 'day-separator') {
        return (
          <View style={{ paddingHorizontal: gridCardMode === 'small' ? theme.spacing.xs : theme.layout.screenHorizontalPadding, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textSecondary }]}>
              {item.title}
            </Text>
          </View>
        );
      }

      if ('mediaType' in item.content) return renderMediaItem(item.content);
      if (item.content.contentType === 'checklist') return renderSavedChecklistItem(item.content);
      if (item.content.contentType === 'document') return renderSavedDocumentItem(item.content);
      return renderSavedContentItem(item.content);
    },
    [gridCardMode, renderMediaItem, renderSavedChecklistItem, renderSavedContentItem, renderSavedDocumentItem, theme],
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
  const emptyMessage = searchQuery.trim()
    ? 'Nenhum resultado encontrado'
    : favoritesOnly
    ? 'Nenhum favorito ainda'
    : folderFilter.kind === 'folder'
      ? 'Nenhum item nesta pasta'
      : folderFilter.kind === 'unfiled'
        ? 'Nenhum item sem pasta'
        : 'Nenhum item salvo';

  return (
    <>
      <FlashList
        alwaysBounceVertical={Platform.OS === 'ios'}
        contentContainerStyle={galleryContentContainerStyle}
        data={entries}
        getItemType={getItemType}
        key={viewLayout.key}
        keyExtractor={(item) => item.id}
        ref={listRef}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={listHeaderStyle}
        ListEmptyComponent={
          isInitialFeedReady && homeFoldersReady ? (
            <View style={{ alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xxl }}>
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{emptyMessage}</Text>
            </View>
          ) : null
        }
        masonry={viewLayout.masonry}
        numColumns={viewLayout.numColumns}
        onLoad={handleListLoad}
        onScroll={handleScroll}
        optimizeItemArrangement={false}
        overrideItemLayout={overrideItemLayout}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        style={{ display: hidden ? 'none' : 'flex', flex: 1 }}
      />
      <HomeFolderAssignmentPicker
        currentFolderId={assignmentTarget?.currentFolderId ?? null}
        folders={folders}
        onClose={() => setAssignmentTarget(null)}
        onCreateFolder={() => {
          setAssignmentTarget(null);
          openFolderManager();
        }}
        onSelectFolder={chooseFolderFromPicker}
        visible={!hidden && assignmentTarget !== null && Platform.OS !== 'ios'}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setTagPickerTarget(null)}
        transparent
        visible={!hidden && tagPickerTarget !== null && Platform.OS !== 'ios'}
      >
        <View style={{ backgroundColor: theme.colors.overlay, flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, maxHeight: '75%', padding: theme.spacing.lg }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: theme.spacing.md }}>
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary, flex: 1 }]}>Etiquetas</Text>
              <Pressable accessibilityRole="button" onPress={() => setTagPickerTarget(null)}>
                <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Concluir</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: theme.spacing.xs }}>
              {savedTags.length === 0 ? (
                <Text style={[theme.typography.body, { color: theme.colors.textSecondary, paddingVertical: theme.spacing.md }]}>Nenhuma etiqueta criada</Text>
              ) : savedTags.map((savedTag) => {
                const isSelected = Boolean(tagPickerTarget && tagsForItem(tagPickerTarget.itemType, tagPickerTarget.itemId)
                  .some((assignment) => assignment.tagId === savedTag.id));
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    key={savedTag.id}
                    onPress={() => {
                      if (tagPickerTarget) void toggleSavedTag(tagPickerTarget, savedTag.id, isSelected);
                    }}
                    style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
                  >
                    <View style={{ backgroundColor: getAccentColorTokens(savedTag.color, resolvedMode).primary, borderRadius: 6, height: 12, width: 12 }} />
                    <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>{savedTag.name}</Text>
                    <Ionicons color={isSelected ? theme.colors.primary : theme.colors.textTertiary} name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={20} />
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setTagPickerTarget(null);
                  openTagManager();
                }}
                style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
              >
                <Ionicons color={theme.colors.primary} name="settings-outline" size={18} />
                <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Gerenciar etiquetas</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
