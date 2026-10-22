import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppearanceSheet } from '@/components/demo/AppearanceSheet';
import { DemoToolbar } from '@/components/demo/DemoToolbar';
import { NativeButton, NativeCardContextMenu } from '@/components/native';
import { PremiumCard, ProgressiveCollapsibleScreen } from '@/components/premium';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function SettingsScreen() {
  const { mode, resolvedMode, theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [appearanceVisible, setAppearanceVisible] = useState(false);

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      <DemoToolbar variant="profile" onOpenAppearance={() => setAppearanceVisible(true)} />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Ajustes"
          contentGap={theme.spacing.lg}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>
                Ajustes
              </Text>
              <Text
                style={[
                  theme.typography.subheadline,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Preferências locais e exemplos nativos.
              </Text>
            </View>
          }
          nativeTabRoot
          scrollContentContainerStyle={{
            paddingBottom: theme.layout.tabBarHeight + insets.bottom + theme.spacing.xxxl,
            paddingHorizontal: 0,
          }}
        >
          <View style={{ gap: theme.spacing.md, paddingHorizontal: theme.layout.screenHorizontalPadding }}>
            <NativeCardContextMenu
              actions={[
                {
                  id: 'appearance',
                  title: 'Alterar aparência',
                  systemImage: 'circle.lefthalf.filled',
                  onPress: () => setAppearanceVisible(true),
                },
              ]}
              title="Preferências"
            >
              <PremiumCard>
                <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                  Aparência
                </Text>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                  ]}
                >
                  {mode === 'system' ? 'Automática' : mode === 'light' ? 'Claro' : 'Escuro'}
                  {' · '}
                  {resolvedMode === 'dark' ? 'Tema escuro ativo' : 'Tema claro ativo'}
                </Text>
                <NativeButton
                  accessibilityLabel="Escolher modo claro, escuro ou automático"
                  fallbackIcon="contrast-outline"
                  haptic="light"
                  label="Mudar aparência"
                  onPress={() => setAppearanceVisible(true)}
                  systemImage="circle.lefthalf.filled"
                  variant="glass"
                />
              </PremiumCard>
            </NativeCardContextMenu>

            <PremiumCard>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                Componentes incluídos
              </Text>
              {[
                'NativeTabs e Native Stack',
                'Stack.Toolbar compartilhada',
                'Controles SwiftUI com @expo/ui',
                'Context Menu e Bottom Sheet',
                'Progressive Blur e Reanimated',
              ].map((label) => (
                <View
                  key={label}
                  style={{
                    borderBottomColor: theme.colors.separator,
                    borderBottomWidth: 1,
                    paddingVertical: theme.spacing.md,
                  }}
                >
                  <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                    {label}
                  </Text>
                </View>
              ))}
            </PremiumCard>

            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
              Ajustes demonstrativos são locais a este dispositivo.
            </Text>
          </View>
        </ProgressiveCollapsibleScreen>
      </View>
      <AppearanceSheet onVisibleChange={setAppearanceVisible} visible={appearanceVisible} />
    </>
  );
}
