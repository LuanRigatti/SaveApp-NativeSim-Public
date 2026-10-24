import * as ImagePicker from 'expo-image-picker';
import { Asset, getPermissionsAsync, MediaSubtype } from 'expo-media-library';
import { Alert, Platform } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  deleteSavedPhoto,
  deleteSavedMedia,
  getSavedVideo,
  getSavedPhoto,
  importSelectedPhotos,
  importSelectedVideos,
  listSavedMedia,
  updateSavedPhotoTitle,
} from './photoLibrary';
import { isStillImageAsset } from './photoImportPipeline';
import { removeSavedMediaById } from './photoGalleryState';
import { requestConfirmedPhotoDeletion } from './photoDeletionPipeline';
import { isVideoAsset } from './videoImportPipeline';
import {
  createPhotoRenamePromptButtons,
  renamePhotoWithPersistence,
} from './photoRenamePipeline';
import { getPhotoDisplayTitle } from './photoTitle';
import {
  createExistingPermissionPhotoSubtypeReader,
  resolvePhotoScreenshotClassification,
} from './photoScreenshotDetection';
import type { PhotoImportAsset, SavedMedia, SavedPhoto, SavedVideo, VideoImportAsset } from './photoTypes';

type PhotoLibraryContextValue = {
  media: SavedMedia[];
  isReady: boolean;
  importFromPhotoLibrary: () => Promise<void>;
  importVideosFromPhotoLibrary: () => Promise<void>;
  requestDeleteMedia: (
    id: number,
    mediaType: 'photo' | 'video',
    prepareForRemovalAnimation?: () => void,
  ) => void;
  requestRenamePhoto: (photo: SavedPhoto) => void;
  getPhoto: (id: number) => Promise<SavedPhoto | null>;
  getVideo: (id: number) => Promise<SavedVideo | null>;
};

const PhotoLibraryContext = createContext<PhotoLibraryContextValue | null>(null);

export function LocalPhotoLibraryProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<SavedMedia[]>([]);
  const [isReady, setIsReady] = useState(false);
  const initializationRef = useRef<Promise<void> | null>(null);
  const isImportingRef = useRef(false);

  const initialize = useCallback((): Promise<void> => {
    if (!initializationRef.current) {
      initializationRef.current = listSavedMedia()
        .then(setMedia)
        .catch((error: unknown) => {
          initializationRef.current = null;
          throw error;
        })
        .finally(() => setIsReady(true));
    }

    return initializationRef.current;
  }, []);

  useEffect(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  const getPhoto = useCallback(
    async (id: number) => {
      try {
        await initialize();
        return await getSavedPhoto(id);
      } catch {
        return null;
      }
    },
    [initialize],
  );

  const getVideo = useCallback(
    async (id: number) => {
      try {
        await initialize();
        return await getSavedVideo(id);
      } catch {
        return null;
      }
    },
    [initialize],
  );

  const importFromPhotoLibrary = useCallback(async () => {
    if (isImportingRef.current) {
      return;
    }

    isImportingRef.current = true;

    try {
      await initialize();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 0,
        orderedSelection: true,
        allowsEditing: false,
        quality: 1,
        exif: false,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const selectedImages = result.assets.filter((asset) =>
        isStillImageAsset(asset as PhotoImportAsset),
      );
      if (selectedImages.length === 0) {
        return;
      }

      const screenshotReader = await createExistingPermissionPhotoSubtypeReader(
        Platform.OS,
        async () => (await getPermissionsAsync(false)).granted,
        async (assetReference) => new Asset(assetReference).getMediaSubtypes(),
      );
      const photosWithClassification = await Promise.all(
        (selectedImages as PhotoImportAsset[]).map(async (asset) => ({
          ...asset,
          isScreenshot: await resolvePhotoScreenshotClassification(
            asset,
            screenshotReader,
            MediaSubtype.SCREENSHOT,
          ),
        })),
      );

      await importSelectedPhotos(photosWithClassification);
      setMedia(await listSavedMedia());
    } catch {
      // Picker and per-photo errors leave the existing local library available.
    } finally {
      isImportingRef.current = false;
    }
  }, [initialize]);

  const importVideosFromPhotoLibrary = useCallback(async () => {
    if (isImportingRef.current) {
      return;
    }

    isImportingRef.current = true;
    try {
      await initialize();

      if (Platform.OS === 'ios') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
        if (!permission.granted) {
          Alert.alert(
            'Acesso aos vídeos necessário',
            'Permita o acesso à fototeca para que o SaveApp possa copiar os vídeos selecionados para a galeria local.',
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: true,
        selectionLimit: 0,
        orderedSelection: true,
        allowsEditing: false,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        exif: false,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const selectedVideos = result.assets.filter((asset) =>
        isVideoAsset(asset as VideoImportAsset),
      ) as VideoImportAsset[];
      if (selectedVideos.length === 0) {
        Alert.alert('Nenhum vídeo compatível', 'Selecione vídeos em um formato compatível.');
        return;
      }

      const importResult = await importSelectedVideos(selectedVideos);
      setMedia(await listSavedMedia());

      if (importResult.failedCount > 0) {
        Alert.alert(
          importResult.videos.length > 0 ? 'Importação parcial' : 'Não foi possível importar os vídeos',
          importResult.videos.length > 0
            ? `${importResult.videos.length} vídeo(s) foram salvos. ${importResult.failedCount} não puderam ser adicionados. Verifique o formato e o espaço disponível no iPhone.`
            : 'Os vídeos selecionados não puderam ser adicionados. Verifique o formato e o espaço disponível no iPhone.',
        );
      }
    } catch {
      Alert.alert(
        'Não foi possível adicionar vídeos',
        'O SaveApp não conseguiu ler ou salvar os vídeos selecionados. Tente novamente.',
      );
    } finally {
      isImportingRef.current = false;
    }
  }, [initialize]);

  const requestDeleteMedia = useCallback((
    id: number,
    mediaType: 'photo' | 'video',
    prepareForRemovalAnimation?: () => void,
  ) => {
    void requestConfirmedPhotoDeletion(id, {
      confirm: () =>
        new Promise<boolean>((resolve) => {
          let didResolve = false;
          const finish = (confirmed: boolean) => {
            if (didResolve) {
              return;
            }
            didResolve = true;
            resolve(confirmed);
          };

          Alert.alert(
            mediaType === 'video' ? 'Apagar vídeo?' : 'Apagar imagem?',
            mediaType === 'video'
              ? 'O vídeo será removido somente do SaveApp. O original continuará na galeria do iPhone.'
              : 'A imagem será removida somente do SaveApp. A foto original continuará na galeria do iPhone.',
            [
              { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
              {
                text: mediaType === 'video' ? 'Apagar vídeo' : 'Apagar imagem',
                style: 'destructive',
                onPress: () => finish(true),
              },
            ],
            { cancelable: true, onDismiss: () => finish(false) },
          );
        }),
      deletePhoto: () => (mediaType === 'video' ? deleteSavedMedia(id) : deleteSavedPhoto(id)),
      onDeleted: () => {
        prepareForRemovalAnimation?.();
        setMedia((current) => removeSavedMediaById(current, id));
      },
      onMissing: async () => setMedia(await listSavedMedia()),
      onError: async () => {
        try {
          setMedia(await listSavedMedia());
        } catch {
          // Keep the last rendered library if the recovery refresh also fails.
        }

        Alert.alert('Não foi possível apagar', 'O SaveApp não conseguiu concluir a exclusão. Tente novamente.');
      },
    });
  }, []);

  const requestRenamePhoto = useCallback((photo: SavedPhoto) => {
    if (Platform.OS !== 'ios') {
      return;
    }

    Alert.prompt(
      'Renomear foto',
      'Deixe o campo vazio para voltar ao nome automático. Máximo de 100 caracteres.',
      createPhotoRenamePromptButtons((value) => {
        void renamePhotoWithPersistence(photo.id, value, {
          getPhoto: getSavedPhoto,
          updateTitle: updateSavedPhotoTitle,
        }).then((result) => {
          if (result.status === 'renamed' || result.status === 'unchanged') {
            setMedia((current) =>
              current.map((item) =>
                item.id === photo.id && item.mediaType === 'photo' ? result.photo : item,
              ),
            );
          } else if (result.status === 'failed') {
            Alert.alert('Não foi possível renomear', 'Tente novamente. O nome salvo foi preservado.');
          } else if (result.status === 'missing') {
            void listSavedMedia().then(setMedia).catch(() => undefined);
          }
        });
      }),
      'plain-text',
      getPhotoDisplayTitle(photo),
      'default',
    );
  }, []);

  const value = useMemo(
    () => ({
      media,
      isReady,
      importFromPhotoLibrary,
      importVideosFromPhotoLibrary,
      requestDeleteMedia,
      requestRenamePhoto,
      getPhoto,
      getVideo,
    }),
    [
      getPhoto,
      getVideo,
      importFromPhotoLibrary,
      importVideosFromPhotoLibrary,
      isReady,
      media,
      requestDeleteMedia,
      requestRenamePhoto,
    ],
  );

  return <PhotoLibraryContext.Provider value={value}>{children}</PhotoLibraryContext.Provider>;
}

export function useLocalPhotoLibrary(): PhotoLibraryContextValue {
  const context = useContext(PhotoLibraryContext);
  if (!context) {
    throw new Error('useLocalPhotoLibrary must be used within LocalPhotoLibraryProvider');
  }

  return context;
}
