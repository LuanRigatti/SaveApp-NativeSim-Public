/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const rootSource = readSource('../src/app/_layout.tsx');
const progressiveScreenSource = readSource('../src/components/premium/ProgressiveCollapsibleScreen.tsx');
const detailRoutes = {
  folder: readSource('../src/app/folders/[id].tsx'),
  text: readSource('../src/app/texts/[id].tsx'),
  document: readSource('../src/app/documents/[id].tsx'),
  link: readSource('../src/app/links/[id].tsx'),
};

function getRootRouteOptions(routeName) {
  const start = rootSource.indexOf(`name="${routeName}"`);
  if (start === -1) return '';
  const nextScreen = rootSource.indexOf('<Stack.Screen', start + 1);
  return rootSource.slice(start, nextScreen === -1 ? rootSource.length : nextScreen);
}

describe('native progressive detail headers', () => {
  test('removes opaque Root Stack backgrounds from folder, text, and document detail routes', () => {
    for (const routeName of ['folders/[id]', 'texts/[id]', 'documents/[id]']) {
      const routeOptions = getRootRouteOptions(routeName);
      expect(routeOptions).toContain("headerTitle: ''");
      expect(routeOptions).toContain('headerTransparent: true');
      expect(routeOptions).not.toContain('headerStyle:');
    }
  });

  test('uses the checklist progressive header pipeline for scrollable details with matching top inset', () => {
    for (const routeSource of Object.values(detailRoutes)) {
      expect(routeSource).toContain('<ProgressiveCollapsibleScreen');
      expect(routeSource).toContain('nativeHeader');
      expect(routeSource).toContain('headerTitle: \'\'');
      expect(routeSource).toContain('headerTransparent: true');
      expect(routeSource).toContain('contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}');
    }
  });

  test('derives blur gradients from the active background and keeps the existing progressive intensities', () => {
    expect(progressiveScreenSource).toContain('colorWithAlpha(theme.colors.background, 0.99)');
    expect(progressiveScreenSource).toContain('const solidGradientColor = theme.colors.background;');
    expect(progressiveScreenSource).toMatch(/colors=\{\[[\s\S]*?theme\.colors\.background,[\s\S]*?colorWithAlpha\(theme\.colors\.background, 0\.2\)/);
    expect(progressiveScreenSource).toContain("'systemUltraThinMaterialDark'");
    expect(progressiveScreenSource).toContain("'systemUltraThinMaterialLight'");
    expect(progressiveScreenSource).not.toMatch(/'black'|'white'|'rgba\(0,\s*0,\s*0|rgba\(255,\s*255,\s*255/);
    expect(progressiveScreenSource).toContain('const MAX_BLUR_INTENSITY = 50;');
    expect(progressiveScreenSource).toContain('<BlurView intensity={15} tint={progressiveBlurTint}');
  });

  test('keeps fixed titles for text and document details and dynamic titles for folders and links', () => {
    expect(detailRoutes.folder).toContain('compactTitle={folderTitle}');
    expect(detailRoutes.folder).toContain('{folderTitle}');
    expect(detailRoutes.text).toContain('compactTitle="Texto"');
    expect(detailRoutes.text).toMatch(/>\s*Texto\s*<\/Text>/);
    expect(detailRoutes.text).toContain('{savedText.text}');
    expect(detailRoutes.text).not.toContain('presentation.title');
    expect(detailRoutes.document).toContain('compactTitle="Documento"');
    expect(detailRoutes.document).toMatch(/>\s*Documento\s*<\/Text>/);
    expect(detailRoutes.document).toMatch(/theme\.typography\.body,[\s\S]*?alignSelf: 'stretch',[\s\S]*?flexShrink: 1,[\s\S]*?minWidth: 0,[\s\S]*?\{document\.originalName\}/);
    expect(detailRoutes.document).not.toContain('compactTitle={document?.originalName');
    expect(detailRoutes.document).not.toContain('largeTitle={document?.originalName');
    expect(detailRoutes.link).toContain('compactTitle={linkTitle}');
    expect(detailRoutes.link).toContain('{linkTitle}');
  });

  test('leaves immersive photo and video presentation contracts unchanged', () => {
    const photoRoute = readSource('../src/app/photos/[id].tsx');
    const videoRouteStart = rootSource.indexOf('name="videos/[id]"');
    const videoRouteEnd = rootSource.indexOf('<Stack.Screen', videoRouteStart + 1);
    const videoRouteOptions = rootSource.slice(videoRouteStart, videoRouteEnd);

    expect(rootSource).toMatch(/name="photos\/\[id\]"[\s\S]*?headerShown: false/);
    expect(videoRouteOptions).toMatch(/headerStyle: \{ backgroundColor: '#000000' \}/);
    expect(videoRouteOptions).toMatch(/headerTransparent: false/);
    expect(photoRoute).toContain('Link.AppleZoomTarget');
  });
});
