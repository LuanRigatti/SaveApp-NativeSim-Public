import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';

import { PhotoMasonryGallery } from '@/components/photos/PhotoMasonryGallery';
import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { areHomeFeedSourcesReady } from '@/features/home-content/homeFeed';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { useHomeFavorites } from '@/features/home-content/HomeFavoritesProvider';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { useLocalDocumentLibrary } from '@/features/documents/LocalDocumentLibraryProvider';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { useHomeFolderAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function HomeFolderScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawFolderId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const { media, isReady: photoLibraryReady } = useLocalPhotoLibrary();
  const { contents, isReady: savedContentReady } = useLocalSavedContent();
  const { checklists, isReady: checklistLibraryReady } = useLocalChecklists();
  const { documents, isReady: documentLibraryReady } = useLocalDocumentLibrary();
  const { isReady: viewModeReady } = useHomeViewMode();
  const { favoriteKeys } = useHomeFavorites();
  const { folders, isReady: homeFoldersReady } = useLocalHomeFolders();
  const authorization = useHomeFolderAuthorization(rawFolderId ?? null);
  const folder = folders.find((item) => item.id === rawFolderId);
  const hasReturnedToHomeRef = useRef(false);
  const homeFeedReady = areHomeFeedSourcesReady({
    photoLibraryReady,
    savedContentReady,
    documentLibraryReady,
    checklistLibraryReady,
    viewModeReady,
    homeFoldersReady,
  });
  const folderFilter = useMemo(
    () => rawFolderId
      ? { kind: 'folder' as const, folderId: rawFolderId }
      : { kind: 'unfiled' as const },
    [rawFolderId],
  );

  useEffect(() => {
    if (!homeFoldersReady) return;
    if (folder) {
      hasReturnedToHomeRef.current = false;
      return;
    }
    if (hasReturnedToHomeRef.current) return;

    hasReturnedToHomeRef.current = true;
    router.dismissTo('/');
  }, [folder, homeFoldersReady, router]);

  const folderTitle = folder?.name ?? 'Pasta';

  return (
    <>
      <Stack.Screen
        options={{
          animation: 'default',
          gestureEnabled: true,
          headerLargeTitle: false,
          headerShadowVisible: false,
          headerTitle: '',
          headerTransparent: true,
          presentation: 'card',
        }}
      >
        <Stack.Screen.BackButton displayMode="minimal" />
      </Stack.Screen>
      {folder && authorization.isAuthorized ? (
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle={folderTitle}
          contentGap={theme.spacing.md}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={2}
                style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}
              >
                {folderTitle}
              </Text>
            </View>
          }
          nativeHeader
          renderScrollableContent={(scrollProps) => (
            <PhotoMasonryGallery
              {...scrollProps}
              contents={contents}
              checklists={checklists}
              documents={documents}
              folderFilter={folderFilter}
              favoriteKeys={favoriteKeys}
              favoritesOnly={false}
              isInitialFeedReady={homeFeedReady}
              media={media}
              revealSavedTextId={null}
            />
          )}
          scrollContentContainerStyle={{
            paddingBottom: insets.bottom + theme.spacing.xxl,
            paddingHorizontal: 0,
          }}
        >
          {null}
        </ProgressiveCollapsibleScreen>
      </View>
      ) : (
        <HomeFolderAuthorizationPrompt authorization={authorization} />
      )}
    </>
  );
}
