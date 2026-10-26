import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { useHomeFolderItemAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import type { SavedText } from '@/features/home-content/homeContentTypes';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function SavedTextScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    const parsed = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);
  const authorization = useHomeFolderItemAuthorization('text', id);

  return (
    <>
      <Stack.Screen
        options={{
          headerShadowVisible: false,
          headerTitle: '',
          headerTransparent: true,
        }}
      />
      {authorization.isAuthorized ? (
        <SavedTextContent id={id} />
      ) : (
        <HomeFolderAuthorizationPrompt authorization={authorization} />
      )}
    </>
  );
}

function SavedTextContent({ id }: { id: number | null }) {
  const { getText } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [loadedText, setLoadedText] = useState<{ id: number; value: SavedText | null } | null>(null);
  const savedText = id != null && loadedText?.id === id ? loadedText.value : null;
  const isLoading = id != null && loadedText?.id !== id;

  useEffect(() => {
    let isActive = true;
    if (id == null) {
      return () => {
        isActive = false;
      };
    }

    void getText(id).then((result) => {
      if (!isActive) return;
      setLoadedText({ id, value: result });
    });

    return () => {
      isActive = false;
    };
  }, [getText, id]);

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <ProgressiveCollapsibleScreen
        compactTitle="Texto"
        contentGap={theme.spacing.md}
        contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
        largeTitle={
          <Text
            style={[
              theme.typography.largeTitle,
              {
                color: theme.colors.textPrimary,
                fontSize: theme.typography.largeTitle.fontSize + 2,
              },
            ]}
          >
            Texto
          </Text>
        }
        nativeHeader
        scrollContentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xxl }}
      >
        {isLoading ? (
          <View style={{ alignItems: 'center', flexGrow: 1, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.info} />
          </View>
        ) : savedText ? (
          <Text style={[theme.typography.body, { color: theme.colors.textPrimary, lineHeight: 26 }]}>
            {savedText.text}
          </Text>
        ) : (
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
            Este texto não está disponível.
          </Text>
        )}
      </ProgressiveCollapsibleScreen>
    </View>
  );
}
