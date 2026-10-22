import { font } from '@expo/ui/swift-ui/modifiers';

type NativeFontOptions = Parameters<typeof font>[0];

export function roundedFont(options: NativeFontOptions = {}) {
  return font({ ...options, design: 'rounded' });
}
