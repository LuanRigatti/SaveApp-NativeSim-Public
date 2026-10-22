import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { AppearanceSheet } from '@/components/demo/AppearanceSheet';
import { DemoToolbar } from '@/components/demo/DemoToolbar';
import { NativeCardContextMenu } from '@/components/native';
import { PremiumCard, ProgressiveCollapsibleScreen } from '@/components/premium';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

const examples = [
  { title: 'Superfícies e cartões', detail: 'Materiais, raios e hierarquia visual' },
  { title: 'Toolbars compartilhadas', detail: 'Ações nativas entre abas e telas' },
  { title: 'Bottom Sheets', detail: 'Detents e indicador de arraste' },
  { title: 'Tema automático', detail: 'Aparência do sistema, claro e escuro' },
];

export default function SearchScreen() {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return examples;
    return examples.filter((item) =>
      (item.title + ' ' + item.detail).toLocaleLowerCase().includes(normalized),
    );
  }, [query]);

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      <DemoToolbar onOpenAppearance={() => setAppearanceVisible(true)} />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Buscar"
          contentGap={theme.spacing.lg}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text style={[theme.typography.largeTitle, { color: theme.colors.textPrimary }]}>
                Buscar
              </Text>
              <Text
                style={[
                  theme.typography.subheadline,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Explore os elementos deste template.
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
            <TextInput
              accessibilityLabel="Buscar componentes"
              onChangeText={setQuery}
              placeholder="Títulos, toolbars, sheets..."
              placeholderTextColor={theme.colors.textTertiary}
              returnKeyType="search"
              style={[
                theme.typography.body,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.separator,
                  borderRadius: theme.radius.card,
                  borderWidth: 1,
                  color: theme.colors.textPrimary,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                },
              ]}
              value={query}
            />
            {results.map((item) => (
              <NativeCardContextMenu
                key={item.title}
                actions={[
                  {
                    id: 'open',
                    title: 'Abrir demonstração',
                    systemImage: 'arrow.up.right',
                    onPress: () => router.push('/details/visual-system'),
                  },
                ]}
                title="Resultado de exemplo"
              >
                <PremiumCard onPress={() => router.push('/details/visual-system')}>
                  <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>
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
                </PremiumCard>
              </NativeCardContextMenu>
            ))}
            {results.length === 0 ? (
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                Nenhum exemplo local corresponde a esta busca.
              </Text>
            ) : null}
          </View>
        </ProgressiveCollapsibleScreen>
      </View>
      <AppearanceSheet onVisibleChange={setAppearanceVisible} visible={appearanceVisible} />
    </>
  );
}
