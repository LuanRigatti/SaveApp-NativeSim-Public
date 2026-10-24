/* global __dirname, describe, expect, test */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const viewerSource = readFileSync(join(__dirname, '../src/app/photos/[id].tsx'), 'utf8');
const rootLayoutSource = readFileSync(join(__dirname, '../src/app/_layout.tsx'), 'utf8');
const buttonSource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoViewerCloseButtonSwiftUI.ios.tsx'),
  'utf8',
);
const { isPhotoViewerZoomed, PHOTO_VIEWER_MAX_ZOOM_SCALE } = require('../src/features/photos/photoViewerZoom');

describe('photo viewer zoom', () => {
  test('uses native iOS ScrollView zoom with a four-times maximum', () => {
    expect(PHOTO_VIEWER_MAX_ZOOM_SCALE).toBe(4);
    expect(viewerSource).toMatch(/minimumZoomScale=\{1\}/);
    expect(viewerSource).toMatch(/maximumZoomScale=\{PHOTO_VIEWER_MAX_ZOOM_SCALE\}/);
    expect(viewerSource).toMatch(/pinchGestureEnabled/);
    expect(viewerSource).toMatch(/centerContent/);
    expect(viewerSource).toMatch(/<Link\.AppleZoomTarget>\{image\}<\/Link\.AppleZoomTarget>/);
    expect(viewerSource).toMatch(/Platform\.OS === 'ios' && zoomableImage/);
  });

  test('locks zoom-transition dismissal only while the image is enlarged', () => {
    expect(isPhotoViewerZoomed(1)).toBe(false);
    expect(isPhotoViewerZoomed(1.02)).toBe(false);
    expect(isPhotoViewerZoomed(1.03)).toBe(true);
    expect(isPhotoViewerZoomed(4)).toBe(true);
    expect(isPhotoViewerZoomed(Number.NaN)).toBe(false);
    expect(viewerSource).toMatch(/\(\) => \(\{ gestureEnabled: !isImageZoomed, headerShown: false \}\)/);
    expect(viewerSource).toMatch(/<Stack\.Screen options=\{screenOptions\} \/>/);
    expect(viewerSource).not.toMatch(/usePreventZoomTransitionDismissal/);
    expect(rootLayoutSource).toMatch(/presentation: 'fullScreenModal' as const/);
  });

  test('keeps interactive zoom and stack controls out of the native preview route', () => {
    expect(viewerSource).toMatch(/const isPreview = useIsPreview\(\);[\s\S]*?isPreview \?[\s\S]*?<PhotoViewerPreviewScreen id=\{id\} \/>[\s\S]*?<InteractivePhotoViewerScreen id=\{id\} \/>/);

    const previewScreen = viewerSource.match(
      /function PhotoViewerPreviewScreen\([\s\S]*?(?=\nfunction InteractivePhotoViewerScreen)/,
    )?.[0];

    expect(previewScreen).toBeDefined();
    expect(previewScreen).not.toMatch(/ScrollView|Stack\.Screen|usePreventZoomTransitionDismissal|PhotoViewerCloseButton/);
    expect(viewerSource).toMatch(/function InteractivePhotoViewerScreen/);
    expect(viewerSource).toMatch(/const isFocused = useIsFocused\(\)/);
    expect(viewerSource).toMatch(/gestureEnabled: !isImageZoomed/);
    expect(viewerSource).toMatch(/onScroll=\{handlePhotoZoomScroll\}/);
    expect(viewerSource).toMatch(/if \(!isFocused\) \{\s*return;/);
  });

  test('updates zoom state only when crossing the effective zoom threshold', () => {
    expect(viewerSource).toMatch(
      /if \(currentIsZoomed !== nextIsZoomed\) \{[\s\S]*?setZoomStatus\(nextStatus\);/,
    );
  });

  test('enlarges the native glass close control without constraining its Host', () => {
    expect(buttonSource).toMatch(/PHOTO_VIEWER_CLOSE_BUTTON_SIZE = 50/);
    expect(buttonSource).toMatch(/controlSize\('large'\)/);
    expect(buttonSource).toMatch(/width: PHOTO_VIEWER_CLOSE_BUTTON_SIZE/);
    expect(buttonSource).toMatch(/height: PHOTO_VIEWER_CLOSE_BUTTON_SIZE/);
    expect(buttonSource).toMatch(/buttonStyle\('glass'\)/);
    expect(buttonSource).toMatch(/systemName="xmark"/);
  });
});
