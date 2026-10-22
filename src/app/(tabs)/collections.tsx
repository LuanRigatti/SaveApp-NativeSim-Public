import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AppearanceSheet } from '@/components/demo/AppearanceSheet';
import { DemoToolbar } from '@/components/demo/DemoToolbar';
import { NativeCardContextMenu } from '@/components/native';
import { PremiumCard, ProgressiveCollapsibleScreen } from '@/components/premium';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

const collectionItems = [
  { title: 'Cores e superfícies', subtitle: 'Paletas, cartões e materiais', tone: '#315AE8' },
  { title: 'Navegação nativa', subtitle: 'Abas, pilhas e toolbars', tone: '#7557D6' },
  { title: 'Interações', subtitle: 'Sheets, menus e botões', tone: '#168A75' },
  { title: 'Tipografia', subtitle: 'Títulos e níveis de leitura', tone: '#D27B32' },
];

export default function CollectionsScreen() {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [appearanceVisible, setAppearanceVisible] = useState(false);

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      <DemoToolbar onOpenAppearance={() => setAppearanceVisible(true)} />
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
              <Text
                style={[
                  theme.typography.subheadline,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Peças reutilizáveis para compor telas.
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
            {collectionItems.map((item) => (
              <NativeCardContextMenu
                key={item.title}
                actions={[
                  {
                    id: 'open',
                    title: 'Abrir exemplo',
                    systemImage: 'arrow.up.right',
                    onPress: () => router.push('/details/visual-system'),
                  },
                ]}
                title="Coleção"
              >
                <PremiumCard onPress={() => router.push('/details/visual-system')}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
                    <View
                      style={{
                        backgroundColor: item.tone,
                        borderRadius: theme.radius.card,
                        height: 52,
                        width: 52,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
                        {item.title}
                      </Text>
                      <Text
                        style={[
                          theme.typography.footnote,
                          { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
                        ]}
                      >
                        {item.subtitle}
                      </Text>
                    </View>
                    <Text style={[theme.typography.title3, { color: theme.colors.textTertiary }]}>
                      ›
                    </Text>
                  </View>
                </PremiumCard>
              </NativeCardContextMenu>
            ))}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                {['Claro', 'Escuro', 'Liquid Glass'].map((label) => (
                  <View
                    key={label}
                    style={{
                      backgroundColor: theme.colors.surfaceMuted,
                      borderColor: theme.colors.separator,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                    }}
                  >
                    <Text style={[theme.typography.footnote, { color: theme.colors.textPrimary }]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </ProgressiveCollapsibleScreen>
      </View>
      <AppearanceSheet onVisibleChange={setAppearanceVisible} visible={appearanceVisible} />
    </>
  );
}
