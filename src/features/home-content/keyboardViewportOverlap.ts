export type WindowRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export function getDockedKeyboardViewportOverlap({
  viewport,
  keyboard,
}: {
  viewport: WindowRect;
  keyboard: WindowRect;
}): number {
  if (keyboard.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 0;

  const viewportRight = viewport.x + viewport.width;
  const viewportBottom = viewport.y + viewport.height;
  const keyboardRight = keyboard.x + keyboard.width;
  const keyboardBottom = keyboard.y + keyboard.height;
  const keyboardCoversViewportWidth = keyboard.x <= viewport.x && keyboardRight >= viewportRight;
  const keyboardIsDockedAtViewportBottom = keyboardBottom >= viewportBottom;

  if (!keyboardCoversViewportWidth || !keyboardIsDockedAtViewportBottom) return 0;

  return Math.max(0, Math.min(viewport.height, viewportBottom - Math.max(viewport.y, keyboard.y)));
}
