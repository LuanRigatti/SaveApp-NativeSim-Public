import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from 'expo-image';
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { useHomeFolderItemAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { createVideoViewerCloseHandler } from '@/features/photos/videoPlayerNavigation';
import type { SavedVideo } from '@/features/photos/photoTypes';

export default function VideoViewerScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const parsedId = Number(id);
  const videoId = Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const authorization = useHomeFolderItemAuthorization('video', videoId);

  if (!authorization.isAuthorized) {
    return <HomeFolderAuthorizationPrompt authorization={authorization} />;
  }
  return <VideoViewerContent id={id ?? ''} />;
}

function VideoViewerContent({ id }: { id: string }) {
  const router = useRouter();
  const { getVideo, media } = useLocalPhotoLibrary();
  const videoId = Number(id);
  const videoFromGallery = useMemo(
    () =>
      media.find(
        (item): item is SavedVideo =>
          item.mediaType === 'video' && item.id === videoId,
      ) ?? null,
    [media, videoId],
  );
  const [loadedVideo, setLoadedVideo] = useState<{ id: string; video: SavedVideo | null } | null>(null);
  const video = loadedVideo?.id === id ? loadedVideo.video : videoFromGallery;
  const [firstFrameVideoUri, setFirstFrameVideoUri] = useState<string | null>(null);
  const supportsAppleZoom = Platform.OS === 'ios' && Number(Platform.Version) >= 18;
  const player = useVideoPlayer(video?.uri ?? null, (createdPlayer) => {
    createdPlayer.loop = false;
    createdPlayer.staysActiveInBackground = false;
  });
  const closeVideo = useMemo(
    () =>
      createVideoViewerCloseHandler({
        back: () => router.back(),
        canGoBack: () => router.canGoBack(),
        pause: () => player.pause(),
        replaceHome: () => router.replace('/'),
      }),
    [player, router],
  );

  useEffect(() => {
    let isActive = true;

    if (!videoFromGallery && Number.isSafeInteger(videoId) && videoId > 0) {
      void getVideo(videoId).then((savedVideo) => {
        if (isActive) {
          setLoadedVideo({ id, video: savedVideo });
        }
      });
    }

    return () => {
      isActive = false;
    };
  }, [getVideo, id, videoFromGallery, videoId]);

  const handleFirstFrameRender = useCallback(() => {
    if (video) {
      setFirstFrameVideoUri(video.uri);
    }
  }, [video]);

  const videoSurface = video ? (
    <View style={{ backgroundColor: '#000000', flex: 1, overflow: 'hidden' }}>
      <VideoView
        accessibilityLabel="Reprodutor de vídeo salvo"
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: false }}
        onFirstFrameRender={handleFirstFrameRender}
        player={player}
        style={{ flex: 1, width: '100%' }}
      />
      {video.thumbnailUri && firstFrameVideoUri !== video.uri ? (
        <Image
          accessibilityElementsHidden
          contentFit="contain"
          pointerEvents="none"
          source={{ uri: video.thumbnailUri }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  ) : null;

  useFocusEffect(
    useCallback(() => {
      return () => player.pause();
    }, [player]),
  );

  return (
    <View style={{ backgroundColor: '#000000', flex: 1 }}>
      <StatusBar style="light" />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel="Fechar vídeo"
            icon="xmark"
            onPress={closeVideo}
          />
        </Stack.Toolbar>
      ) : null}
      {video ? (
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={{ backgroundColor: '#000000', flex: 1 }}
        >
          {videoSurface && supportsAppleZoom ? (
            <Link.AppleZoomTarget>{videoSurface}</Link.AppleZoomTarget>
          ) : (
            videoSurface
          )}
        </SafeAreaView>
      ) : null}
    </View>
  );
}
