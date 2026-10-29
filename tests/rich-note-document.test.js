/* global describe, expect, test */

const {
  createRichNoteId,
  createRichNoteParagraph,
  decodeRichNoteDraft,
  encodePersistedRichNote,
  encodeRichNoteDraft,
  getRichNotePlainText,
  hasRichNoteContent,
  normalizeRichNoteForPersistence,
  parseRichNoteStorage,
} = require('../src/features/home-content/richNoteDocument');

describe('versioned rich note document', () => {
  test('opens legacy plain text losslessly and only converts its in-memory model', () => {
    const legacy = 'Linha inicial\n\nparágrafo seguinte';
    const parsed = parseRichNoteStorage(legacy);

    expect(parsed.isRich).toBe(false);
    expect(parsed.storageText).toBe(legacy);
    expect(parsed.document.blocks).toHaveLength(1);
    expect(parsed.document.blocks[0]).toMatchObject({ type: 'paragraph', id: 'legacy-paragraph', text: legacy });
    expect(getRichNotePlainText(parsed.document)).toBe(legacy);
  });

  test('round-trips ordered formatted text, local image, link preview, and checklist blocks', () => {
    const document = {
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [
        { ...createRichNoteParagraph('Título', { style: 'title', bold: true }), id: 'p1' },
        { id: 'image-block', type: 'image', assetId: 'image-asset-1', relativePath: 'notes/assets/image-image-asset-1.jpg', sourceUri: undefined, mimeType: 'image/jpeg', width: 1600, height: 900, size: 'medium' },
        { id: 'link-1', type: 'link', url: 'https://example.com/article', presentation: 'preview', title: 'Article', description: 'Summary', domain: 'example.com', previewImageUrl: 'https://example.com/cover.jpg' },
        { id: 'checklist-1', type: 'checklist', items: [{ id: 'task-1', text: 'Comprar leite', checked: false }, { id: 'task-2', text: 'Buscar pacote', checked: true }] },
        { ...createRichNoteParagraph('Depois da lista'), id: 'p2' },
      ],
    };
    const stored = encodePersistedRichNote(document);
    const reopened = parseRichNoteStorage(stored);

    expect(reopened.isRich).toBe(true);
    expect(reopened.document.blocks.map(({ type }) => type)).toEqual(['paragraph', 'image', 'link', 'checklist', 'paragraph']);
    expect(reopened.document.blocks[0]).toMatchObject({ style: 'title', bold: true });
    expect(reopened.document.blocks[1]).toMatchObject({ relativePath: 'notes/assets/image-image-asset-1.jpg', size: 'medium' });
    expect(reopened.document.blocks[2]).toMatchObject({ presentation: 'preview', title: 'Article', domain: 'example.com' });
    expect(reopened.document.blocks[3].items[1]).toMatchObject({ text: 'Buscar pacote', checked: true });
    expect(reopened.document.blocks[4].text).toBe('Depois da lista');
    expect(getRichNotePlainText(reopened.document)).toContain('[x] Buscar pacote');
  });

  test('keeps picked image URIs only in the draft and rejects persisting them directly', () => {
    const document = {
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [{ id: 'i1', type: 'image', assetId: 'asset-1', sourceUri: 'file:///temporary/photo.jpg', mimeType: 'image/jpeg', width: 100, height: 80, size: 'full' }],
    };
    expect(decodeRichNoteDraft(encodeRichNoteDraft(document)).blocks[0].sourceUri).toBe('file:///temporary/photo.jpg');
    expect(() => encodePersistedRichNote(document)).toThrow('private relative path');
  });

  test('does not treat an empty draft as content and removes blank checklist placeholders on save', () => {
    const empty = { format: 'saveapp-rich-note', version: 1, blocks: [createRichNoteParagraph('  ')] };
    const normalized = normalizeRichNoteForPersistence({
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [createRichNoteParagraph('  '), { id: 'empty-list', type: 'checklist', items: [{ id: 'empty-task', text: '  ', checked: false }] }],
    });

    expect(hasRichNoteContent(empty)).toBe(false);
    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0].type).toBe('paragraph');
    expect(createRichNoteId('image')).toMatch(/^image-[a-z0-9-]+$/);
  });

  test('rejects unsupported persisted image paths and unsafe link schemes', () => {
    expect(() => encodePersistedRichNote({
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [{ id: 'i1', type: 'image', assetId: 'a1', relativePath: '../private.jpg', mimeType: 'image/jpeg', width: 1, height: 1, size: 'full' }],
    })).toThrow();
    expect(parseRichNoteStorage(`SAVEAPP_RICH_NOTE_V1:${JSON.stringify({
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [{ id: 'link-1', type: 'link', url: 'javascript:alert(1)', presentation: 'preview', title: 'bad', description: null, domain: 'bad' }],
    })}`).isRich).toBe(false);
  });
});
