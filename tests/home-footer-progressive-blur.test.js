/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const homeSource = readSource('../src/app/(tabs)/index.tsx');
const blurSource = readSource('../src/components/ui/progressive-blur.tsx');
const collapsibleScreenSource = readSource('../src/components/premium/ProgressiveCollapsibleScreen.tsx');

describe('Home footer progressive blur', () => {
  test('reuses the shared bottom-edge blur behind iOS Home controls without intercepting touches', () => {
    expect(homeSource).toMatch(/import \{ ProgressiveBlur, ProgressiveCollapsibleScreen \} from '@\/components\/premium'/);
    expect(homeSource).toMatch(/fixedContent=\{\s*Platform\.OS === 'ios' \? \([\s\S]*?<ProgressiveBlur[\s\S]*?edge="bottom"/);
    expect(homeSource).toMatch(/insets\.bottom \+[\s\S]*?theme\.sizes\.touchTargetMinimum[\s\S]*?theme\.spacing\.lg/);
    expect(homeSource).toMatch(/intensity=\{15\}[\s\S]*?layers=\{1\}/);
    expect(homeSource).toMatch(/overlayColors=\{getProgressiveBlurOverlayColors\(theme\.colors\.background, 'bottom'\)\}/);
    expect(blurSource).toMatch(/<View pointerEvents="none" style=\{\[styles\.container, \{ height \}, style\]\}>/);
    expect(blurSource).toMatch(/export function getProgressiveBlurOverlayColors[\s\S]*?progressiveBlurColorWithAlpha\(backgroundColor, 0\.2\)[\s\S]*?\[backgroundColor, softenedBackground\][\s\S]*?\[softenedBackground, backgroundColor\]/);
    expect(blurSource).toMatch(/const maskBottomOverlay = edge === 'bottom' && overlayColors\?\.length === 2/);
    expect(blurSource).toMatch(/maskBottomOverlay && index === 0 && overlayColors[\s\S]*?<LinearGradient colors=\{overlayColors\} style=\{StyleSheet\.absoluteFill\} \/>/);
    expect(blurSource).toMatch(/\{overlayColors && !maskBottomOverlay \?/);
    expect(blurSource).toMatch(/const maskColors[\s\S]*?edge === 'top'[\s\S]*?: \['transparent', 'transparent', 'rgba\(0, 0, 0, 0\.18\)', '#000000', '#000000'\]/);
    expect(collapsibleScreenSource).toMatch(/getProgressiveBlurOverlayColors\(theme\.colors\.background, 'top'\)/);
    expect(collapsibleScreenSource).toMatch(/fixedContent \? \([\s\S]*?<View pointerEvents="box-none" style=\{styles\.fixedContent\}>/);
    expect(homeSource).toMatch(/<Stack\.Toolbar placement="bottom">[\s\S]*?<Stack\.Toolbar\.SearchBarSlot[\s\S]*?<Stack\.Toolbar\.Menu[\s\S]*?icon="plus"/);
  });
});
