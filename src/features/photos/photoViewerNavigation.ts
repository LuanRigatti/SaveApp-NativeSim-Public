type PhotoViewerCloseDependencies = {
  back: () => void;
  canGoBack: () => boolean;
  replaceHome: () => void;
};

export function createPhotoViewerCloseHandler({
  back,
  canGoBack,
  replaceHome,
}: PhotoViewerCloseDependencies): () => void {
  let isClosing = false;

  return () => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    if (canGoBack()) {
      back();
      return;
    }

    replaceHome();
  };
}
