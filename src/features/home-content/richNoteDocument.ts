import * as Crypto from 'expo-crypto';
import { canFetchLinkPreview, normalizeWebLink } from './linkValidation';

export const RICH_NOTE_STORAGE_PREFIX = 'SAVEAPP_RICH_NOTE_V1:';
export const RICH_NOTE_FORMAT = 'saveapp-rich-note';
export const RICH_NOTE_VERSION = 1 as const;
const SAFE_NOTE_IMAGE_PATH = /^notes\/assets\/image-[a-z0-9-]+\.(?:avif|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;

export type RichNoteParagraphStyle = 'body' | 'title' | 'subtitle';
export type RichNoteListStyle = 'none' | 'bullet' | 'numbered';
export type RichNoteImageSize = 'small' | 'medium' | 'full';

export type RichNoteParagraphBlock = {
  id: string;
  type: 'paragraph';
  text: string;
  style: RichNoteParagraphStyle;
  role?: 'document-title';
  bold: boolean;
  italic: boolean;
  underline: boolean;
  listStyle: RichNoteListStyle;
};

export type RichNoteImageBlock = {
  id: string;
  type: 'image';
  assetId: string;
  relativePath?: string;
  sourceUri?: string;
  mimeType: string | null;
  width: number;
  height: number;
  size: RichNoteImageSize;
};

export type RichNoteLinkBlock = {
  id: string;
  type: 'link';
  url: string;
  presentation: 'text' | 'preview';
  title: string;
  description: string | null;
  domain: string;
  previewImageUrl?: string | null;
  previewImageMimeType?: string | null;
};

export type RichNoteChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type RichNoteChecklistBlock = {
  id: string;
  type: 'checklist';
  items: RichNoteChecklistItem[];
};

export type RichNoteBlock =
  | RichNoteParagraphBlock
  | RichNoteImageBlock
  | RichNoteLinkBlock
  | RichNoteChecklistBlock;

export type RichNoteDocument = {
  format: typeof RICH_NOTE_FORMAT;
  version: typeof RICH_NOTE_VERSION;
  blocks: RichNoteBlock[];
};

export type ParsedRichNote = {
  document: RichNoteDocument;
  /** The exact SQLite value; legacy plain text remains untouched until edited. */
  storageText: string;
  isRich: boolean;
};

export function createRichNoteId(prefix = 'block'): string {
  const generated = typeof Crypto.randomUUID === 'function' ? Crypto.randomUUID() : null;
  const randomUUID = typeof generated === 'string' && generated.length > 0
    ? generated
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomUUID.toLowerCase()}`;
}

export function createRichNoteParagraph(
  text = '',
  overrides: Partial<Omit<RichNoteParagraphBlock, 'id' | 'type' | 'text'>> = {},
): RichNoteParagraphBlock {
  return {
    id: createRichNoteId('paragraph'),
    type: 'paragraph',
    text,
    style: 'body',
    bold: false,
    italic: false,
    underline: false,
    listStyle: 'none',
    ...overrides,
  };
}

export function createEmptyRichNoteDocument(): RichNoteDocument {
  const title = createRichNoteParagraph('Adicionar texto', {
    bold: true,
    role: 'document-title',
    style: 'title',
  });
  return {
    format: RICH_NOTE_FORMAT,
    version: RICH_NOTE_VERSION,
    blocks: [title, createRichNoteParagraph()],
  };
}

/**
 * Adds the former static detail heading to the editor's in-memory document.
 * The marker survives formatting and deletion, so reopening an edited note
 * never recreates its title. Callers keep the original storage value until a
 * user edit is reported by the editor.
 */
export function withRichNoteEditorTitle(document: RichNoteDocument): RichNoteDocument {
  const firstBlock = document.blocks[0];
  let blocks: RichNoteBlock[];

  if (firstBlock?.type === 'paragraph' && firstBlock.role === 'document-title') {
    const lastBlock = document.blocks[document.blocks.length - 1];
    if (lastBlock?.type === 'paragraph' && lastBlock.style === 'body') return document;
    blocks = [...document.blocks, createRichNoteParagraph()];
  } else if (firstBlock?.type === 'paragraph' && firstBlock.style === 'title') {
    blocks = [{ ...firstBlock, role: 'document-title' }, ...document.blocks.slice(1)];
  } else {
    blocks = [
      createRichNoteParagraph('Texto', {
        bold: true,
        role: 'document-title',
        style: 'title',
      }),
      ...document.blocks,
    ];
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.type !== 'paragraph' || lastBlock.style !== 'body') {
    blocks.push(createRichNoteParagraph());
  }

  return { ...document, blocks };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function normalizeBlock(value: unknown): RichNoteBlock | null {
  if (!isRecord(value) || !isSafeId(value.id)) return null;

  if (value.type === 'paragraph' && isString(value.text)) {
    const style: RichNoteParagraphStyle = value.style === 'title' || value.style === 'subtitle'
      ? value.style
      : 'body';
    const listStyle: RichNoteListStyle = value.listStyle === 'bullet' || value.listStyle === 'numbered'
      ? value.listStyle
      : 'none';
    return {
      id: value.id,
      type: 'paragraph',
      text: value.text,
      style,
      ...(value.role === 'document-title' ? { role: 'document-title' as const } : {}),
      bold: value.bold === true,
      italic: value.italic === true,
      underline: value.underline === true,
      listStyle,
    };
  }

  if (value.type === 'image' && isSafeId(value.assetId)) {
    const size: RichNoteImageSize = value.size === 'small' || value.size === 'medium' ? value.size : 'full';
    const relativePath = isString(value.relativePath) ? value.relativePath : undefined;
    const sourceUri = isString(value.sourceUri) ? value.sourceUri : undefined;
    if (!relativePath && !sourceUri) return null;
    if (relativePath && !SAFE_NOTE_IMAGE_PATH.test(relativePath)) return null;
    return {
      id: value.id,
      type: 'image',
      assetId: value.assetId,
      ...(relativePath ? { relativePath } : {}),
      ...(sourceUri ? { sourceUri } : {}),
      mimeType: isString(value.mimeType) ? value.mimeType : null,
      width: typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0 ? value.width : 1,
      height: typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 ? value.height : 1,
      size,
    };
  }

  if (value.type === 'link' && isString(value.url)) {
    try {
      const normalized = normalizeWebLink(value.url);
      const presentation = value.presentation === 'preview' ? 'preview' : 'text';
      return {
        id: value.id,
        type: 'link',
        url: normalized.url,
        presentation,
        title: isString(value.title) && value.title.trim() ? value.title.trim().slice(0, 180) : normalized.url,
        description: isString(value.description) && value.description.trim()
          ? value.description.trim().slice(0, 360)
          : null,
        domain: isString(value.domain) && value.domain.trim() ? value.domain.trim().slice(0, 253) : normalized.domain,
        ...(isString(value.previewImageUrl) && canFetchLinkPreview(value.previewImageUrl)
          ? { previewImageUrl: value.previewImageUrl }
          : {}),
        ...(isString(value.previewImageMimeType) ? { previewImageMimeType: value.previewImageMimeType } : {}),
      };
    } catch {
      return null;
    }
  }

  if (value.type === 'checklist' && Array.isArray(value.items)) {
    const items = value.items.flatMap((item): RichNoteChecklistItem[] => {
      if (!isRecord(item) || !isSafeId(item.id) || !isString(item.text)) return [];
      return [{ id: item.id, text: item.text.slice(0, 10_000), checked: item.checked === true }];
    });
    return { id: value.id, type: 'checklist', items };
  }

  return null;
}

function documentFromUnknown(value: unknown): RichNoteDocument | null {
  if (!isRecord(value) || value.format !== RICH_NOTE_FORMAT || value.version !== RICH_NOTE_VERSION || !Array.isArray(value.blocks)) {
    return null;
  }
  const blocks = value.blocks.map(normalizeBlock);
  if (blocks.some((block) => block === null)) return null;
  return {
    format: RICH_NOTE_FORMAT,
    version: RICH_NOTE_VERSION,
    blocks: blocks as RichNoteBlock[],
  };
}

export function parseRichNoteStorage(value: string): ParsedRichNote {
  if (value.startsWith(RICH_NOTE_STORAGE_PREFIX)) {
    try {
      const parsed = documentFromUnknown(JSON.parse(value.slice(RICH_NOTE_STORAGE_PREFIX.length)) as unknown);
      if (parsed) return { document: parsed, storageText: value, isRich: true };
    } catch {
      // Preserve malformed/unknown legacy content as literal text rather than rewriting it.
    }
  }

  return {
    document: {
      format: RICH_NOTE_FORMAT,
      version: RICH_NOTE_VERSION,
      blocks: [{ ...createRichNoteParagraph(value), id: 'legacy-paragraph' }],
    },
    storageText: value,
    isRich: false,
  };
}

export function decodeRichNoteDraft(value: string): RichNoteDocument {
  return parseRichNoteStorage(value).document;
}

export function encodeRichNoteDraft(document: RichNoteDocument): string {
  const validated = documentFromUnknown(document);
  if (!validated) throw new Error('The rich note draft is invalid.');
  return `${RICH_NOTE_STORAGE_PREFIX}${JSON.stringify(validated)}`;
}

export function encodePersistedRichNote(document: RichNoteDocument): string {
  const validated = documentFromUnknown(document);
  if (!validated) throw new Error('The rich note document is invalid.');
  for (const block of validated.blocks) {
    if (block.type === 'image' && (!block.relativePath || block.sourceUri || !SAFE_NOTE_IMAGE_PATH.test(block.relativePath))) {
      throw new Error('Every saved note image must use a private relative path.');
    }
  }
  return `${RICH_NOTE_STORAGE_PREFIX}${JSON.stringify(validated)}`;
}

export function getRichNotePlainText(document: RichNoteDocument): string {
  return document.blocks.map((block) => {
    switch (block.type) {
      case 'paragraph':
        return block.listStyle === 'bullet' && block.text.trim()
          ? `• ${block.text}`
          : block.listStyle === 'numbered' && block.text.trim()
            ? `${document.blocks.slice(0, document.blocks.indexOf(block)).filter((candidate) => candidate.type === 'paragraph' && candidate.listStyle === 'numbered').length + 1}. ${block.text}`
            : block.text;
      case 'image':
        return '';
      case 'link':
        return [block.title, block.url, block.domain, block.description ?? ''].filter(Boolean).join(' ');
      case 'checklist':
        return block.items.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.text}`).join('\n');
    }
  }).filter((value, index, all) => value.length > 0 || index === 0 || index === all.length - 1).join('\n');
}

export function hasRichNoteContent(document: RichNoteDocument): boolean {
  return document.blocks.some((block) => {
    switch (block.type) {
      case 'paragraph': return block.text.trim().length > 0;
      case 'image': return true;
      case 'link': return block.url.length > 0;
      case 'checklist': return block.items.some((item) => item.text.trim().length > 0);
    }
  });
}

export function normalizeRichNoteForPersistence(document: RichNoteDocument): RichNoteDocument {
  const validated = documentFromUnknown(document);
  if (!validated) throw new Error('The rich note document is invalid.');
  const blocks = validated.blocks.flatMap((block): RichNoteBlock[] => {
    if (block.type === 'checklist') {
      const items = block.items.filter((item) => item.text.trim().length > 0);
      return items.length ? [{ ...block, items }] : [];
    }
    return [block];
  });
  if (blocks.length === 0) blocks.push(createRichNoteParagraph());
  return { format: RICH_NOTE_FORMAT, version: RICH_NOTE_VERSION, blocks };
}
