const EMPTY_LINE_HIT_WIDTH = 44;
const HORIZONTAL_TEXT_TOLERANCE = 6;
const VERTICAL_TEXT_TOLERANCE = 6;

export function isTouchWithinRichNoteTextLine({
  availableWidth,
  containerHeight,
  lineHeight,
  lines,
  verticalPadding = 0,
  x,
  y,
}: {
  availableWidth: number;
  containerHeight: number;
  lineHeight: number;
  lines: readonly { width: number; height: number }[];
  verticalPadding?: number;
  x: number;
  y: number;
}): boolean {
  if (
    !Number.isFinite(availableWidth) || availableWidth <= 0
    || !Number.isFinite(containerHeight) || containerHeight <= 0
    || !Number.isFinite(lineHeight) || lineHeight <= 0
    || !Number.isFinite(x) || !Number.isFinite(y)
  ) return false;

  const renderedLines = lines.length > 0 ? lines : [{ width: 0, height: lineHeight }];
  const resolvedLineHeights = renderedLines.map((line) => (
    Number.isFinite(line.height) && line.height > 0 ? line.height : lineHeight
  ));
  const textHeight = resolvedLineHeights.reduce((total, height) => total + height, 0);
  const verticalInset = verticalPadding + Math.max(0, (containerHeight - (textHeight + verticalPadding * 2)) / 2);

  let lineTop = verticalInset;
  return renderedLines.some((line, index) => {
    const lineHeightForHit = resolvedLineHeights[index];
    const lineHitWidth = Number.isFinite(line.width) && line.width > 0
      ? Math.min(availableWidth, line.width + HORIZONTAL_TEXT_TOLERANCE)
      : Math.min(availableWidth, EMPTY_LINE_HIT_WIDTH);
    const top = lineTop - VERTICAL_TEXT_TOLERANCE;
    const bottom = lineTop + lineHeightForHit + VERTICAL_TEXT_TOLERANCE;
    lineTop += lineHeightForHit;
    return x >= 0 && x <= lineHitWidth && y >= top && y <= bottom;
  });
}
