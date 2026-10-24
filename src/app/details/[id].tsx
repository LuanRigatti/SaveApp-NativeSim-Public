import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { PremiumCard, ProgressiveCollapsibleScreen } from '@/components/premium';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          animation: 'default',
          gestureEnabled: true,
          headerLargeTitle: false,
          headerShadowVisible: false,
          headerTitle: '',
          headerTransparent: true,
        }}
      />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Demonstração"
          contentGap={theme.spacing.lg}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>
                Um detalhe em foco
              </Text>
              <Text
                style={[
                  theme.typography.subheadline,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Uma tela secundária no Native Stack.
              </Text>
            </View>
          }
          nativeHeader
          scrollContentContainerStyle={{
            paddingBottom: insets.bottom + theme.spacing.xxxl,
            paddingHorizontal: 0,
          }}
        >
          <View style={{ gap: theme.spacing.lg, paddingHorizontal: theme.layout.screenHorizontalPadding }}>
            <PremiumCard>
              <View
                style={{
                  borderRadius: theme.radius.card,
                  height: 200,
                  overflow: 'hidden',
                }}
              >
                <LinearGradient
                  colors={['#168A75', '#315AE8', '#785BD7']}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={{ flex: 1, justifyContent: 'flex-end', padding: theme.spacing.lg }}
                >
                  <Text style={[theme.typography.title2, { color: '#FFFFFF' }]}>
                    {id ?? 'visual-system'}
                  </Text>
                </LinearGradient>
              </View>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.md },
                ]}
              >
                A navegação usa push/pop do sistema. No iOS, deslize desde a borda esquerda para
                voltar e observe a toolbar acompanhar a transição.
              </Text>
            </PremiumCard>
          </View>
        </ProgressiveCollapsibleScreen>
      </View>
    </>
  );
}
