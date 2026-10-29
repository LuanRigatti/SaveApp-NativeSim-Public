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
  getSavedVideo,
  getSavedPhoto,
  importSelectedPhotos,
  importSelectedVideos,
  listSavedMedia,
  updateSavedPhotoTitle,
} from './photoLibrary';
import { removeSavedMediaById } from './photoGalleryState';
import { requestConfirmedPhotoDeletion } from './photoDeletionPipeline';
import {
  createPhotoRenamePromptButtons,
  renamePhotoWithPersistence,
} from './photoRenamePipeline';
import { getPhotoDisplayTitle } from './photoTitle';
import {
  createExistingPermissionPhotoSubtypeReader,
  resolvePhotoScreenshotClassification,
} from './photoScreenshotDetection';
import type { SavedMedia, SavedPhoto, SavedVideo, VideoImportAsset } from './photoTypes';
import { countUnsupportedPickedVideos, groupPickedMediaAssets } from './photoPickerSelection';
import { moveSavedItemToRecentlyDeleted } from '@/features/home-trash/trashLibrary';

type PhotoLibraryContextValue = {
  media: SavedMedia[];
  isReady: boolean;
  hasCatalogLoadSucceeded: boolean;
  refresh: () => Promise<void>;
  importMediaFromPhotoLibrary: () => Promise<void>;
  requestDeleteMedia: (
    id: number,
    mediaType: 'photo' | 'video',
    prepareForRemovalAnimation?: () => void,
    authorizeBeforeDelete?: () => Promise<boolean>,
  ) => void;
  requestRenamePhoto: (photo: SavedPhoto) => void;
  getPhoto: (id: number) => Promise<SavedPhoto | null>;
  getVideo: (id: number) => Promise<SavedVideo | null>;
};

const PhotoLibraryContext = createContext<PhotoLibraryContextValue | null>(null);

export function LocalPhotoLibraryProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<SavedMedia[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasCatalogLoadSucceeded, setHasCatalogLoadSucceeded] = useState(false);
  const initializationRef = useRef<Promise<void> | null>(null);
  const isImportingRef = useRef(false);

  const initialize = useCallback((): Promise<void> => {
    if (!initializationRef.current) {
      initializationRef.current = listSavedMedia()
        .then((nextMedia) => {
          setMedia(nextMedia);
          setHasCatalogLoadSucceeded(true);
        })
        .catch((error: unknown) => {
          setHasCatalogLoadSucceeded(false);
          initializationRef.current = null;
          throw error;
        })
        .finally(() => setIsReady(true));
    }

    return initializationRef.current;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextMedia = await listSavedMedia();
      setMedia(nextMedia);
      setHasCatalogLoadSucceeded(true);
      setIsReady(true);
    } catch (error) {
      setHasCatalogLoadSucceeded(false);
      throw error;
    }
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

  const importMediaFromPhotoLibrary = useCallback(async () => {
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
            'Acesso à fototeca necessário',
            'Permita o acesso à fototeca para que o SaveApp possa copiar as mídias selecionadas para a galeria local.',
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 0,
        orderedSelection: true,
        allowsEditing: false,
        quality: 1,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        exif: false,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const selectedAssets = result.assets as VideoImportAsset[];
      const batches = groupPickedMediaAssets(selectedAssets);
      const unsupportedVideoCount = countUnsupportedPickedVideos(selectedAssets);
      if (batches.length === 0) {
        if (unsupportedVideoCount > 0) {
          Alert.alert('Nenhum vídeo compatível', 'Selecione vídeos em um formato compatível.');
        }
        return;
      }

      let importedVideoCount = 0;
      let failedVideoCount = unsupportedVideoCount;
      let photoImportFailed = false;

      for (const batch of batches) {
        try {
          if (batch.kind === 'photo') {
            const screenshotReader = await createExistingPermissionPhotoSubtypeReader(
              Platform.OS,
              async () => (await getPermissionsAsync(false)).granted,
              async (assetReference) => new Asset(assetReference).getMediaSubtypes(),
            );
            const photosWithClassification = await Promise.all(
              batch.assets.map(async (asset) => ({
                ...asset,
                isScreenshot: await resolvePhotoScreenshotClassification(
                  asset,
                  screenshotReader,
                  MediaSubtype.SCREENSHOT,
                ),
              })),
            );

            await importSelectedPhotos(photosWithClassification);
          } else {
            const importResult = await importSelectedVideos(batch.assets);
            importedVideoCount += importResult.videos.length;
            failedVideoCount += importResult.failedCount;
          }
        } catch {
          if (batch.kind === 'video') {
            failedVideoCount += batch.assets.length;
          } else {
            photoImportFailed = true;
          }
        }
      }

      setMedia(await listSavedMedia());

      if (failedVideoCount > 0) {
        Alert.alert(
          importedVideoCount > 0 ? 'Importação parcial' : 'Não foi possível importar os vídeos',
          importedVideoCount > 0
            ? `${importedVideoCount} vídeo(s) foram salvos. ${failedVideoCount} não puderam ser adicionados. Verifique o formato e o espaço disponível no iPhone.`
            : 'Os vídeos selecionados não puderam ser adicionados. Verifique o formato e o espaço disponível no iPhone.',
        );
      } else if (photoImportFailed) {
        Alert.alert('Não foi possível adicionar mídia', 'Algumas mídias não puderam ser copiadas. Tente novamente.');
      }
    } catch {
      Alert.alert(
        'Não foi possível adicionar mídia',
        'O SaveApp não conseguiu ler ou salvar as mídias selecionadas. Tente novamente.',
      );
    } finally {
      isImportingRef.current = false;
    }
  }, [initialize]);

  const requestDeleteMedia = useCallback((
    id: number,
    mediaType: 'photo' | 'video',
    prepareForRemovalAnimation?: () => void,
    authorizeBeforeDelete?: () => Promise<boolean>,
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
            'Mover para Apagados recentemente?',
            mediaType === 'video'
              ? 'O vídeo ficará disponível para restauração por 30 dias. O original continuará na galeria do iPhone.'
              : 'A imagem ficará disponível para restauração por 30 dias. A foto original continuará na galeria do iPhone.',
            [
              { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
              {
                text: 'Mover para apagados',
                style: 'destructive',
                onPress: () => finish(true),
              },
            ],
            { cancelable: true, onDismiss: () => finish(false) },
          );
        }),
      authorizeBeforeDelete,
      deletePhoto: () => moveSavedItemToRecentlyDeleted(mediaType, id),
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
      hasCatalogLoadSucceeded,
      refresh,
      importMediaFromPhotoLibrary,
      requestDeleteMedia,
      requestRenamePhoto,
      getPhoto,
      getVideo,
    }),
    [
      getPhoto,
      getVideo,
      importMediaFromPhotoLibrary,
      isReady,
      hasCatalogLoadSucceeded,
      media,
      requestDeleteMedia,
      requestRenamePhoto,
      refresh,
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
