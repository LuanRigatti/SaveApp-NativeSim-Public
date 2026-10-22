import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { NativeButtonHaptic } from '@/types/native-ui';

export const TAB_HAPTIC_IMPACT_STYLE = Haptics.ImpactFeedbackStyle.Light;

export function triggerSelectionHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => undefined);
}

export function triggerLightImpactHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function triggerNativeButtonHaptic(style: NativeButtonHaptic = 'none'): void {
  if (Platform.OS === 'web' || style === 'none') return;

  if (style === 'selection') {
    void Haptics.selectionAsync().catch(() => undefined);
    return;
  }

  const impactStyle = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
    soft: Haptics.ImpactFeedbackStyle.Soft,
  }[style];

  void Haptics.impactAsync(impactStyle).catch(() => undefined);
}

export function triggerTabHaptic(): void {
  if (Platform.OS === 'web') return;

  void Haptics.impactAsync(TAB_HAPTIC_IMPACT_STYLE).catch(() => undefined);
}
