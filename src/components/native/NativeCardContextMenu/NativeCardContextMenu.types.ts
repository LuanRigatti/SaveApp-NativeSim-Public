import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

export type NativeCardContextMenuAction = {
  id: string;
  title: string;
  systemImage: SFSymbol;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type NativeCardContextMenuProps = {
  children: ReactNode;
  preview?: ReactNode;
  actions: readonly NativeCardContextMenuAction[];
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  style?: StyleProp<ViewStyle>;
  title?: string;
  cornerRadius?: number;
};
