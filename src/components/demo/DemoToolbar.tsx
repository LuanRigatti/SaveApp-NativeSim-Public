import { Stack } from 'expo-router';
import { View } from 'react-native';

import { NativeHomeToolbarActions } from '@/components/native';
import { HOME_TOOLBAR_CONTROL_SIZE } from '@/components/native/NativeHomeToolbarActions/NativeHomeToolbarActions.constants';
import { useAppTheme } from '@/theme';

type DemoToolbarProps = {
  variant?: 'actions' | 'profile';
  onOpenAppearance: () => void;
  onSearchPress?: () => void;
};

export function DemoToolbar({
  variant = 'actions',
  onOpenAppearance,
  onSearchPress,
}: DemoToolbarProps) {
  const { theme } = useAppTheme();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <View
            accessible={false}
            collapsable={false}
            pointerEvents="none"
            style={{ height: HOME_TOOLBAR_CONTROL_SIZE, width: HOME_TOOLBAR_CONTROL_SIZE }}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          {variant === 'profile' ? (
            <NativeHomeToolbarActions
              accessibilityLabel="Abrir opções do SaveApp"
              foregroundColor={theme.colors.textPrimary}
              name="SaveApp"
              onProfilePress={onOpenAppearance}
              showSearch={false}
              toolbarMorphDiagnosticRole="settings-profile"
            />
          ) : (
            <NativeHomeToolbarActions
              accessibilityHint="Abre as opções visuais deste exemplo."
              accessibilityLabel="Abrir opções de visualização"
              mode="modeAndSearchActions"
              onModePress={onOpenAppearance}
              onSearchPress={onSearchPress ?? (() => undefined)}
              searchAccessibilityHint="Abrir a aba Buscar."
              searchAccessibilityLabel="Buscar"
              toolbarMorphDiagnosticRole="home-search"
            />
          )}
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );
}
