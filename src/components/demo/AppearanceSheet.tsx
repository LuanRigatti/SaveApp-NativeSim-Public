import { Text, View } from 'react-native';

import { NativeButton, NativeSheet } from '@/components/native';
import { useAppTheme, type ThemeMode } from '@/theme';

type AppearanceSheetProps = {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
};

export function AppearanceSheet({ visible, onVisibleChange }: AppearanceSheetProps) {
  const { mode, setMode, theme } = useAppTheme();

  const option = (
    value: ThemeMode,
    label: string,
    icon: 'circle.lefthalf.filled' | 'sun.max' | 'moon',
  ) => (
    <NativeButton
      key={value}
      accessibilityLabel={label + (mode === value ? ', selecionado' : '')}
      fallbackIcon={value === 'system' ? 'contrast-outline' : value === 'light' ? 'sunny-outline' : 'moon-outline'}
      haptic="selection"
      label={label}
      onPress={() => setMode(value)}
      systemImage={icon}
      variant={mode === value ? 'filled' : 'glass'}
    />
  );

  return (
    <NativeSheet
      accessibilityLabel="Aparência do SaveApp"
      detents={[{ fraction: 0.42 }, 'large']}
      glassSurface
      onDismiss={() => onVisibleChange(false)}
      onVisibleChange={onVisibleChange}
      presentationBackgroundInteraction="disabled"
      title="Aparência"
      visible={visible}
    >
      <View style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          Escolha como este template acompanha a aparência do dispositivo.
        </Text>
        {option('system', 'Automático', 'circle.lefthalf.filled')}
        {option('light', 'Claro', 'sun.max')}
        {option('dark', 'Escuro', 'moon')}
      </View>
    </NativeSheet>
  );
}
