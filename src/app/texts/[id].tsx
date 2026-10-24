import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import type { SavedText } from '@/features/home-content/homeContentTypes';
import { useAppTheme } from '@/theme';

export default function SavedTextScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    const parsed = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);
  const { getText } = useLocalSavedContent();
  const { theme } = useAppTheme();
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
    <>
      <Stack.Screen options={{ headerTitle: 'Texto' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, padding: theme.spacing.lg }}
        style={{ backgroundColor: theme.colors.background, flex: 1 }}
      >
        {isLoading ? (
          <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
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
      </ScrollView>
    </>
  );
}
