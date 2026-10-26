import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { SavedLinkPreviewContent } from '@/components/homeContent/SavedLinkPreviewContent';
import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { useHomeFolderItemAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import type { SavedLink } from '@/features/home-content/homeContentTypes';
import { useAppSafeAreaInsets } from '@/providers';
import { confirmSavedLinkOpen } from '@/features/home-content/savedLinkOpenConfirmation';
import { useAppTheme } from '@/theme';

export default function SavedLinkScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    const parsed = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);
  const authorization = useHomeFolderItemAuthorization('link', id);

  if (!authorization.isAuthorized) {
    return <HomeFolderAuthorizationPrompt authorization={authorization} />;
  }
  return <SavedLinkContent id={id} ensureAccess={authorization.requestAuthorization} />;
}

function SavedLinkContent({
  id,
  ensureAccess,
}: {
  id: number | null;
  ensureAccess: () => Promise<'authenticated' | 'cancelled' | 'unavailable' | 'failed'>;
}) {
  const { contents, isReady } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [isOpening, setIsOpening] = useState(false);
  const link = id == null
    ? null
    : contents.find((item): item is SavedLink => item.contentType === 'link' && item.id === id) ?? null;
  const previewWidth = Math.max(
    1,
    Math.min(screenWidth - theme.spacing.lg * 2, 460, 500 - theme.spacing.lg * 2),
  );
  const linkTitle = link?.domain ?? 'Link';

  const openLink = async () => {
    if (!link || isOpening) return;
    if (await ensureAccess() !== 'authenticated') return;
    setIsOpening(true);
    try {
      await Linking.openURL(link.url);
    } catch {
      Alert.alert('Não foi possível abrir o link', 'Tente novamente mais tarde.');
    } finally {
      setIsOpening(false);
    }
  };

  const requestOpenLink = () => {
    if (!link || isOpening) return;
    confirmSavedLinkOpen(openLink);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerShadowVisible: false,
          headerTintColor: theme.colors.textPrimary,
          headerTitle: '',
          headerTransparent: true,
        }}
      />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle={linkTitle}
          contentGap={theme.spacing.md}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={2}
                style={[
                  theme.typography.largeTitle,
                  {
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.largeTitle.fontSize + 2,
                  },
                ]}
              >
                {linkTitle}
              </Text>
            </View>
          }
          nativeHeader
          scrollContentContainerStyle={{
            paddingBottom: insets.bottom + theme.spacing.xxl,
            paddingHorizontal: 0,
          }}
        >
          {link ? (
            <View
              style={{
                alignSelf: 'center',
                flexGrow: 1,
                justifyContent: 'center',
                maxWidth: 500,
                padding: theme.spacing.lg,
                width: '100%',
              }}
            >
              <SavedLinkPreviewContent link={link} width={previewWidth} />
              <Pressable
                accessibilityLabel={`Abrir ${link.domain} no navegador`}
                accessibilityRole="button"
                disabled={isOpening}
                onPress={requestOpenLink}
                style={{
                  alignItems: 'center',
                  alignSelf: 'stretch',
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.separator,
                  borderRadius: theme.radius.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  flexDirection: 'row',
                  gap: theme.spacing.sm,
                  justifyContent: 'center',
                  marginTop: theme.spacing.lg,
                  minHeight: 52,
                  opacity: isOpening ? 0.65 : 1,
                  paddingHorizontal: theme.spacing.lg,
                }}
              >
                {isOpening ? (
                  <ActivityIndicator color={theme.colors.info} />
                ) : (
                  <Ionicons color={theme.colors.textPrimary} name="open-outline" size={18} />
                )}
                <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Abrir link</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: theme.spacing.lg }}>
              {!isReady && id != null ? (
                <ActivityIndicator color={theme.colors.info} />
              ) : (
                <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Este link não está disponível.</Text>
              )}
            </View>
          )}
        </ProgressiveCollapsibleScreen>
      </View>
    </>
  );
}
