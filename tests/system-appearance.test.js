/* global describe, expect, jest, test */

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
  clearLegacyThemePreference,
  LEGACY_THEME_MODE_STORAGE_KEY,
  resolveSystemThemeMode,
} = require('../src/theme/systemAppearance');

const root = join(__dirname, '..');
const providerSource = readFileSync(join(root, 'src/theme/ThemeProvider.tsx'), 'utf8');
const contextTypesSource = readFileSync(join(root, 'src/theme/types.ts'), 'utf8');
const appConfigSource = readFileSync(join(root, 'app.config.js'), 'utf8');
const settingsSource = readFileSync(join(root, 'src/app/(tabs)/settings.tsx'), 'utf8');
const collectionsSource = readFileSync(join(root, 'src/app/(tabs)/collections.tsx'), 'utf8');
const detailSource = readFileSync(join(root, 'src/app/details/[id].tsx'), 'utf8');

describe('system-only appearance', () => {
  test.each([
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'light'],
  ])('resolves the current iOS scheme %s to %s', (systemScheme, expected) => {
    expect(resolveSystemThemeMode(systemScheme)).toBe(expected);
  });

  test('clears only the obsolete appearance preference and preserves other settings', async () => {
    const values = new Map([
      [LEGACY_THEME_MODE_STORAGE_KEY, 'dark'],
      ['@saveapp/home-view-mode', 'compact-list'],
    ]);
    const removeItem = jest.fn(async (key) => values.delete(key));

    await clearLegacyThemePreference({ removeItem });

    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(LEGACY_THEME_MODE_STORAGE_KEY);
    expect(values.has(LEGACY_THEME_MODE_STORAGE_KEY)).toBe(false);
    expect(values.get('@saveapp/home-view-mode')).toBe('compact-list');
  });

  test('keeps system appearance working when legacy preference cleanup fails', async () => {
    await expect(
      clearLegacyThemePreference({
        removeItem: async () => {
          throw new Error('storage unavailable');
        },
      }),
    ).resolves.toBeUndefined();
    expect(resolveSystemThemeMode('dark')).toBe('dark');
  });

  test('derives the theme reactively from useColorScheme without reading or writing a mode override', () => {
    expect(providerSource).toContain('useColorScheme()');
    expect(providerSource).toContain('resolveSystemThemeMode(systemScheme)');
    expect(providerSource).toContain("resolvedMode === 'dark' ? darkTheme : lightTheme");
    expect(providerSource).not.toMatch(/AsyncStorage\.(getItem|setItem)/);
    expect(providerSource).not.toMatch(/\bsetMode\b|\bThemeMode\b|\bisReady\b/);
    expect(contextTypesSource).not.toMatch(/\bsetMode\b|\bThemeMode\b|\bisReady\b/);
    expect(appConfigSource).toContain("userInterfaceStyle: 'automatic'");
  });

  test('removes the appearance selector from settings and other demo entry points', () => {
    expect(settingsSource).toContain('Ajustes');
    expect(settingsSource).not.toMatch(/Aparência|AppearanceSheet|PremiumCard/);
    expect(collectionsSource).toContain('compactTitle="Coleções"');
    expect(collectionsSource).toContain('largeTitle={');
    expect(collectionsSource).toContain('Coleções');
    expect(collectionsSource).not.toMatch(
      /Destaque|Componentes em uso|PremiumCard|NativeCardContextMenu|ScrollView|Abrir demonstração|ProgressiveBlur/,
    );
    expect(collectionsSource).not.toMatch(/AppearanceSheet|setAppearanceVisible|Ver aparência/);
    expect(detailSource).not.toMatch(/AppearanceSheet|setAppearanceVisible|Abrir aparência|Abrir Bottom Sheet/);
    expect(detailSource).not.toMatch(/DemoToolbar/);
    expect(existsSync(join(root, 'src/components/demo/AppearanceSheet.tsx'))).toBe(false);
    expect(existsSync(join(root, 'src/components/demo/DemoToolbar.tsx'))).toBe(false);
  });
});
