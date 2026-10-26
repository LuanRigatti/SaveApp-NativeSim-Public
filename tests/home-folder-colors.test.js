/* global describe, expect, test */

const { getHomeFolderAccentColor } = require('../src/features/home-folders/homeFolderColor');
const { getAccentColorTokens } = require('../src/theme/colors');

describe('individual home folder colors', () => {
  test('uses the live app accent when a folder is set to Padrão', () => {
    expect(getHomeFolderAccentColor(null, 'purple', 'light')).toBe(
      getAccentColorTokens('purple', 'light').primary,
    );
    expect(getHomeFolderAccentColor(null, 'black', 'dark')).toBe(
      getAccentColorTokens('black', 'dark').primary,
    );
  });

  test('keeps a custom folder accent independent from the app accent and resolves contrast by theme', () => {
    expect(getHomeFolderAccentColor('cyan', 'red', 'light')).toBe(
      getAccentColorTokens('cyan', 'light').primary,
    );
    expect(getHomeFolderAccentColor('cyan', 'red', 'dark')).toBe(
      getAccentColorTokens('cyan', 'dark').primary,
    );
    expect(getHomeFolderAccentColor('cyan', 'blue', 'dark')).toBe(
      getHomeFolderAccentColor('cyan', 'purple', 'dark'),
    );
  });
});
