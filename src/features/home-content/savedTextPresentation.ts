import { getLinkPreviewSize } from './linkPreviewLayout';

export type SavedTextPresentation = {
  title: string;
  secondaryText: string | null;
  thumbnailText: string;
  previewText: string;
};

export type SavedTextPreviewSize = { width: number; height: number };

export function getSavedTextPresentation(value: string): SavedTextPresentation {
  const previewText = value.replace(/\r\n?/g, '\n').trim();
  const lines = previewText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? 'Texto salvo';

  return {
    title,
    secondaryText: lines.slice(1).join(' ').trim() || null,
    thumbnailText: previewText || title,
    previewText: previewText || title,
  };
}

export function getSavedTextPreviewSize(screenWidth: number): SavedTextPreviewSize {
  // Match the largest link preview layout so the frame stays tall and stable
  // regardless of the note's content length.
  return getLinkPreviewSize(screenWidth, true, true);
}
