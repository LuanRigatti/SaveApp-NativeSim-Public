const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const layoutSource = readFileSync(join(__dirname, '../src/app/_layout.tsx'), 'utf8');
const viewerSource = readFileSync(join(__dirname, '../src/app/videos/[id].tsx'), 'utf8');
const { createVideoViewerCloseHandler } = require('../src/features/photos/videoPlayerNavigation');

describe('video viewer navigation and native player contract', () => {
  test('uses Apple Zoom on iOS 18+ and keeps the vertical fallback on unsupported platforms', () => {
    const videoRoute = layoutSource.match(/name="videos\/\[id\]"[\s\S]*?options=\{\{([\s\S]*?)\}\}/)?.[1];

    expect(videoRoute).toBeTruthy();
    expect(videoRoute).toMatch(/gestureEnabled:\s*true/);
    expect(videoRoute).toMatch(/Platform\.OS === 'ios' && Number\(Platform\.Version\) >= 18/);
    expect(videoRoute).toMatch(/gestureDirection:\s*'vertical' as const/);
    expect(videoRoute).toMatch(/fullScreenGestureEnabled:\s*true/);
    expect(videoRoute).toMatch(/animation:\s*'slide_from_bottom' as const/);
    expect(videoRoute).toMatch(/animationMatchesGesture:\s*true/);
    expect(videoRoute).not.toMatch(/gestureResponseDistance/);
    expect(videoRoute).toMatch(/headerShown:\s*true/);
    expect(videoRoute).toMatch(/headerTransparent:\s*false/);
    expect(videoRoute).toMatch(/headerStyle:\s*\{\s*backgroundColor:\s*'#000000'/);
    expect(videoRoute).toMatch(/headerBackVisible:\s*Platform\.OS\s*!==\s*'ios'/);
  });

  test('keeps AVKit controls and disables its redundant fullscreen presentation', () => {
    expect(viewerSource).toMatch(/nativeControls/);
    expect(viewerSource).toMatch(/fullscreenOptions=\{\{\s*enable:\s*false\s*\}\}/);
    expect(viewerSource).toMatch(/<SafeAreaView[\s\S]*?edges=\{\['bottom', 'left', 'right'\]\}/);
    expect(viewerSource).toMatch(/<Link\.AppleZoomTarget>\{videoSurface\}<\/Link\.AppleZoomTarget>/);
    expect(viewerSource).toMatch(/pointerEvents="none"/);
    expect(viewerSource).toMatch(/<StatusBar style="light"\s*\/>/);
    expect(viewerSource).toMatch(/icon="xmark"/);
    expect(viewerSource).toMatch(/accessibilityLabel="Fechar vídeo"/);
  });

  test('pauses when the route loses focus and relies on useVideoPlayer cleanup on unmount', () => {
    expect(viewerSource).toMatch(/useVideoPlayer\(video\?\.uri \?\? null/);
    expect(viewerSource).toMatch(/useFocusEffect\([\s\S]*?return \(\) => player\.pause\(\)/);
    expect(viewerSource).not.toMatch(/player\.release\(\)/);
  });

  test('pauses and returns once, using Home as a fallback when no route is behind the viewer', () => {
    const back = jest.fn();
    const canGoBack = jest.fn(() => true);
    const pause = jest.fn();
    const replaceHome = jest.fn();
    const close = createVideoViewerCloseHandler({ back, canGoBack, pause, replaceHome });

    close();
    close();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    expect(replaceHome).not.toHaveBeenCalled();

    const fallbackClose = createVideoViewerCloseHandler({
      back,
      canGoBack: () => false,
      pause,
      replaceHome,
    });
    fallbackClose();

    expect(pause).toHaveBeenCalledTimes(2);
    expect(replaceHome).toHaveBeenCalledTimes(1);
  });
});
