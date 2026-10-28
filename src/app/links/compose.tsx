import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';

import { HomeContentComposer } from '@/components/homeContent/HomeContentComposer';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { prepareClipboardLinkCandidate } from '@/features/home-content/clipboardLinkOffer';
import {
  beginDynamicIslandClipboardFlow,
  markClipboardLinkChangeCountHandled,
} from '@/features/home-content/useClipboardLinkOffer';
import { isAuthorizedSaveLinkActivityURL } from '@/features/dynamic-island/saveLinkActivityManager';
import { useAppTheme } from '@/theme';
import {
  getClipboardURLDetectionSnapshot,
  recordSaveAppDiagnosticEvent,
} from '../../../modules/clipboard-url-detection/src';

export default function DynamicIslandLinkComposerRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ activityToken?: string | string[]; source?: string | string[] }>();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const { contents, isReady } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const [isPrepared, setIsPrepared] = useState(false);
  const [initialLink, setInitialLink] = useState<string | null>(null);
  const didPrepare = useRef(false);

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios' || source !== 'dynamic-island') return undefined;
    return beginDynamicIslandClipboardFlow();
  }, [source]);

  useEffect(() => {
    if (isPrepared) recordSaveAppDiagnosticEvent('navigation.composer.presented');
  }, [isPrepared]);

  useEffect(() => {
    if (!isReady || didPrepare.current) return;
    didPrepare.current = true;
    recordSaveAppDiagnosticEvent('navigation.composer.route_opened');
    recordSaveAppDiagnosticEvent(source === 'dynamic-island'
      ? 'navigation.composer.dynamic_island_source'
      : 'navigation.composer.other_source');
    if (typeof params.activityToken === 'string' && params.activityToken.length > 0) {
      recordSaveAppDiagnosticEvent('navigation.composer.token_present');
    } else if (params.activityToken == null) {
      recordSaveAppDiagnosticEvent('navigation.composer.token_missing');
    } else {
      recordSaveAppDiagnosticEvent('navigation.composer.token_malformed');
    }

    void (async () => {
      let nextInitialLink: string | null = null;
      const isActivitySource = Platform.OS === 'ios' && source === 'dynamic-island';
      const isAuthorized = isActivitySource && await isAuthorizedSaveLinkActivityURL(params.activityToken);
      if (isActivitySource) {
        recordSaveAppDiagnosticEvent(isAuthorized
          ? 'navigation.composer.token_valid'
          : 'navigation.composer.token_invalid');
      }

      if (isAuthorized) {
        try {
          recordSaveAppDiagnosticEvent('navigation.composer.clipboard_read_started');
          const beforeRead = await getClipboardURLDetectionSnapshot();
          markClipboardLinkChangeCountHandled(beforeRead?.changeCount);
          recordSaveAppDiagnosticEvent(beforeRead?.hasURLItem
            ? 'navigation.composer.clipboard_read_url'
            : 'navigation.composer.clipboard_read_text');
          const clipboardText = beforeRead?.hasURLItem
            ? await Clipboard.getUrlAsync()
            : await Clipboard.getStringAsync();
          const afterRead = await getClipboardURLDetectionSnapshot();

          if (beforeRead?.changeCount !== afterRead?.changeCount) {
            recordSaveAppDiagnosticEvent('navigation.composer.clipboard_changed');
          } else if (clipboardText?.trim()) {
            const existingURLs = new Set(
              contents.flatMap((content) =>
                content.contentType === 'link' ? [content.normalizedUrl] : [],
              ),
            );
            const candidate = prepareClipboardLinkCandidate(clipboardText, existingURLs);
            if (candidate.status === 'ready') {
              nextInitialLink = candidate.normalizedURL;
              recordSaveAppDiagnosticEvent('navigation.composer.candidate_valid');
            } else if (candidate.status === 'duplicate') {
              recordSaveAppDiagnosticEvent('navigation.composer.candidate_duplicate');
              Alert.alert('Link já salvo', 'Este link já está na sua biblioteca.', [
                { text: 'OK', onPress: () => router.replace('/') },
              ]);
              return;
            } else if (candidate.status === 'invalid') {
              recordSaveAppDiagnosticEvent('navigation.composer.candidate_invalid');
            }
          } else {
            recordSaveAppDiagnosticEvent('navigation.composer.clipboard_empty');
          }
        } catch {
          // If paste access is denied or unavailable, open the ordinary empty composer.
          recordSaveAppDiagnosticEvent('navigation.composer.clipboard_read_failed');
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
