type VideoViewerCloseDependencies = {
  back: () => void;
  canGoBack: () => boolean;
  pause: () => void;
  replaceHome: () => void;
};

export function createVideoViewerCloseHandler({
  back,
  canGoBack,
  pause,
  replaceHome,
}: VideoViewerCloseDependencies): () => void {
  let isClosing = false;

  return () => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    pause();
    if (canGoBack()) {
      back();
      return;
    }

    replaceHome();
  };
}
