/* global __dirname, describe, expect, jest, test */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const gallerySource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'),
  'utf8',
);
const mediaItemSource = gallerySource.match(
  /const renderMediaItem = useCallback\([\s\S]*?(?=\n  const renderSavedContentItem)/,
)?.[0];
const viewerSource = readFileSync(join(__dirname, '../src/app/photos/[id].tsx'), 'utf8');
const rootLayoutSource = readFileSync(join(__dirname, '../src/app/_layout.tsx'), 'utf8');
const closeButtonSource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoViewerCloseButton.native.tsx'),
  'utf8',
);
const swiftUICloseButtonSource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoViewerCloseButtonSwiftUI.ios.tsx'),
  'utf8',
);
const fallbackCloseButtonSource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoViewerCloseButtonFallback.tsx'),
  'utf8',
);
const visualCapabilitiesSource = readFileSync(
  join(__dirname, '../src/theme/visualCapabilities.ts'),
  'utf8',
);
const { createPhotoViewerCloseHandler } = require('../src/features/photos/photoViewerNavigation');

describe('photo viewer navigation', () => {
  test('keeps simple tap on Apple Zoom and opens the preview into the same photo route', () => {
    expect(gallerySource).toMatch(/<Link\.AppleZoom>\{mediaImage\}<\/Link\.AppleZoom>/);
    expect(gallerySource).toMatch(/const href =[\s\S]*?pathname: '\/photos\/\[id\]'[\s\S]*?params: \{ id: String\(item\.id\) \}/);
    expect(gallerySource).toMatch(
      /<Link asChild href=\{href\}>[\s\S]*?<Link\.Trigger>\{mediaTrigger\}<\/Link\.Trigger>[\s\S]*?<Link\.Preview[\s\S]*?<Link\.Menu>/,
    );
    expect(viewerSource).toMatch(/<Link\.AppleZoomTarget>\{image\}<\/Link\.AppleZoomTarget>/);
  });

  test('uses the documented modal presentation for iOS preview promotion without changing the tap target', () => {
    expect(rootLayoutSource).toMatch(/const supportsAppleZoom = Platform\.OS === 'ios' && Number\(Platform\.Version\) >= 18/);
    expect(rootLayoutSource).toMatch(/name="photos\/\[id\]"[\s\S]*?supportsAppleZoom \? \{ presentation: 'fullScreenModal' as const \} : \{\}/);
    expect(gallerySource).toMatch(/const href =\s*item\.mediaType === 'video'[\s\S]*?: \{ pathname: '\/photos\/\[id\]' as const, params: \{ id: String\(item\.id\) \} \}/);
    expect(gallerySource).toMatch(/<Link asChild href=\{href\}>[\s\S]*?<Link\.Trigger>\{mediaTrigger\}<\/Link\.Trigger>[\s\S]*?<Link\.Preview[\s\S]*?<Link\.Menu>/);
    expect(mediaItemSource).toBeDefined();
    expect(mediaItemSource).not.toMatch(/setTimeout|router\.(push|navigate)\(/);
  });

  test('provides an accessible native close control while keeping the photo header hidden', () => {
    expect(viewerSource).toMatch(/const screenOptions = useMemo\([\s\S]*?gestureEnabled: !isImageZoomed[\s\S]*?headerShown: false/);
    expect(viewerSource).toMatch(/<Stack\.Screen options=\{screenOptions\} \/>/);
    expect(viewerSource).toMatch(/<PhotoViewerCloseButton[\s\S]*?onPress=\{closePhoto\}/);
    expect(viewerSource).toMatch(/useSafeAreaInsets\(\)/);
    expect(closeButtonSource).toMatch(/useVisualCapabilities\(\)/);
    expect(closeButtonSource).toMatch(/hasExpoUiNativeModule\(\)/);
    expect(closeButtonSource).not.toMatch(/environment === 'development-build'/);
    expect(closeButtonSource).toMatch(/PhotoViewerCloseButtonFallback/);
    expect(swiftUICloseButtonSource).toMatch(/buttonStyle\('glass'\)/);
    expect(swiftUICloseButtonSource).toMatch(/buttonBorderShape\('circle'\)/);
    expect(swiftUICloseButtonSource).toMatch(/preferredColorScheme\(resolvedMode\)/);
    expect(swiftUICloseButtonSource).toMatch(/systemName="xmark"/);
    expect(swiftUICloseButtonSource).toMatch(/accessibilityLabel\('Fechar foto'\)/);
    expect(swiftUICloseButtonSource).toMatch(/PHOTO_VIEWER_CLOSE_BUTTON_SIZE = 50/);
    expect(closeButtonSource).toMatch(/glassAvailable=\{useGlass\}/);
    expect(
      readFileSync(join(__dirname, '../src/components/photos/PhotoViewerCloseButtonFallback.tsx'), 'utf8'),
    ).toMatch(/<GlassView[\s\S]*?glassEffectStyle="regular"[\s\S]*?pointerEvents="none"/);
    expect(visualCapabilitiesSource).toMatch(
      /useGlass: isLiquidGlassAvailable && !reduceTransparencyEnabled/,
    );
  });

  test('keeps one close control and one mutually exclusive glass surface per runtime path', () => {
    expect((viewerSource.match(/<PhotoViewerCloseButton\b/g) ?? [])).toHaveLength(1);
    expect(closeButtonSource).toMatch(
      /if \(Platform\.OS === 'ios' && useGlass && hasExpoUiNativeModule\(\)\) \{[\s\S]*?return <PhotoViewerCloseButtonSwiftUI \{\.\.\.props\} \/>;\s*\}[\s\S]*?return <PhotoViewerCloseButtonFallback/,
    );
    expect((swiftUICloseButtonSource.match(/<Button\b/g) ?? [])).toHaveLength(1);
    expect(swiftUICloseButtonSource).not.toMatch(/GlassView|<View\b|background\(|overlay\(|borderColor|borderWidth/);
    expect((fallbackCloseButtonSource.match(/<Pressable\b/g) ?? [])).toHaveLength(1);
    expect((fallbackCloseButtonSource.match(/<GlassView\b/g) ?? [])).toHaveLength(1);
    expect((fallbackCloseButtonSource.match(/<View\b/g) ?? [])).toHaveLength(1);
    expect(fallbackCloseButtonSource).toMatch(
      /glassAvailable \? \([\s\S]*?<GlassView[\s\S]*?\) : \([\s\S]*?<View/,
    );
  });

  test('returns once when stack history exists', () => {
    const back = jest.fn();
    const canGoBack = jest.fn(() => true);
    const replaceHome = jest.fn();
    const close = createPhotoViewerCloseHandler({ back, canGoBack, replaceHome });

    close();
    close();

    expect(canGoBack).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    expect(replaceHome).not.toHaveBeenCalled();
  });

  test('replaces with Home when no safe back route exists', () => {
    const back = jest.fn();
    const canGoBack = jest.fn(() => false);
    const replaceHome = jest.fn();
    const close = createPhotoViewerCloseHandler({ back, canGoBack, replaceHome });

    close();

    expect(canGoBack).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(replaceHome).toHaveBeenCalledTimes(1);
    expect(viewerSource).toMatch(/replaceHome: \(\) => router\.replace\('\/'\)/);
  });

  test('preserves the native destructive delete action in the photo menu', () => {
    expect(gallerySource).toMatch(/title=\{isVideo \? 'Apagar vídeo' : 'Apagar imagem'\}/);
    expect(gallerySource).toMatch(/icon="trash"[\s\S]*?destructive/);
    expect(gallerySource).toMatch(/requestDeleteMedia\([\s\S]*?prepareForMediaRemovalAnimation,[\s\S]*?authorizeItemForAction\(item\.mediaType, item\.id\)/);
  });
});
