import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function CollectionsScreen() {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Coleções"
          contentGap={theme.spacing.lg}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>
                Coleções
              </Text>
            </View>
          }
          nativeTabRoot
          scrollContentContainerStyle={{
            paddingBottom: theme.layout.tabBarHeight + insets.bottom + theme.spacing.xxxl,
            paddingHorizontal: 0,
          }}
        >
          {null}
        </ProgressiveCollapsibleScreen>
      </View>
    </>
  );
}
