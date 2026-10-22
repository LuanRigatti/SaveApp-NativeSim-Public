type NativeHomeToolbarMorphProps = {
  toolbarMorphDiagnosticRole?: 'home-search' | 'settings-profile';
};

type NativeHomeToolbarActionsBaseProps = NativeHomeToolbarMorphProps & {
  name: string;
  imageUri?: string | null;
  foregroundColor?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  searchAccessibilityLabel?: string;
  searchAccessibilityHint?: string;
};

type NativeHomeToolbarProfileActionsProps = NativeHomeToolbarActionsBaseProps & {
  mode?: 'profileActions';
  onProfilePress: () => void;
  onSearchPress?: () => void;
  showSearch?: boolean;
};

type NativeHomeToolbarModeActionBaseProps = NativeHomeToolbarMorphProps & {
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onModePress: () => void;
};

type NativeHomeToolbarModeAndSearchActionsProps = NativeHomeToolbarModeActionBaseProps & {
  mode: 'modeAndSearchActions';
  onSearchPress: () => void;
  searchAccessibilityLabel?: string;
  searchAccessibilityHint?: string;
};

type NativeHomeToolbarModeOnlyActionProps = NativeHomeToolbarModeActionBaseProps & {
  mode: 'modeOnlyAction';
  onSearchPress?: never;
  searchAccessibilityLabel?: never;
  searchAccessibilityHint?: never;
};

export type NativeHomeToolbarActionsProps =
  | NativeHomeToolbarProfileActionsProps
  | NativeHomeToolbarModeAndSearchActionsProps
  | NativeHomeToolbarModeOnlyActionProps;
