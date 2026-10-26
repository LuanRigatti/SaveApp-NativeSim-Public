type ChecklistTaskInputHeightOptions = {
  measuredHeight: number;
  text: string;
  availableWidth: number;
  fontSize: number;
  lineHeight: number;
  minimumHeight?: number;
};

type ChecklistCheckboxTopOffsetOptions = {
  contentHeight: number;
  firstLineHeight: number;
  rowHeight: number;
  checkboxSize: number;
};

/**
 * Align the checkbox with the first text line. Short text stays centered in
 * the minimum-height row; multiline text starts at the row top.
 */
export function getChecklistCheckboxTopOffset({
  contentHeight,
  firstLineHeight,
  rowHeight,
  checkboxSize,
}: ChecklistCheckboxTopOffsetOptions): number {
  const safeContentHeight = Number.isFinite(contentHeight) && contentHeight > 0
    ? contentHeight
    : rowHeight;
  const safeFirstLineHeight = Number.isFinite(firstLineHeight) && firstLineHeight > 0
    ? firstLineHeight
    : checkboxSize;
  const contentTop = Math.max(0, (rowHeight - safeContentHeight) / 2);
  const firstLineOffset = Math.max(0, (safeFirstLineHeight - checkboxSize) / 2);

  return Math.max(0, contentTop + firstLineOffset);
}

/**
 * TextInput can report its resized viewport as content height during keyboard
 * layout changes. Bound that measurement by the text and the actual row width.
 */
export function getBoundedChecklistTaskInputHeight({
  measuredHeight,
  text,
  availableWidth,
  fontSize,
  lineHeight,
  minimumHeight = 44,
}: ChecklistTaskInputHeightOptions): number {
  const minHeight = Math.max(minimumHeight, Math.ceil(lineHeight));
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return minHeight;

  const estimatedLines = text.split(/\r\n|\r|\n/).reduce((total, paragraph) => {
    const characterCount = Array.from(paragraph).length;
    const wrappedLines = Math.ceil((characterCount * fontSize * 0.7) / availableWidth);
    return total + Math.max(1, wrappedLines);
  }, 0);
  const plausibleMaximum = Math.max(minHeight, Math.ceil(estimatedLines * lineHeight) + 8);
  const safeMeasurement = Number.isFinite(measuredHeight) && measuredHeight > 0
    ? Math.ceil(measuredHeight)
    : minHeight;

  return Math.max(minHeight, Math.min(safeMeasurement, plausibleMaximum));
}
