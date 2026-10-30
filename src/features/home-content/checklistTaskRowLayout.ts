type ChecklistTaskInputHeightOptions = {
  measuredHeight: number;
  text: string;
  availableWidth: number;
  fontSize: number;
  lineHeight: number;
  minimumHeight?: number;
  verticalPadding?: number;
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
  verticalPadding = 8,
}: ChecklistTaskInputHeightOptions): number {
  const minHeight = Math.max(minimumHeight, Math.ceil(lineHeight));
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return minHeight;
  const safeVerticalPadding = Number.isFinite(verticalPadding) && verticalPadding > 0 ? verticalPadding : 0;

  const estimatedLines = text.split(/\r\n|\r|\n/).reduce((total, paragraph) => {
    // Estimate common Latin glyph widths without inflating short tasks; use
    // full-em width for wide BMP glyphs and two em for astral symbols/emoji.
    // This keeps the cap conservative for full-width text without turning
    // ordinary short rows into extra lines during a transient viewport event.
    const estimatedTextWidth = Array.from(paragraph).reduce((width, character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      const isWideBmp = (codePoint >= 0x1100 && codePoint <= 0x11ff)
        || (codePoint >= 0x2300 && codePoint <= 0x23ff)
        || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
        || (codePoint >= 0xac00 && codePoint <= 0xd7af)
        || (codePoint >= 0xf900 && codePoint <= 0xfaff)
        || (codePoint >= 0xfe10 && codePoint <= 0xfe6f)
        || (codePoint >= 0xff01 && codePoint <= 0xff60)
        || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
        || (codePoint >= 0x2600 && codePoint <= 0x27bf);
      const emWidth = codePoint > 0xffff
        ? 2
        : isWideBmp
          ? 1
          : /[MWmw@%&]/.test(character)
            ? 0.95
            : /[ilI1.,:;'`!|]/.test(character) || /\s/.test(character)
              ? 0.35
              : 0.7;
      return width + fontSize * emWidth;
    }, 0);
    const wrappedLines = Math.ceil(estimatedTextWidth / availableWidth);
    return total + Math.max(1, wrappedLines);
  }, 0);
  const plausibleMaximum = Math.max(minHeight, Math.ceil(estimatedLines * lineHeight) + safeVerticalPadding);
  const safeMeasurement = Number.isFinite(measuredHeight) && measuredHeight > 0
    ? Math.ceil(measuredHeight)
    : minHeight;

  return Math.max(minHeight, Math.min(safeMeasurement, plausibleMaximum));
}
