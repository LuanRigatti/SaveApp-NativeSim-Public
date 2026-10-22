import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type { KeyboardTypeOptions, StyleProp, TextStyle, ViewStyle } from 'react-native';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type NativeMenuAction = {
  id: string;
  title: string;
  systemImage?: string;
  destructive?: boolean;
  disabled?: boolean;
  isOn?: boolean;
  onPress: () => void;
};

export type NativeMenuProps = {
  children: ReactElement;
  actions: readonly NativeMenuAction[];
  title?: string;
  href?: string;
  accessibilityLabel?: string;
};

export type NativeSheetDetent = 'medium' | 'large' | { fraction: number } | { height: number };
export type NativeSheetBackgroundInteraction = 'automatic' | 'enabled' | 'disabled';

export type NativeSheetProps = {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onDismiss?: () => void;
  children: ReactNode;
  detents?: readonly NativeSheetDetent[];
  glassSurface?: boolean;
  glassTint?: string;
  presentationBackgroundInteraction?: NativeSheetBackgroundInteraction;
  presentationBackgroundColor?: string;
  title?: string;
  accessibilityLabel?: string;
};

export type NativeDialogAction = {
  id: string;
  title: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type NativeDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  actions: readonly NativeDialogAction[];
  onDismiss: () => void;
};

export type NativePickerProps = {
  options: readonly string[];
  selectedIndex: number | null;
  onSelectedIndexChange: (index: number) => void;
  label?: string;
  accessibilityLabel?: string;
};

export type NativeSegmentedControlProps = {
  options: readonly string[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  accessibilityLabel?: string;
  systemImages?: readonly string[];
  style?: StyleProp<ViewStyle>;
};

export type NativeListItem = {
  id: string;
  title: string;
  subtitle?: string;
  systemImage?: string;
  disabled?: boolean;
};

export type NativeListProps = {
  items: readonly NativeListItem[];
  onItemPress?: (item: NativeListItem) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export type NativeDatePickerMode = 'date' | 'time';
export type NativeDatePickerStyle = 'automatic' | 'compact' | 'wheel';

export type NativeDatePickerProps = {
  value: Date;
  mode: NativeDatePickerMode;
  onChange: (value: Date) => void;
  style?: NativeDatePickerStyle;
  minimumDate?: Date;
  maximumDate?: Date;
  accessibilityLabel?: string;
};

export type NativeButtonProps = {
  label: string;
  onPress: () => void;
  haptic?: NativeButtonHaptic;
  variant?: 'glass' | 'plain' | 'primary' | 'filled' | 'surface';
  glassTint?: string;
  backgroundColor?: string;
  controlSize?: 'mini' | 'small' | 'regular' | 'large' | 'extraLarge';
  systemImage?: string;
  fallbackIcon?: string;
  minHeight?: number;
  minWidth?: number;
  horizontalPadding?: number;
  color?: string;
  disabled?: boolean;
  gateDisabledAction?: boolean;
  accessibilityHint?: string;
  accessibilityValue?: string;
  content?: NativeButtonContent;
  destructive?: boolean;
  accessibilityLabel?: string;
};

export type NativeButtonHaptic = 'none' | 'light' | 'medium' | 'heavy' | 'soft' | 'selection';

export type NativeButtonContent = {
  type: 'stacked';
  title: string;
  subtitle: string;
  foregroundColor?: string;
  indicator?: boolean;
  indicatorColor?: string;
};

export type NativeDropdownVariant = 'glass' | 'plain';

export type NativeDropdownItem<T extends string | number = string | number> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export type NativeDropdownProps<T extends string | number = string | number> = {
  items: readonly NativeDropdownItem<T>[];
  selectedValue: T;
  onValueChange: (value: T) => void;
  label?: string;
  variant?: NativeDropdownVariant;
  accessibilityLabel?: string;
  disabled?: boolean;
  color?: string;
};

export type NativeGlassIconButtonProps = {
  systemImage?: string;
  fallbackIcon?: ComponentProps<typeof Ionicons>['name'];
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
  glassTint?: string;
  size?: number;
  containerSize?: number;
  containerWidth?: number;
  shape?: 'circle' | 'capsule';
  interactiveGlass?: boolean;
  labelSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export type NativeAvatarButtonProps = {
  name: string;
  imageUri?: string | null;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  glassTint?: string;
  containerSize?: number;
  avatarSize?: 'small' | 'medium' | 'large';
  haptic?: NativeButtonHaptic;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export type NativeGlassBackButtonProps = {
  accessibilityLabel?: string;
  onPress: () => void;
  color?: string;
  size?: number;
  containerSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export type NativeGlassMenuProps = {
  actions: readonly NativeMenuAction[];
  glassTint?: string;
  systemImage: string;
  fallbackIcon: ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  containerSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onImplementationReady?: () => void;
  trigger: ReactElement;
};

export type NativeToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
};

export type NativeTextFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  onBlurReady?: (blur: () => void) => void;
  label?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  multiline?: boolean;
  style?: StyleProp<TextStyle>;
};

export type NativeRuntimeEnvironment = 'expo-go' | 'development-build' | 'web';

export type NativeCapabilities = {
  environment: NativeRuntimeEnvironment;
  canUseExpoUI: boolean;
  canUseNativeMenu: boolean;
  canUseNativeSheet: boolean;
  canUseNativePicker: boolean;
  canUseNativeTabs: boolean;
  canUseLiquidGlass: boolean;
};
