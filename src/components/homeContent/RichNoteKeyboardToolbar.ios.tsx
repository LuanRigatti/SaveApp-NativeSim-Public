import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

type NativeToolbarActionEvent = { action: string };
type NativeToolbarProps = ViewProps & {
  active: boolean;
  colorScheme: 'light' | 'dark' | 'system';
  onAction?: (event: NativeSyntheticEvent<NativeToolbarActionEvent>) => void;
};

const moduleName = 'SaveAppRichNoteKeyboardToolbar';
const nativeModule = requireOptionalNativeModule<{ ViewPrototypes?: Record<string, object> }>(moduleName);
const hasNativeToolbar = Boolean(nativeModule?.ViewPrototypes?.[`${moduleName}_Dock`]);
const NativeToolbar = hasNativeToolbar
  ? requireNativeViewManager<NativeToolbarProps>(moduleName, 'Dock')
  : null;

export type RichNoteKeyboardToolbarProps = {
  active: boolean;
  colorScheme: 'light' | 'dark' | 'system';
  onAction: (action: string) => void;
};

export function RichNoteKeyboardToolbar({ active, colorScheme, onAction }: RichNoteKeyboardToolbarProps) {
  if (!NativeToolbar) return null;

  return (
    <NativeToolbar
      active={active}
      colorScheme={colorScheme}
      onAction={(event) => onAction(event.nativeEvent.action)}
      pointerEvents="none"
      style={{ height: 0, width: 0 }}
    />
  );
}
