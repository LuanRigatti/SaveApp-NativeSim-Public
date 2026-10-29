import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { HomeContentComposer, type HomeComposerKind } from '@/components/homeContent/HomeContentComposer';
import { PhotoMasonryGallery } from '@/components/photos/PhotoMasonryGallery';
import { ProgressiveBlur, ProgressiveCollapsibleScreen } from '@/components/premium';
import { getProgressiveBlurOverlayColors } from '@/components/ui/progressive-blur';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { useHomeSearch } from '@/features/home-content/HomeSearchProvider';
import { supportsNativeHomeSearch } from '@/features/home-content/homeSearch';
import { useHomeFavorites } from '@/features/home-content/HomeFavoritesProvider';
import { getHomeTitleForFavorites } from '@/features/home-content/homeFavorites';
import { TEXT_COMPOSER_ROUTE } from '@/features/home-content/textComposerNavigation';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { areHomeFeedSourcesReady } from '@/features/home-content/homeFeed';
import { prepareClipboardLinkCandidate } from '@/features/home-content/clipboardLinkOffer';
import {
  beginDynamicIslandClipboardFlow,
  suppressClipboardLinkOfferForChangeCount,
  suppressClipboardLinkOfferUntilClipboardChanges,
  useClipboardLinkOffer,
} from '@/features/home-content/useClipboardLinkOffer';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { useLocalDocumentLibrary } from '@/features/documents/LocalDocumentLibraryProvider';
import HomeFolderFilterButton from '@/features/home-folders/HomeFolderFilterButton';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import {
  getHomeFolderHomeTitle,
  getHomeFolderItemFilterForSelection,
} from '@/features/home-folders/homeFolderTypes';
import { HomeFolderOverview } from '@/features/home-folders/HomeFolderOverview';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { getHomeFolderRoute } from '@/features/home-folders/homeFolderNavigation';
import { useHomeFolderAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';
import {
  getClipboardURLDetectionSnapshot,
  recordSaveAppDiagnosticEvent,
} from '../../../modules/clipboard-url-detection/src';

export default function HomeScreen() {
  const { resolvedMode, theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ source?: string | string[] }>();
  const routeSource = Array.isArray(routeParams.source) ? routeParams.source[0] : routeParams.source;
  const isDynamicIslandExpandedHomeFlow = routeSource === 'dynamic-island-expanded';
  const {
    media,
    isReady: photoLibraryReady,
    hasCatalogLoadSucceeded: photoCatalogLoadSucceeded,
    importMediaFromPhotoLibrary,
  } = useLocalPhotoLibrary();
  const {
    contents,
    isReady: savedContentReady,
    hasCatalogLoadSucceeded: savedContentLoadSucceeded,
    refresh: refreshSavedContent,
    consumePendingTextReveal,
  } = useLocalSavedContent();
  const {
    checklists,
    isReady: checklistLibraryReady,
    hasCatalogLoadSucceeded: checklistCatalogLoadSucceeded,
  } = useLocalChecklists();
  const {
    documents,
    isReady: documentLibraryReady,
    hasCatalogLoadSucceeded: documentCatalogLoadSucceeded,
    importDocumentsFromPicker,
  } = useLocalDocumentLibrary();
  const [revealSavedTextId, setRevealSavedTextId] = useState<number | null>(null);
  const { searchQuery } = useHomeSearch();
  const [composerKind, setComposerKind] = useState<HomeComposerKind>(null);
  const [composerInitialLink, setComposerInitialLink] = useState<string | null>(null);
  const [isClipboardResultAlertActive, setIsClipboardResultAlertActive] = useState(false);
  const [isExternalPickerActive, setIsExternalPickerActive] = useState(false);
  const { isReady: viewModeReady } = useHomeViewMode();
  const {
    authorizeFolder,
    folders,
    isAppActive,
    isFolderAuthorized,
    isReady: homeFoldersReady,
    selectView,
    selection,
    view,
  } = useLocalHomeFolders();
  const {
    consumePendingFolderOpen,
    hasPendingFolderOpen,
    isSettingsSheetPresented,
    pendingFolderOpenSignal,
  } = useHomeSettingsSheet();
  const [revealNewestSignal, setRevealNewestSignal] = useState(0);
  const { favoriteKeys, favoritesOnly } = useHomeFavorites();
  const homeTitle = getHomeTitleForFavorites(getHomeFolderHomeTitle(selection, folders), favoritesOnly);
  const selectedFolderId = selection.kind === 'folder' ? selection.folderId : null;
  const selectedFolderAuthorization = useHomeFolderAuthorization(selectedFolderId);
  const isSelectedProtectedFolderLocked = selectedFolderAuthorization.isProtected &&
    !selectedFolderAuthorization.isAuthorized;
  const lastCatalogIdsRef = useRef<Set<string> | null>(null);
  const catalogIds = useMemo(
    () => new Set([
      ...media.map((item) => `${item.mediaType}:${item.id}`),
      ...contents.map((item) => `${item.contentType}:${item.id}`),
      ...documents.map((item) => `document:${item.id}`),
      ...checklists.map((item) => `checklist:${item.id}`),
    ]),
    [checklists, contents, documents, media],
  );
  const folderFilter = useMemo(
    () => favoritesOnly ? { kind: 'all-items' as const } : getHomeFolderItemFilterForSelection(selection),
    [favoritesOnly, selection],
  );
  const homeFeedReady = areHomeFeedSourcesReady({
    photoLibraryReady,
    savedContentReady,
    documentLibraryReady,
    checklistLibraryReady,
    viewModeReady,
    homeFoldersReady,
  });
  const homeCatalogsLoadedSuccessfully = photoCatalogLoadSucceeded &&
    savedContentLoadSucceeded &&
    documentCatalogLoadSucceeded &&
    checklistCatalogLoadSucceeded;

  const openPendingFolder = useCallback(() => {
    const folderId = consumePendingFolderOpen();
    if (!folderId) return;
    void (async () => {
      const outcome = await authorizeFolder(folderId);
      if (outcome === 'authenticated' && isFolderAuthorized(folderId)) {
        router.push(getHomeFolderRoute(folderId));
      }
    })();
  }, [authorizeFolder, consumePendingFolderOpen, isFolderAuthorized, router]);

  const runExternalPicker = useCallback(async (picker: () => Promise<unknown>) => {
    setIsExternalPickerActive(true);
    try {
      await picker();
    } finally {
      setIsExternalPickerActive(false);
    }
  }, []);

  const handleClipboardLinkCandidate = useCallback((clipboardText: string) => {
    const savedNormalizedURLs = new Set(
      contents.flatMap((content) => content.contentType === 'link' ? [content.normalizedUrl] : []),
    );
    const candidate = prepareClipboardLinkCandidate(clipboardText, savedNormalizedURLs);
    if (candidate.status === 'empty') {
      recordSaveAppDiagnosticEvent('clipboard.offer.read_empty');
      return;
    }
    if (candidate.status === 'invalid') {
      recordSaveAppDiagnosticEvent('clipboard.offer.candidate_invalid');
      setIsClipboardResultAlertActive(true);
      Alert.alert('Link inválido', 'Copie um endereço HTTP ou HTTPS para adicioná-lo ao SaveApp.', [
        { text: 'OK', onPress: () => setIsClipboardResultAlertActive(false) },
      ]);
      return;
    }
    if (candidate.status === 'duplicate') {
      recordSaveAppDiagnosticEvent('clipboard.offer.candidate_duplicate');
      setIsClipboardResultAlertActive(true);
      Alert.alert('Link já salvo', 'Este link já está na sua biblioteca.', [
        { text: 'OK', onPress: () => setIsClipboardResultAlertActive(false) },
      ]);
      return;
    }

    recordSaveAppDiagnosticEvent('clipboard.offer.candidate_received');
    setComposerInitialLink(candidate.normalizedURL);
    setComposerKind('link');
  }, [contents]);

  useFocusEffect(
    useCallback(() => {
      recordSaveAppDiagnosticEvent('navigation.home.focused');
      if (favoritesOnly) {
        recordSaveAppDiagnosticEvent('home.filter.favorites');
      } else if (selection.kind === 'folder') {
        recordSaveAppDiagnosticEvent('home.filter.folder');
      } else {
        recordSaveAppDiagnosticEvent('home.filter.all');
      }
      if (!isDynamicIslandExpandedHomeFlow) return undefined;

      recordSaveAppDiagnosticEvent('navigation.home.expanded_deep_link_received');
      const releaseExplicitClipboardFlow = beginDynamicIslandClipboardFlow();
      let didLoseFocus = false;
      void getClipboardURLDetectionSnapshot()
        .then((snapshot) => {
          if (didLoseFocus) return;
          if (snapshot) {
            suppressClipboardLinkOfferForChangeCount(snapshot.changeCount);
            recordSaveAppDiagnosticEvent('navigation.home.clipboard_suppressed');
          } else {
            suppressClipboardLinkOfferUntilClipboardChanges();
            recordSaveAppDiagnosticEvent('navigation.home.clipboard_suppressed');
          }
        })
        .catch(() => {
          if (!didLoseFocus) {
            suppressClipboardLinkOfferUntilClipboardChanges();
            recordSaveAppDiagnosticEvent('navigation.home.clipboard_suppression_failed');
          }
        })
        .finally(() => {
          if (didLoseFocus) return;
          releaseExplicitClipboardFlow();
          router.replace('/');
        });

      return () => {
        didLoseFocus = true;
        releaseExplicitClipboardFlow();
      };
    }, [favoritesOnly, isDynamicIslandExpandedHomeFlow, router, selection.kind]),
  );

  const canOfferClipboardLink = homeFeedReady &&
    isAppActive &&
    !isDynamicIslandExpandedHomeFlow &&
    composerKind == null &&
    !isClipboardResultAlertActive &&
    !isSettingsSheetPresented &&
    !hasPendingFolderOpen &&
    !isExternalPickerActive &&
    !isSelectedProtectedFolderLocked &&
    selectedFolderAuthorization.status !== 'requesting';

  useClipboardLinkOffer({
    enabled: Platform.OS === 'ios',
    canPresent: canOfferClipboardLink,
    onSaveCandidate: handleClipboardLinkCandidate,
  });

  const openLinkComposer = useCallback(() => {
    setComposerInitialLink(null);
    setComposerKind('link');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshSavedContent('home_focus');
      const savedTextId = consumePendingTextReveal();
      if (savedTextId != null) setRevealSavedTextId(savedTextId);
      openPendingFolder();
    }, [consumePendingTextReveal, openPendingFolder, refreshSavedContent]),
  );

  useEffect(() => {
    if (pendingFolderOpenSignal > 0) openPendingFolder();
  }, [openPendingFolder, pendingFolderOpenSignal]);

  useEffect(() => {
    if (!homeFeedReady) return;
    const previousIds = lastCatalogIdsRef.current;
    lastCatalogIdsRef.current = catalogIds;
    if (!previousIds || view !== 'folders') return;

    const hasNewItem = [...catalogIds].some((itemKey) => !previousIds.has(itemKey));
    if (!hasNewItem) return;

    selectView('all-items');
    setRevealNewestSignal((current) => current + 1);
  }, [catalogIds, homeFeedReady, selectView, view]);

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="bottom">
          {supportsNativeHomeSearch(Platform.OS, Platform.Version) ? (
            <Stack.Toolbar.SearchBarSlot
              hidden={view === 'folders' && !favoritesOnly}
            />
          ) : null}
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Menu
            accessibilityLabel="Adicionar"
            icon="plus"
            separateBackground
          >
            <Stack.Toolbar.MenuAction
              icon="photo.on.rectangle.angled"
              onPress={() => void runExternalPicker(importMediaFromPhotoLibrary)}
            >
              Adicionar mídia
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="link" onPress={openLinkComposer}>
              Adicionar link
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="text.alignleft"
              onPress={() => router.push(TEXT_COMPOSER_ROUTE)}
            >
              Adicionar texto
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="doc" onPress={() => void runExternalPicker(importDocumentsFromPicker)}>
              Adicionar arquivos
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="checklist"
              onPress={() => router.push('/checklists/compose')}
            >
              Adicionar lista
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle={homeTitle}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          fixedContent={
            Platform.OS === 'ios' ? (
              <ProgressiveBlur
                edge="bottom"
                height={
                  insets.bottom +
                  theme.sizes.touchTargetMinimum +
                  theme.spacing.lg
                }
                intensity={15}
                layers={1}
                overlayColors={getProgressiveBlurOverlayColors(theme.colors.background, 'bottom')}
                style={{ bottom: 0 }}
                tint={
                  resolvedMode === 'dark'
                    ? 'systemUltraThinMaterialDark'
                    : 'systemUltraThinMaterialLight'
                }
              />
            ) : null
          }
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  theme.typography.largeTitle,
                  {
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.largeTitle.fontSize + 2,
                  },
                ]}
              >
                {homeTitle}
              </Text>
            </View>
          }
          fixedLargeTitleAccessory={Platform.OS === 'ios' ? null : <HomeFolderFilterButton />}
          nativeTabRoot
          contentGap={theme.spacing.md}
          renderScrollableContent={(scrollProps) => (
            <>
              <View style={{ display: view === 'folders' && !favoritesOnly ? 'none' : 'flex', flex: 1 }}>
                <PhotoMasonryGallery
                  {...scrollProps}
                  contents={contents}
                  checklists={checklists}
                  documents={documents}
                  folderFilter={folderFilter}
                  favoriteKeys={favoriteKeys}
                  favoritesOnly={favoritesOnly}
                  hidden={(view === 'folders' && !favoritesOnly) || (!favoritesOnly && isSelectedProtectedFolderLocked)}
                  isInitialFeedReady={homeFeedReady}
                  homeCatalogsLoadedSuccessfully={homeCatalogsLoadedSuccessfully}
                  media={media}
                  revealNewestSignal={revealNewestSignal}
                  revealSavedTextId={revealSavedTextId}
                  searchQuery={searchQuery}
                />
                {isSelectedProtectedFolderLocked ? (
                  <View
                    accessibilityViewIsModal
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: theme.colors.background, zIndex: 2 },
                    ]}
                  >
                    <HomeFolderAuthorizationPrompt authorization={selectedFolderAuthorization} />
                  </View>
                ) : null}
              </View>
              <HomeFolderOverview
                {...scrollProps}
                folders={folders}
                hidden={view !== 'folders' || favoritesOnly}
                isReady={homeFoldersReady}
              />
            </>
          )}
          scrollContentContainerStyle={{
            paddingBottom: insets.bottom + theme.sizes.touchTargetMinimum + theme.spacing.md,
            paddingHorizontal: 0,
          }}
        >
          {null}
        </ProgressiveCollapsibleScreen>
      </View>
      <HomeContentComposer
        kind={composerKind}
        initialLink={composerInitialLink}
        onClose={() => {
          setComposerKind(null);
          setComposerInitialLink(null);
        }}
      />
    </>
  );
}
