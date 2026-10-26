import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';

import { HomeContentComposer } from '@/components/homeContent/HomeContentComposer';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { prepareClipboardLinkCandidate } from '@/features/home-content/clipboardLinkOffer';
import { markClipboardLinkChangeCountHandled } from '@/features/home-content/useClipboardLinkOffer';
import { isAuthorizedSaveLinkActivityURL } from '@/features/dynamic-island/saveLinkActivityManager';
import { useAppTheme } from '@/theme';
import { getClipboardURLDetectionSnapshot } from '../../../modules/clipboard-url-detection/src';

export default function DynamicIslandLinkComposerRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ activityToken?: string | string[]; source?: string | string[] }>();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const { contents, isReady } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const [isPrepared, setIsPrepared] = useState(false);
  const [initialLink, setInitialLink] = useState<string | null>(null);
  const didPrepare = useRef(false);

  useEffect(() => {
    if (!isReady || didPrepare.current) return;
    didPrepare.current = true;

    void (async () => {
      let nextInitialLink: string | null = null;
      if (
        Platform.OS === 'ios' &&
        source === 'dynamic-island' &&
        await isAuthorizedSaveLinkActivityURL(params.activityToken)
      ) {
        try {
          const beforeRead = await getClipboardURLDetectionSnapshot();
          markClipboardLinkChangeCountHandled(beforeRead?.changeCount);
          const clipboardText = beforeRead?.hasURLItem
            ? await Clipboard.getUrlAsync()
            : await Clipboard.getStringAsync();
          const afterRead = await getClipboardURLDetectionSnapshot();
          markClipboardLinkChangeCountHandled(afterRead?.changeCount);

          if (clipboardText && beforeRead?.changeCount === afterRead?.changeCount) {
            const existingURLs = new Set(
              contents.flatMap((content) =>
                content.contentType === 'link' ? [content.normalizedUrl] : [],
              ),
            );
            const candidate = prepareClipboardLinkCandidate(clipboardText, existingURLs);
            if (candidate.status === 'ready') {
              nextInitialLink = candidate.normalizedURL;
            } else if (candidate.status === 'duplicate') {
              Alert.alert('Link já salvo', 'Este link já está na sua biblioteca.', [
                { text: 'OK', onPress: () => router.replace('/') },
              ]);
              return;
            }
          }
        } catch {
          // If paste access is denied or unavailable, open the ordinary empty composer.
        }
      }

      setInitialLink(nextInitialLink);
      setIsPrepared(true);
    })();
  }, [contents, isReady, params.activityToken, router, source]);

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <Stack.Screen
        options={{
          animation: 'default',
          contentStyle: { backgroundColor: theme.colors.background },
          gestureEnabled: true,
          headerShown: false,
          presentation: 'card',
        }}
      />
      {isPrepared ? (
        <HomeContentComposer
          kind="link"
          initialLink={initialLink}
          onClose={() => router.replace('/')}
        />
      ) : (
        <ActivityIndicator color={theme.colors.primary} style={{ flex: 1 }} />
      )}
    </View>
  );
}
