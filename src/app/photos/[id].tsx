import { Image } from 'expo-image';
import {
  Link,
  Stack,
  useIsFocused,
  useIsPreview,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PhotoViewerCloseButton from '@/components/photos/PhotoViewerCloseButton';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { createPhotoViewerCloseHandler } from '@/features/photos/photoViewerNavigation';
import {
  isPhotoViewerZoomed,
  PHOTO_VIEWER_MAX_ZOOM_SCALE,
} from '@/features/photos/photoViewerZoom';
import type { SavedPhoto } from '@/features/photos/photoTypes';
import { useAppTheme } from '@/theme';

export default function PhotoViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isPreview = useIsPreview();

  return isPreview ? (
    <PhotoViewerPreviewScreen id={id} />
  ) : (
    <InteractivePhotoViewerScreen id={id} />
  );
}

function useSavedPhoto(id: string): SavedPhoto | null {
  const { getPhoto } = useLocalPhotoLibrary();
  const [loadedPhoto, setLoadedPhoto] = useState<{ id: string; photo: SavedPhoto | null } | null>(
    null,
  );

  useEffect(() => {
    let isActive = true;
    const photoId = Number(id);

    if (Number.isSafeInteger(photoId) && photoId > 0) {
      void getPhoto(photoId).then((savedPhoto) => {
        if (isActive) {
          setLoadedPhoto({ id, photo: savedPhoto });
        }
      });
    }

    return () => {
      isActive = false;
    };
  }, [getPhoto, id]);

  return loadedPhoto?.id === id ? loadedPhoto.photo : null;
}

function PhotoViewerImage({ photo }: { photo: SavedPhoto | null }) {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const imageSize = useMemo(() => {
    if (!photo || photo.width <= 0 || photo.height <= 0) {
      return { width: screenWidth, height: screenHeight };
    }

    const imageAspectRatio = photo.width / photo.height;
    const screenAspectRatio = screenWidth / screenHeight;
    return imageAspectRatio > screenAspectRatio
      ? { width: screenWidth, height: screenWidth / imageAspectRatio }
      : { width: screenHeight * imageAspectRatio, height: screenHeight };
  }, [photo, screenHeight, screenWidth]);

  return photo ? (
    <Image
      accessibilityLabel="Foto em tela cheia"
      contentFit="contain"
      source={{ uri: photo.uri }}
      style={{ height: imageSize.height, width: imageSize.width }}
    />
  ) : null;
}

function PhotoViewerPreviewScreen({ id }: { id: string }) {
  const photo = useSavedPhoto(id);
  const { theme } = useAppTheme();

  return (
    <View
      accessibilityViewIsModal
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        flex: 1,
        justifyContent: 'center',
      }}
    >
      <PhotoViewerImage photo={photo} />
    </View>
  );
}

function InteractivePhotoViewerScreen({ id }: { id: string }) {
  const router = useRouter();
  const photo = useSavedPhoto(id);
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [zoomStatus, setZoomStatus] = useState({ id, isZoomed: false });
  const zoomStatusRef = useRef(zoomStatus);
  const supportsAppleZoom = Platform.OS === 'ios' && Number(Platform.Version) >= 18;
  const isImageZoomed = zoomStatus.id === id && zoomStatus.isZoomed;

  const screenOptions = useMemo(
    () => ({ gestureEnabled: !isImageZoomed, headerShown: false }),
    [isImageZoomed],
  );

  const handlePhotoZoomScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!isFocused) {
        return;
      }

      const nextIsZoomed = isPhotoViewerZoomed(event.nativeEvent.zoomScale ?? 1);
      const currentIsZoomed =
        zoomStatusRef.current.id === id && zoomStatusRef.current.isZoomed;

      if (currentIsZoomed !== nextIsZoomed) {
        const nextStatus = { id, isZoomed: nextIsZoomed };
        zoomStatusRef.current = nextStatus;
        setZoomStatus(nextStatus);
      }
    },
    [id, isFocused],
  );
  const closePhoto = useMemo(
    () =>
      createPhotoViewerCloseHandler({
        back: () => router.back(),
        canGoBack: () => router.canGoBack(),
        replaceHome: () => router.replace('/'),
      }),
    [router],
  );

  const image = <PhotoViewerImage photo={photo} />;
  const zoomableImage = supportsAppleZoom && photo ? (
    <Link.AppleZoomTarget>{image}</Link.AppleZoomTarget>
  ) : (
    image
  );

  return (
    <View
      accessibilityViewIsModal
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        flex: 1,
        justifyContent: 'center',
      }}
    >
      <Stack.Screen options={screenOptions} />
      {Platform.OS === 'ios' && zoomableImage ? (
        <ScrollView
          key={id}
          alwaysBounceHorizontal={false}
          alwaysBounceVertical={false}
          automaticallyAdjustContentInsets={false}
          bounces={false}
          bouncesZoom={false}
          centerContent
          contentContainerStyle={{
            alignItems: 'center',
            flexGrow: 1,
            justifyContent: 'center',
          }}
          maximumZoomScale={PHOTO_VIEWER_MAX_ZOOM_SCALE}
          minimumZoomScale={1}
          onScroll={handlePhotoZoomScroll}
          pinchGestureEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, width: '100%' }}
        >
          {zoomableImage}
        </ScrollView>
      ) : (
        zoomableImage
      )}
      <PhotoViewerCloseButton
        onPress={closePhoto}
        style={{
          left: insets.left + theme.spacing.md,
          position: 'absolute',
          top: insets.top + theme.spacing.sm,
          zIndex: 1,
        }}
      />
    </View>
  );
}
