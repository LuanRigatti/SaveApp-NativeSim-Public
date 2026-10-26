/* global describe, expect, jest, test */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseAppearancePreferences,
  serializeAppearancePreferences,
} = require('../src/theme/appearancePreferences');
const {
  ACCENT_COLOR_OPTIONS,
  ACCENT_COLOR_COLUMNS,
  darkColors,
  getAccentColorRows,
  getAccentColorTokens,
  getAccentColorSwatch,
  getAccentColorSwatchForeground,
  lightColors,
} = require('../src/theme/colors');
const {
  clearLegacyThemePreference,
  LEGACY_THEME_MODE_STORAGE_KEY,
  resolveAppearanceMode,
  resolveSystemThemeMode,
} = require('../src/theme/systemAppearance');

const root = join(__dirname, '..');
const readSource = (path) => readFileSync(join(root, path), 'utf8');
const providerSource = readSource('src/theme/ThemeProvider.tsx');
const settingsSource = readSource('src/components/native/HomeSettingsBottomSheet.ios.tsx');
const fallbackSource = readSource('src/app/settings-sheet-fallback.tsx');
const detailSettingsSource = readSource('src/app/(tabs)/settings.tsx');
const collectionsSource = readSource('src/app/(tabs)/collections.tsx');
const detailSource = readSource('src/app/details/[id].tsx');
const authorizationPromptSource = readSource('src/features/home-folders/HomeFolderAuthorizationPrompt.tsx');
const savedDocumentThumbnailSource = readSource('src/components/homeContent/SavedDocumentThumbnail.tsx');
const glassComposerSource = readSource('src/components/homeContent/HomeContentComposerSwiftUI.ios.tsx');

function relativeLuminance(hexColor) {
  const channels = hexColor.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe('appearance preferences', () => {
  test.each([
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'light'],
  ])('resolves the system scheme %s to %s', (systemScheme, expected) => {
    expect(resolveSystemThemeMode(systemScheme)).toBe(expected);
    expect(resolveAppearanceMode('system', systemScheme)).toBe(expected);
  });

  test.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
  ])('keeps explicit %s preference independent of system %s', (preference, systemScheme, expected) => {
    expect(resolveAppearanceMode(preference, systemScheme)).toBe(expected);
  });

  test('defaults to System and the black accent, and parses saved values safely', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES).toEqual({ mode: 'system', accentColor: 'black' });
    expect(parseAppearancePreferences(null)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseAppearancePreferences('{invalid')).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseAppearancePreferences(JSON.stringify({ mode: 'light', accentColor: 'blue' }))).toEqual({
      mode: 'light',
      accentColor: 'blue',
    });
    expect(parseAppearancePreferences(JSON.stringify({ mode: 'dark', accentColor: 'pink' }))).toEqual({
      mode: 'dark',
      accentColor: 'pink',
    });
    expect(parseAppearancePreferences(JSON.stringify({ mode: 'unsupported', accentColor: 'purple' }))).toEqual({
      mode: 'system',
      accentColor: 'purple',
    });
  });

  test('serializes the local appearance preference under a dedicated key', () => {
    const preferences = { mode: 'light', accentColor: 'green' };
    expect(APPEARANCE_PREFERENCES_STORAGE_KEY).toBe('@saveapp/appearance-preferences-v1');
    expect(serializeAppearancePreferences(preferences)).toBe(JSON.stringify(preferences));
  });

  test('clears only the obsolete appearance key and preserves other settings', async () => {
    const values = new Map([
      [LEGACY_THEME_MODE_STORAGE_KEY, 'dark'],
      [APPEARANCE_PREFERENCES_STORAGE_KEY, '{"mode":"dark","accentColor":"pink"}'],
      ['@saveapp/home-view-mode', 'compact-list'],
    ]);
    const removeItem = jest.fn(async (key) => values.delete(key));

    await clearLegacyThemePreference({ removeItem });

    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(LEGACY_THEME_MODE_STORAGE_KEY);
    expect(values.has(LEGACY_THEME_MODE_STORAGE_KEY)).toBe(false);
    expect(values.has(APPEARANCE_PREFERENCES_STORAGE_KEY)).toBe(true);
    expect(values.get('@saveapp/home-view-mode')).toBe('compact-list');
  });

  test('keeps the current scheme when legacy preference cleanup fails', async () => {
    await expect(
      clearLegacyThemePreference({
        removeItem: async () => {
          throw new Error('storage unavailable');
        },
      }),
    ).resolves.toBeUndefined();
    expect(resolveSystemThemeMode('dark')).toBe('dark');
  });

  test('provides immediate React state changes and serializes local preference writes', () => {
    expect(providerSource).toContain('useColorScheme()');
    expect(providerSource).toContain('AsyncStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY)');
    expect(providerSource).toContain('AsyncStorage.setItem(');
    expect(providerSource).toContain('serializeAppearancePreferences(nextPreferences)');
    expect(providerSource).toContain('resolveAppearanceMode(appearancePreferences.mode, systemScheme)');
    expect(providerSource).toContain('getAccentColorTokens(appearancePreferences.accentColor, resolvedMode)');
    expect(providerSource).toContain('hasUpdatedAppearanceRef.current');
    expect(providerSource).toContain('setAppearanceMode');
    expect(providerSource).toContain('setAccentColor');
    expect(providerSource).toContain('clearLegacyThemePreference(AsyncStorage)');
  });

  test('defaults to black, preserves existing colors, and offers twelve accessible palette entries in six columns', () => {
    expect(ACCENT_COLOR_COLUMNS).toBe(6);
    expect(ACCENT_COLOR_OPTIONS.map(({ id }) => id)).toEqual([
      'black', 'blue', 'purple', 'green', 'orange', 'pink', 'red', 'gray',
      'cyan', 'yellow', 'indigo', 'wine',
    ]);
    expect(getAccentColorRows().map((row) => row.map(({ id }) => id))).toEqual([
      ['black', 'blue', 'purple', 'green', 'orange', 'pink'],
      ['red', 'gray', 'cyan', 'yellow', 'indigo', 'wine'],
    ]);
    for (const accentColor of ['cyan', 'yellow', 'indigo', 'wine']) {
      const saved = { mode: 'system', accentColor };
      expect(parseAppearancePreferences(serializeAppearancePreferences(saved))).toEqual(saved);
    }
    expect(getAccentColorTokens('black', 'light')).toEqual({
      focus: lightColors.focus,
      primary: lightColors.primary,
      primaryPressed: lightColors.primaryPressed,
      selectionSurface: lightColors.selectionSurface,
      selectionContent: lightColors.selectionContent,
    });
    expect(getAccentColorTokens('black', 'dark')).toEqual({
      focus: darkColors.focus,
      primary: darkColors.primary,
      primaryPressed: darkColors.primaryPressed,
      selectionSurface: darkColors.selectionSurface,
      selectionContent: darkColors.selectionContent,
    });
    expect(getAccentColorTokens('black', 'light').primary).toBe('#000000');
    expect(getAccentColorTokens('black', 'dark').primary).toBe('#C5CBD5');
    expect(getAccentColorTokens('blue', 'light')).toEqual({
      focus: '#315AE8',
      primary: '#315AE8',
      primaryPressed: '#2448C7',
      selectionSurface: '#E6ECFF',
      selectionContent: '#1F3F9A',
    });
    expect(getAccentColorTokens('blue', 'dark')).toEqual({
      focus: '#86A1FF',
      primary: '#86A1FF',
      primaryPressed: '#A5B7FF',
      selectionSurface: '#28365E',
      selectionContent: '#D9E2FF',
    });
    expect(getAccentColorSwatch('purple', 'light')).toBe(getAccentColorTokens('purple', 'light').primary);
    expect(getAccentColorSwatch('purple', 'dark')).toBe(getAccentColorTokens('purple', 'dark').primary);
    expect(getAccentColorSwatch('cyan', 'light')).toBe('#00A6C8');
    expect(getAccentColorSwatch('yellow', 'light')).toBe('#E6AD22');
    expect(getAccentColorSwatch('indigo', 'light')).toBe('#4052A8');
    expect(getAccentColorSwatch('wine', 'light')).toBe('#8E345B');
    for (const id of ['cyan', 'yellow', 'indigo', 'wine']) {
      expect(getAccentColorSwatch(id, 'dark')).not.toBe(getAccentColorSwatch(id, 'light'));
    }
    expect(Object.keys(getAccentColorTokens('orange', 'light')).sort()).toEqual([
      'focus', 'primary', 'primaryPressed', 'selectionContent', 'selectionSurface',
    ]);
    expect(authorizationPromptSource).toContain('theme.colors.info');
    expect(authorizationPromptSource).not.toContain('theme.colors.primary');
    expect(savedDocumentThumbnailSource).toContain('theme.colors.info');
    expect(savedDocumentThumbnailSource).not.toContain('theme.colors.primary');
    expect(glassComposerSource).toContain('seedColor={theme.colors.info}');
  });

  test('maintains readable contrast for accent buttons and selected labels in both schemes', () => {
    for (const { id } of ACCENT_COLOR_OPTIONS) {
      for (const mode of ['light', 'dark']) {
        const tokens = getAccentColorTokens(id, mode);
        const inverseText = mode === 'light' ? lightColors.textInverse : darkColors.textInverse;
        expect(contrastRatio(tokens.primary, inverseText)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.primaryPressed, inverseText)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.selectionContent, tokens.selectionSurface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(
          getAccentColorSwatch(id, mode),
          getAccentColorSwatchForeground(id, mode),
        )).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('exposes the selector inside the existing native SwiftUI settings navigation', () => {
    expect(settingsSource).toMatch(/<Host[\s\S]*?colorScheme=\{resolvedMode\}[\s\S]*?seedColor=\{theme\.colors\.primary\}/);
    expect(settingsSource).toMatch(/<NavigationLink value="appearance">[\s\S]*?Aparência[\s\S]*?Tema e cor de destaque/);
    expect(settingsSource).toMatch(/<NavigationDestination value="appearance">[\s\S]*?<AppearanceSettingsPage\s*\/>/);
    expect(settingsSource).toMatch(/<Picker[\s\S]*?pickerStyle\('segmented'\)[\s\S]*?Sistema[\s\S]*?Claro[\s\S]*?Escuro/);
    expect(settingsSource).toContain('getAccentColorRows()');
    expect(settingsSource).toContain('Circle');
    expect(settingsSource).toContain('frame({ width: 44, height: 44 })');
    expect(settingsSource).toContain('accessibilityValue(isSelected ? \'Selecionada\' : \'Não selecionada\')');
    expect(settingsSource).toContain('Restaurar cor padrão');
    expect(settingsSource).toContain("disabled(accentColor === 'black')");
    expect(settingsSource).toContain("setAccentColor('black')");
    expect(settingsSource).toContain('<NavigationDestination value="folders">');
    expect(settingsSource).not.toMatch(/<View|<RNHostView|<Pressable|<Modal|gorhom|Reanimated/);
  });

  test('keeps an appearance fallback without turning the separate Ajustes tab into another selector', () => {
    expect(fallbackSource).toContain("setCurrentPage('appearance')");
    expect(fallbackSource).toContain('Aparência');
    expect(fallbackSource).toContain('getAccentColorRows()');
    expect(fallbackSource).toContain('height: 44');
    expect(fallbackSource).toContain("onPress={() => setAccentColor('black')}");
    expect(fallbackSource).toContain('setAppearanceMode(mode)');
    expect(detailSettingsSource).toContain('Ajustes');
    expect(detailSettingsSource).not.toMatch(/AppearanceSheet|setAppearanceVisible|Ver aparência/);
    expect(collectionsSource).toContain('compactTitle="Coleções"');
    expect(collectionsSource).toContain('largeTitle={');
    expect(collectionsSource).not.toMatch(
      /Destaque|Componentes em uso|PremiumCard|NativeCardContextMenu|ScrollView|Abrir demonstração|ProgressiveBlur/,
    );
    expect(detailSource).not.toMatch(/AppearanceSheet|setAppearanceVisible|Abrir aparência|Abrir Bottom Sheet/);
    expect(detailSource).not.toMatch(/DemoToolbar/);
  });
});
