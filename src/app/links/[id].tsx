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
import { SafeAreaView } from 'react-native-safe-area-context';

import { SavedLinkPreviewContent } from '@/components/homeContent/SavedLinkPreviewContent';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import type { SavedLink } from '@/features/home-content/homeContentTypes';
import { useAppTheme } from '@/theme';

export default function SavedLinkScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    const parsed = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);
  const { contents, isReady } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [isOpening, setIsOpening] = useState(false);
  const link = id == null
    ? null
    : contents.find((item): item is SavedLink => item.contentType === 'link' && item.id === id) ?? null;
  const previewWidth = Math.max(1, Math.min(screenWidth - theme.spacing.lg * 2, 460));

  const openLink = async () => {
    if (!link || isOpening) return;
    setIsOpening(true);
    try {
      await Linking.openURL(link.url);
    } catch {
      Alert.alert('Não foi possível abrir o link', 'Tente novamente mais tarde.');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerTitle: link?.domain ?? 'Link',
          headerTransparent: false,
        }}
      />
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={{ backgroundColor: theme.colors.background, flex: 1 }}
      >
        {link ? (
          <View
            style={{
              alignSelf: 'center',
              flex: 1,
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
              onPress={() => void openLink()}
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
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <Ionicons color={theme.colors.textPrimary} name="open-outline" size={18} />
              )}
              <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
                Abrir link
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}>
            {!isReady && id != null ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                Este link não está disponível.
              </Text>
            )}
          </View>
        )}
      </SafeAreaView>
    </>
  );
}
