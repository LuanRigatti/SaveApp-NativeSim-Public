import { View } from 'react-native';

export type RichNoteKeyboardToolbarProps = {
  active: boolean;
  colorScheme: 'light' | 'dark' | 'system';
  onAction: (action: string) => void;
};

export function RichNoteKeyboardToolbar(_props: RichNoteKeyboardToolbarProps) {
  return <View pointerEvents="none" style={{ height: 0, width: 0 }} />;
}
