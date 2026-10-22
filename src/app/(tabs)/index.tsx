import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AppearanceSheet } from '@/components/demo/AppearanceSheet';
import { DemoToolbar } from '@/components/demo/DemoToolbar';
import { NativeButton, NativeCardContextMenu } from '@/components/native';
import { PremiumCard, ProgressiveBlur, ProgressiveCollapsibleScreen } from '@/components/premium';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [appearanceVisible, setAppearanceVisible] = useState(false);

  const openDetail = () => router.push('/details/visual-system');
  const openSearch = () => router.push('/(tabs)/search');

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      <DemoToolbar onOpenAppearance={() => setAppearanceVisible(true)} onSearchPress={openSearch} />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Início"
          contentGap={theme.spacing.lg}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>
                Um espaço para suas ideias
              </Text>
              <Text
                style={[
                  theme.typography.subheadline,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Um ponto de partida visual para novos apps.
              </Text>
            </View>
          }
          nativeTabRoot
          scrollContentContainerStyle={{
            paddingBottom: theme.layout.tabBarHeight + insets.bottom + theme.spacing.xxxl,
            paddingHorizontal: 0,
          }}
        >
          <View style={{ gap: theme.spacing.lg, paddingHorizontal: theme.layout.screenHorizontalPadding }}>
            <NativeCardContextMenu
              actions={[
                { id: 'open', title: 'Abrir demonstração', systemImage: 'arrow.up.right', onPress: openDetail },
                { id: 'appearance', title: 'Ver aparência', systemImage: 'circle.lefthalf.filled', onPress: () => setAppearanceVisible(true) },
              ]}
              title="Ações de demonstração"
            >
              <PremiumCard onPress={openDetail} style={{ padding: theme.spacing.sm }}>
                <View
                  style={{
                    borderRadius: theme.radius.card,
                    height: 190,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <LinearGradient
                    colors={['#315AE8', '#7659D8', '#B5A8FF']}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={{ flex: 1, justifyContent: 'space-between', padding: theme.spacing.lg }}
                  >
                    <Text style={[theme.typography.caption, { color: '#F1F3FF' }]}>
                      DESTAQUE
                    </Text>
                    <Text style={[theme.typography.title2, { color: '#FFFFFF', maxWidth: 260 }]}>
                      Seu próximo projeto começa aqui.
                    </Text>
                    <ProgressiveBlur
                      edge="bottom"
                      height={76}
                      intensity={48}
                      style={{ bottom: 0, left: 0, position: 'absolute', right: 0 }}
                    />
                    <Text
                      style={[
                        theme.typography.footnote,
                        { bottom: theme.spacing.md, color: '#FFFFFF', left: theme.spacing.lg, position: 'absolute' },
                      ]}
                    >
                      Toque para ver o detalhe
                    </Text>
                  </LinearGradient>
                </View>
              </PremiumCard>
            </NativeCardContextMenu>

            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                Componentes em uso
              </Text>
              <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                03 exemplos
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.layout.screenHorizontalPadding }}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {[
                { title: 'Cartões', detail: 'Superfícies e hierarquia', icon: 'square.stack.3d.up' as const },
                { title: 'Navegação', detail: 'Abas e transições', icon: 'point.topleft.down.curvedto.point.bottomright.up' as const },
                { title: 'Controles', detail: 'Ações com aparência nativa', icon: 'slider.horizontal.3' as const },
              ].map((item) => (
                <PremiumCard key={item.title} onPress={openDetail} style={{ minWidth: 220 }}>
                  <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                    {item.title}
                  </Text>
                  <Text
                    style={[
                      theme.typography.footnote,
                      { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                    ]}
                  >
                    {item.detail}
                  </Text>
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: theme.colors.brand,
                      borderRadius: theme.radius.pill,
                      height: 44,
                      justifyContent: 'center',
                      marginTop: theme.spacing.lg,
                      width: 44,
                    }}
                  >
                    <Text style={[theme.typography.headline, { color: theme.colors.primary }]}>
                      {item.icon === 'square.stack.3d.up' ? '01' : item.icon === 'slider.horizontal.3' ? '03' : '02'}
                    </Text>
                  </View>
                </PremiumCard>
              ))}
            </ScrollView>

            <PremiumCard>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                Abra o painel nativo
              </Text>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Veja os detents, o indicador de arraste e os controles SwiftUI.
              </Text>
              <NativeButton
                accessibilityLabel="Abrir opções de aparência"
                fallbackIcon="options-outline"
                haptic="light"
                label="Explorar controles"
                onPress={() => setAppearanceVisible(true)}
                systemImage="slider.horizontal.3"
                variant="primary"
              />
            </PremiumCard>

            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
              Conteúdo fictício local. Nenhum serviço externo está conectado.
            </Text>
          </View>
        </ProgressiveCollapsibleScreen>
      </View>
      <AppearanceSheet onVisibleChange={setAppearanceVisible} visible={appearanceVisible} />
    </>
  );
}
