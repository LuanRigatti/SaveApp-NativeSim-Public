import type { RichNoteBlock } from './richNoteDocument';

export type RichNotePlaceholderFocus =
  | { kind: 'paragraph'; blockId: string }
  | { kind: 'checklist'; blockId: string; itemId: string }
  | null;

function isEmptyBodyParagraph(block: RichNoteBlock | undefined): block is Extract<RichNoteBlock, { type: 'paragraph' }> {
  return block?.type === 'paragraph' && block.style === 'body' && block.text.length === 0;
}

export function getRichNoteBodyPlaceholderBlockId(
  blocks: readonly RichNoteBlock[],
  focusedInput: RichNotePlaceholderFocus,
): string | null {
  if (focusedInput?.kind === 'checklist') return null;

  if (focusedInput?.kind === 'paragraph') {
    const focusedBlock = blocks.find((block) => block.id === focusedInput.blockId);
    if (isEmptyBodyParagraph(focusedBlock)) return focusedBlock.id;
  }

  const lastBlock = blocks.at(-1);
  return isEmptyBodyParagraph(lastBlock) ? lastBlock.id : null;
}
