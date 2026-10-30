export type RichNoteInputHeightOptions = {
  measuredHeight: number;
  text: string;
  lineHeight: number;
  minimumHeight?: number;
  verticalPadding?: number;
};

function explicitLineCount(text: string): number {
  return Math.max(1, text.split(/\r\n|\r|\n/).length);
}

/**
 * Keep an empty line after Return inside the native TextInput's measured frame.
 * React Native's content-size event can temporarily report the previous viewport
 * height while the controlled value and keyboard layout are being reconciled.
 */
export function getRichNoteInputHeight({
  measuredHeight,
  text,
  lineHeight,
  minimumHeight = lineHeight,
  verticalPadding = 0,
}: RichNoteInputHeightOptions): number {
  const safeLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 1;
  const safeMinimumHeight = Number.isFinite(minimumHeight) && minimumHeight > 0 ? minimumHeight : safeLineHeight;
  const safePadding = Number.isFinite(verticalPadding) && verticalPadding > 0 ? verticalPadding : 0;
  const requiredTextHeight = explicitLineCount(text) * safeLineHeight;
  const safeMeasurement = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : 0;

  return Math.max(safeMinimumHeight, Math.ceil(Math.max(requiredTextHeight, safeMeasurement) + safePadding));
}
