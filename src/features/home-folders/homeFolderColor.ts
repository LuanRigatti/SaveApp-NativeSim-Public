import { getAccentColorTokens, type AccentColorName } from '@/theme/colors';

export function getHomeFolderAccentColor(
  folderColor: AccentColorName | null,
  appAccentColor: AccentColorName,
  mode: 'light' | 'dark',
): string {
  return getAccentColorTokens(folderColor ?? appAccentColor, mode).primary;
}
