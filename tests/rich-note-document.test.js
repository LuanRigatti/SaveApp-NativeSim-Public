/* global describe, expect, test */

const {
  createEmptyRichNoteDocument,
  createRichNoteId,
  createRichNoteParagraph,
  decodeRichNoteDraft,
  encodePersistedRichNote,
  encodeRichNoteDraft,
  getRichNotePlainText,
  hasRichNoteContent,
  normalizeRichNoteForPersistence,
  parseRichNoteStorage,
  withRichNoteEditorTitle,
} = require('../src/features/home-content/richNoteDocument');

describe('versioned rich note document', () => {
  test('starts new notes with an editable Adicionar texto title and a separate body paragraph', () => {
    const document = createEmptyRichNoteDocument();

    expect(document.blocks).toHaveLength(2);
    expect(document.blocks[0]).toMatchObject({
      type: 'paragraph',
      text: 'Adicionar texto',
      style: 'title',
      bold: true,
      role: 'document-title',
    });
    expect(document.blocks[1]).toMatchObject({ type: 'paragraph', text: '', style: 'body' });
  });

  test('preserves the initial editable title in the versioned draft without adding a separate title field', () => {
    const document = createEmptyRichNoteDocument();
    const reopened = parseRichNoteStorage(encodeRichNoteDraft(document)).document;

    expect(reopened.blocks[0]).toMatchObject({ text: 'Adicionar texto', role: 'document-title', style: 'title', bold: true });
    expect(reopened.blocks[1]).toMatchObject({ text: '', style: 'body' });
    expect(reopened.blocks.filter((block) => block.type === 'paragraph' && block.role === 'document-title')).toHaveLength(1);
  });

  test('adds the old static title only to the editor model and preserves legacy text until edited', () => {
    const legacy = parseRichNoteStorage('Conteúdo antigo da nota');
    const editorDocument = withRichNoteEditorTitle(legacy.document);

    expect(editorDocument.blocks).toHaveLength(2);
    expect(editorDocument.blocks[0]).toMatchObject({ text: 'Texto', style: 'title', role: 'document-title' });
    expect(editorDocument.blocks[1]).toMatchObject({ id: 'legacy-paragraph', text: 'Conteúdo antigo da nota' });
    expect(legacy.document.blocks).toHaveLength(1);
    expect(legacy.storageText).toBe('Conteúdo antigo da nota');
    expect(legacy.isRich).toBe(false);
  });

  test('does not duplicate a document title after it is renamed, cleared, or changed to body style', () => {
    const existing = {
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [
        { ...createRichNoteParagraph('Minha nota', { style: 'title' }), id: 'existing-title' },
        { ...createRichNoteParagraph('Conteúdo'), id: 'body' },
      ],
    };
    const editorDocument = withRichNoteEditorTitle(existing);
    const editedDocument = {
      ...editorDocument,
      blocks: editorDocument.blocks.map((block) => block.id === 'existing-title'
        ? { ...block, text: '', style: 'body' }
        : block),
    };
    const reopened = withRichNoteEditorTitle(parseRichNoteStorage(encodeRichNoteDraft(editedDocument)).document);

    expect(editorDocument.blocks).toHaveLength(2);
    expect(editorDocument.blocks[0]).toMatchObject({ text: 'Minha nota', role: 'document-title' });
    expect(reopened.blocks).toHaveLength(2);
    expect(reopened.blocks[0]).toMatchObject({ id: 'existing-title', text: '', style: 'body', role: 'document-title' });
  });

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
