import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
  PixelRatio,
  Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type TextStyle,
  type TextInputInstance,
} from 'react-native';

import { ChecklistCheckboxIndicator } from './ChecklistTaskRow';
import { NativeCardContextMenu, type NativeCardContextMenuAction } from '@/components/native';
import {
  createRichNoteId,
  createRichNoteParagraph,
  type RichNoteBlock,
  type RichNoteChecklistBlock,
  type RichNoteDocument,
  type RichNoteLinkBlock,
  type RichNoteParagraphBlock,
  type RichNoteParagraphStyle,
} from '@/features/home-content/richNoteDocument';
import { canFetchLinkPreview, fallbackLinkTitle, normalizeWebLink } from '@/features/home-content/linkValidation';
import { getLinkPreview } from '@/features/home-content/linkPreview';
import { confirmSavedLinkOpen } from '@/features/home-content/savedLinkOpenConfirmation';
import { getRichNoteAssetUri } from '@/features/home-content/richNoteAssets';
import { getBoundedChecklistTaskInputHeight } from '@/features/home-content/checklistTaskRowLayout';
import { getRichNoteInputHeight } from '@/features/home-content/richNoteEditorLayout';
import { isTouchWithinRichNoteTextLine } from '@/features/home-content/richNoteTextLineHitTest';
import { useAppTheme } from '@/theme';

const RICH_NOTE_CHECKLIST_CONTROL_WIDTH = 44;

export type RichNoteEditorHandle = {
  dismissKeyboard: () => void;
  focusAtEnd: () => void;
  insertChecklist: () => void;
  insertImage: () => void;
  insertLink: () => void;
  handleToolbarAction: (action: string) => void;
};

type RichNoteEditorProps = {
  document: RichNoteDocument;
  onChange: (document: RichNoteDocument) => void;
  onInteractionStart?: () => void;
  onBlur?: () => void;
  onAuxiliaryPresentationChange?: (presented: boolean) => void;
  initialFocus?: boolean;
  disabled?: boolean;
};

type EditorInput = { kind: 'paragraph'; blockId: string } | { kind: 'checklist'; blockId: string; itemId: string };
type InsertionAnchor = { input: EditorInput | null; selection: { start: number; end: number } };
type LinkComposerState = {
  blockId: string | null;
  presentation: 'text' | 'preview';
  anchor: InsertionAnchor;
  restoreFocus: { input: EditorInput; selection: { start: number; end: number } } | null;
  restoreKeyboard: boolean;
};

function imageUri(block: Extract<RichNoteBlock, { type: 'image' }>): string | null {
  if (block.sourceUri) return block.sourceUri;
  if (!block.relativePath) return null;
  try {
    return getRichNoteAssetUri(block.relativePath);
  } catch {
    return null;
  }
}

function RichNoteImageLoadFailure({
  blockId,
  width,
  theme,
  onInteractionStart,
  onRetry,
}: {
  blockId: string;
  width: number;
  theme: ReturnType<typeof useAppTheme>['theme'];
  onInteractionStart: () => void;
  onRetry: (blockId: string) => void;
}) {
  return (
    <Pressable
      accessibilityLabel="Imagem indisponível. Toque para selecionar outra foto."
      accessibilityRole="button"
      onPress={() => onRetry(blockId)}
      onPressIn={onInteractionStart}
      style={{ alignItems: 'flex-start', alignSelf: 'stretch', borderRadius: theme.radius.card, gap: theme.spacing.xs, minHeight: 64, justifyContent: 'center', padding: theme.spacing.md, width }}
    >
      <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>Não foi possível carregar esta imagem.</Text>
      <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>Toque para selecionar outra foto.</Text>
    </Pressable>
  );
}

function listNumber(blocks: readonly RichNoteBlock[], blockId: string): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === 'paragraph' && block.listStyle === 'numbered') count += 1;
    else count = 0;
    if (block.id === blockId) return Math.max(1, count);
  }
  return Math.max(1, count);
}

export const RichNoteEditor = forwardRef<RichNoteEditorHandle, RichNoteEditorProps>(function RichNoteEditor({
  document,
  onChange,
  onInteractionStart,
  onBlur,
  onAuxiliaryPresentationChange,
  initialFocus = false,
  disabled = false,
}: RichNoteEditorProps, forwardedRef) {
  const { theme } = useAppTheme();
  const fontScale = PixelRatio.getFontScale();
  const checklistTaskFontSize = (theme.typography.body.fontSize ?? 17) * fontScale;
  const checklistTaskLineHeight = (theme.typography.body.lineHeight ?? 24) * fontScale;
  const checklistTaskVerticalPadding = theme.spacing.xs * 2;
  const checklistTaskMinimumHeight = Math.max(
    theme.sizes.touchTargetMinimum,
    Math.ceil(checklistTaskLineHeight + checklistTaskVerticalPadding),
  );
  const documentRef = useRef(document);
  const inputRefs = useRef(new Map<string, TextInputInstance>());
  const inputAvailableWidthsRef = useRef(new Map<string, number>());
  const inputTextLinesRef = useRef(new Map<string, readonly { width: number; height: number }[]>());
  const handledImageRetryRef = useRef<{ blockId: string } | null>(null);
  const linkURLInputRef = useRef<TextInputInstance>(null);
  const activeInputRef = useRef<EditorInput | null>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const selectionByInputRef = useRef(new Map<string, { start: number; end: number }>());
  const undoStackRef = useRef<RichNoteDocument[]>([]);
  const undoGroupRef = useRef<{ key: string; timestamp: number } | null>(null);
  const pendingFocusRef = useRef<{ input: EditorInput; selection?: { start: number; end: number } } | null>(null);
  const submittedChecklistItemRef = useRef<string | null>(null);
  const previewRequestsRef = useRef(new Map<string, AbortController>());
  const attemptedPreviewUrlsRef = useRef(new Map<string, string>());
  const didInitialFocusRef = useRef(false);
  const editorHasFocusRef = useRef(false);
  const [linkComposer, setLinkComposer] = useState<LinkComposerState | null>(null);
  const [linkURL, setLinkURL] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [failedPreviewIds, setFailedPreviewIds] = useState<Set<string>>(new Set());
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [imageRetryRequest, setImageRetryRequest] = useState<{ blockId: string } | null>(null);
  const [measuredInputHeights, setMeasuredInputHeights] = useState<Record<string, number>>({});
  const [editorContentWidth, setEditorContentWidth] = useState(0);

  const hasLinkComposer = linkComposer !== null;
  useLayoutEffect(() => {
    if (hasLinkComposer) linkURLInputRef.current?.focus();
  }, [hasLinkComposer]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const inputId = pending.input.kind === 'paragraph' ? pending.input.blockId : pending.input.itemId;
    const target = inputRefs.current.get(inputId);
    if (!target) return;
    target.focus();
    if (pending.selection) target.setNativeProps({ selection: pending.selection });
    pendingFocusRef.current = null;
  }, [document]);

  useEffect(() => {
    const previewRequests = previewRequestsRef.current;
    const attemptedPreviewUrls = attemptedPreviewUrlsRef.current;
    return () => {
      for (const request of previewRequests.values()) request.abort();
      previewRequests.clear();
      attemptedPreviewUrls.clear();
    };
  }, []);

  const publishDocument = useCallback((next: RichNoteDocument, historyGroup?: string, recordUndo = true) => {
    const current = documentRef.current;
    const now = Date.now();
    const previousGroup = undoGroupRef.current;
    const startsNewUndoStep = !historyGroup || !previousGroup || previousGroup.key !== historyGroup || now - previousGroup.timestamp > 700;
    if (recordUndo && startsNewUndoStep) {
      undoStackRef.current.push(current);
      if (undoStackRef.current.length > 80) undoStackRef.current.shift();
    }
    undoGroupRef.current = historyGroup ? { key: historyGroup, timestamp: now } : null;
    documentRef.current = next;
    onChange(next);
  }, [onChange]);

  const focusInput = useCallback((input: EditorInput, selection?: { start: number; end: number }) => {
    activeInputRef.current = input;
    if (selection) {
      const inputId = input.kind === 'paragraph' ? input.blockId : input.itemId;
      selectionByInputRef.current.set(inputId, selection);
      selectionRef.current = selection;
    }
    const pending = { input, selection };
    pendingFocusRef.current = pending;
    requestAnimationFrame(() => {
      if (pendingFocusRef.current !== pending) return;
      const target = inputRefs.current.get(input.kind === 'paragraph' ? input.blockId : input.itemId);
      // Keep the request until the callback ref registers a field created by this edit.
      if (!target) return;
      target.focus();
      if (selection) target.setNativeProps({ selection });
      pendingFocusRef.current = null;
    });
  }, []);

  const scheduleFocus = useCallback((input: EditorInput, selection?: { start: number; end: number }) => {
    focusInput(input, selection);
  }, [focusInput]);

  const focusAtEnd = useCallback(() => {
    const current = documentRef.current;
    let paragraph = current.blocks.at(-1)?.type === 'paragraph'
      ? current.blocks.at(-1) as RichNoteParagraphBlock
      : undefined;
    if (!paragraph) {
      paragraph = createRichNoteParagraph();
      publishDocument({ ...current, blocks: [...current.blocks, paragraph] });
    }
    focusInput({ kind: 'paragraph', blockId: paragraph.id }, { start: paragraph.text.length, end: paragraph.text.length });
  }, [focusInput, publishDocument]);

  const dismissKeyboard = useCallback(() => {
    pendingFocusRef.current = null;
    const activeId = activeInputRef.current?.kind === 'paragraph'
      ? activeInputRef.current.blockId
      : activeInputRef.current?.itemId;
    if (activeId) inputRefs.current.get(activeId)?.blur();
    Keyboard.dismiss();
    onBlur?.();
  }, [onBlur]);

  const handleInputBlur = useCallback(() => {
    editorHasFocusRef.current = false;
    onBlur?.();
  }, [onBlur]);

  useEffect(() => {
    if (initialFocus && !didInitialFocusRef.current) {
      didInitialFocusRef.current = true;
      focusAtEnd();
    }
  }, [focusAtEnd, initialFocus]);

  const markInteraction = useCallback(() => onInteractionStart?.(), [onInteractionStart]);
  const markTextLineInteraction = useCallback((inputId: string, event: GestureResponderEvent, lineHeight: number, containerHeight: number, verticalPadding = 0) => {
    const availableWidth = inputAvailableWidthsRef.current.get(inputId);
    const lines = inputTextLinesRef.current.get(inputId);
    if (availableWidth == null || lines == null) {
      markInteraction();
      return;
    }
    if (isTouchWithinRichNoteTextLine({
      availableWidth,
      containerHeight,
      lineHeight,
      lines,
      verticalPadding,
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    })) markInteraction();
  }, [markInteraction]);
  const requestImageRetry = useCallback((blockId: string) => setImageRetryRequest({ blockId }), []);

  const currentInsertionAnchor = useCallback((): InsertionAnchor => {
    const input = activeInputRef.current;
    const inputId = input?.kind === 'paragraph' ? input.blockId : input?.itemId;
    return {
      input,
      selection: inputId ? { ...(selectionByInputRef.current.get(inputId) ?? selectionRef.current) } : { ...selectionRef.current },
    };
  }, []);

  const updateBlock = useCallback((blockId: string, update: (block: RichNoteBlock) => RichNoteBlock, historyGroup?: string, recordUndo = true) => {
    const current = documentRef.current;
    publishDocument({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? update(block) : block),
    }, historyGroup, recordUndo);
  }, [publishDocument]);

  const updateParagraphText = useCallback((blockId: string, text: string) => {
    updateBlock(blockId, (block) => block.type === 'paragraph' ? { ...block, text } : block, `paragraph:${blockId}`);
  }, [updateBlock]);

  const updateChecklistItem = useCallback((blockId: string, itemId: string, update: (item: RichNoteChecklistBlock['items'][number]) => RichNoteChecklistBlock['items'][number], historyGroup?: string) => {
    updateBlock(blockId, (block) => block.type === 'checklist'
      ? { ...block, items: block.items.map((item) => item.id === itemId ? update(item) : item) }
      : block, historyGroup);
  }, [updateBlock]);

  const measureInput = useCallback((inputId: string, contentHeight: number, lineHeight: number, minimumHeight = lineHeight, verticalPadding = 0, text = '') => {
    const nextHeight = getRichNoteInputHeight({
      measuredHeight: contentHeight,
      text,
      lineHeight,
      minimumHeight,
      verticalPadding,
    });
    setMeasuredInputHeights((current) => current[inputId] === nextHeight ? current : { ...current, [inputId]: nextHeight });
  }, []);

  const measureInputHitArea = useCallback((inputId: string, availableWidth: number) => {
    if (!Number.isFinite(availableWidth) || availableWidth <= 0) return;
    inputAvailableWidthsRef.current.set(inputId, availableWidth);
  }, []);

  const measureInputTextLines = useCallback((inputId: string, lines: readonly { width: number; height: number }[]) => {
    inputTextLinesRef.current.set(inputId, lines);
  }, []);

  const measureChecklistInput = useCallback((inputId: string, contentHeight: number, text: string) => {
    const requiredHeight = getRichNoteInputHeight({
      measuredHeight: 0,
      text,
      lineHeight: checklistTaskLineHeight,
      minimumHeight: checklistTaskMinimumHeight,
      verticalPadding: checklistTaskVerticalPadding,
    });
    const nextHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: editorContentWidth > RICH_NOTE_CHECKLIST_CONTROL_WIDTH
        ? editorContentWidth - RICH_NOTE_CHECKLIST_CONTROL_WIDTH
        : 0,
      fontSize: checklistTaskFontSize,
      lineHeight: checklistTaskLineHeight,
      measuredHeight: contentHeight,
      minimumHeight: requiredHeight,
      text,
      verticalPadding: checklistTaskVerticalPadding,
    });
    setMeasuredInputHeights((current) => current[inputId] === nextHeight ? current : { ...current, [inputId]: nextHeight });
  }, [checklistTaskFontSize, checklistTaskLineHeight, checklistTaskMinimumHeight, checklistTaskVerticalPadding, editorContentWidth]);

  const preserveExplicitLines = useCallback((inputId: string, text: string, lineHeight: number, minimumHeight = lineHeight, verticalPadding = 0) => {
    const requiredHeight = getRichNoteInputHeight({ measuredHeight: 0, text, lineHeight, minimumHeight, verticalPadding });
    setMeasuredInputHeights((current) => (current[inputId] ?? 0) >= requiredHeight
      ? current
      : { ...current, [inputId]: requiredHeight });
  }, []);

  const handleEditorLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      setEditorContentWidth((current) => Math.abs(current - nextWidth) < 0.5 ? current : nextWidth);
    }
  }, []);

  const insertAtAnchor = useCallback((inserted: RichNoteBlock[], anchor: InsertionAnchor, focusAfter = true) => {
    const current = documentRef.current;
    const active = anchor.input;
    const activeParagraph = active?.kind === 'paragraph'
      ? current.blocks.find((block): block is RichNoteParagraphBlock => block.type === 'paragraph' && block.id === active.blockId)
      : undefined;
    let nextBlocks: RichNoteBlock[];
    let focusParagraph: RichNoteParagraphBlock | null = null;

    if (activeParagraph) {
      const selection = anchor.selection;
      const start = Math.max(0, Math.min(selection.start, activeParagraph.text.length));
      const end = Math.max(start, Math.min(selection.end, activeParagraph.text.length));
      const before = { ...activeParagraph, text: activeParagraph.text.slice(0, start) };
      const after = createRichNoteParagraph(activeParagraph.text.slice(end), {
        style: activeParagraph.style,
        bold: activeParagraph.bold,
        italic: activeParagraph.italic,
        underline: activeParagraph.underline,
        listStyle: activeParagraph.listStyle,
      });
      const index = current.blocks.findIndex((block) => block.id === activeParagraph.id);
      nextBlocks = [
        ...current.blocks.slice(0, index),
        before,
        ...inserted,
        after,
        ...current.blocks.slice(index + 1),
      ];
      focusParagraph = after;
    } else {
      const index = active?.kind === 'checklist'
        ? current.blocks.findIndex((block) => block.id === active.blockId)
        : current.blocks.length - 1;
      focusParagraph = createRichNoteParagraph();
      nextBlocks = [...current.blocks.slice(0, index + 1), ...inserted, focusParagraph, ...current.blocks.slice(index + 1)];
    }

    publishDocument({ ...current, blocks: nextBlocks });
    if (focusAfter && focusParagraph) {
      scheduleFocus({ kind: 'paragraph', blockId: focusParagraph.id }, { start: 0, end: 0 });
    }
    return focusParagraph;
  }, [publishDocument, scheduleFocus]);

  const insertAfterActivePosition = useCallback((inserted: RichNoteBlock[], focusAfter = true) => {
    return insertAtAnchor(inserted, currentInsertionAnchor(), focusAfter);
  }, [currentInsertionAnchor, insertAtAnchor]);

  const openImagePicker = useCallback(async (replaceBlockId?: string) => {
    markInteraction();
    const editorWasFocused = editorHasFocusRef.current;
    const keyboardWasVisible = Keyboard.isVisible();
    const insertionAnchor = currentInsertionAnchor();
    const focusBeforePicker = activeInputRef.current
      ? { input: activeInputRef.current, selection: { ...insertionAnchor.selection } }
      : null;
    onAuxiliaryPresentationChange?.(true);
    dismissKeyboard();
    let focusAfterPicker: { input: EditorInput; selection: { start: number; end: number } } | null =
      editorWasFocused && keyboardWasVisible ? focusBeforePicker : null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: replaceBlockId == null,
        orderedSelection: true,
        selectionLimit: 0,
        allowsEditing: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      const images = result.assets.map((asset) => ({
        id: createRichNoteId('image-block'),
        type: 'image' as const,
        assetId: createRichNoteId('image'),
        sourceUri: asset.uri,
        mimeType: asset.mimeType ?? null,
        width: Math.max(1, asset.width),
        height: Math.max(1, asset.height),
        size: 'full' as const,
      }));
      if (replaceBlockId) {
        updateBlock(replaceBlockId, (block) => block.type === 'image' ? images[0] : block);
        if (editorWasFocused) focusAfterPicker = focusBeforePicker;
        return;
      }
      const after = insertAtAnchor(images, insertionAnchor, false);
      if (after) focusAfterPicker = { input: { kind: 'paragraph', blockId: after.id }, selection: { start: 0, end: 0 } };
    } catch {
      Alert.alert('Não foi possível inserir as imagens', 'Tente selecionar as fotos novamente.');
    } finally {
      onAuxiliaryPresentationChange?.(false);
      if (focusAfterPicker) scheduleFocus(focusAfterPicker.input, focusAfterPicker.selection);
    }
  }, [currentInsertionAnchor, dismissKeyboard, insertAtAnchor, markInteraction, onAuxiliaryPresentationChange, scheduleFocus, updateBlock]);

  useEffect(() => {
    if (!imageRetryRequest || handledImageRetryRef.current === imageRetryRequest) return;
    handledImageRetryRef.current = imageRetryRequest;
    void openImagePicker(imageRetryRequest.blockId);
  }, [imageRetryRequest, openImagePicker]);

  const openLinkComposer = useCallback((blockId: string | null = null) => {
    markInteraction();
    const existing = blockId
      ? documentRef.current.blocks.find((block): block is RichNoteLinkBlock => block.type === 'link' && block.id === blockId)
      : undefined;
    const anchor = currentInsertionAnchor();
    const restoreFocus = editorHasFocusRef.current && activeInputRef.current
      ? { input: activeInputRef.current, selection: { ...anchor.selection } }
      : null;
    const nextURL = existing?.url ?? '';
    setLinkURL(nextURL);
    setLinkError(null);
    setLinkComposer({
      blockId,
      presentation: existing?.presentation ?? 'preview',
      anchor,
      restoreFocus,
      restoreKeyboard: Keyboard.isVisible(),
    });
  }, [currentInsertionAnchor, markInteraction]);

  const requestPreviewMetadata = useCallback((blockId: string, url: string) => {
    if (attemptedPreviewUrlsRef.current.get(blockId) === url) return;
    const previous = previewRequestsRef.current.get(blockId);
    previous?.abort();
    attemptedPreviewUrlsRef.current.set(blockId, url);
    const controller = new AbortController();
    previewRequestsRef.current.set(blockId, controller);
    void getLinkPreview(url, controller.signal).then((metadata) => {
      if (controller.signal.aborted) return;
      updateBlock(blockId, (block) => block.type === 'link' && block.url === url
        ? {
            ...block,
            title: metadata.title || block.title,
            description: metadata.description,
            domain: metadata.domain || block.domain,
            previewImageUrl: metadata.imageUrl && canFetchLinkPreview(metadata.imageUrl) ? metadata.imageUrl : null,
          }
        : block, undefined, false);
    }).catch(() => {
      if (!controller.signal.aborted && attemptedPreviewUrlsRef.current.get(blockId) === url) {
        attemptedPreviewUrlsRef.current.delete(blockId);
      }
      // The inserted fallback stays editable and does not block note writing.
    }).finally(() => {
      if (previewRequestsRef.current.get(blockId) === controller) previewRequestsRef.current.delete(blockId);
    });
  }, [updateBlock]);

  const commitLinkComposer = useCallback(() => {
    if (!linkComposer) return;
    let normalized: ReturnType<typeof normalizeWebLink>;
    try {
      normalized = normalizeWebLink(linkURL);
    } catch {
      setLinkError('Digite um endereço HTTP ou HTTPS válido.');
      return;
    }
    setLinkError(null);
    if (linkComposer.blockId) {
      const blockId = linkComposer.blockId;
      updateBlock(blockId, (block) => block.type === 'link'
        ? { ...block, url: normalized.url, domain: normalized.domain, title: fallbackLinkTitle(normalized.url), description: null, previewImageUrl: null, presentation: linkComposer.presentation }
        : block);
      const restore = linkComposer.restoreKeyboard ? linkComposer.restoreFocus : null;
      setLinkComposer(null);
      if (restore) scheduleFocus(restore.input, restore.selection);
      else Keyboard.dismiss();
      if (linkComposer.presentation === 'preview') requestPreviewMetadata(blockId, normalized.url);
      return;
    }

    const blockId = createRichNoteId('link');
    const block: RichNoteLinkBlock = {
      id: blockId,
      type: 'link',
      url: normalized.url,
      presentation: linkComposer.presentation,
      title: fallbackLinkTitle(normalized.url),
      description: null,
      domain: normalized.domain,
    };
    const after = insertAtAnchor([block], linkComposer.anchor, false);
    setLinkComposer(null);
    if (after) scheduleFocus({ kind: 'paragraph', blockId: after.id }, { start: 0, end: 0 });
    if (block.presentation === 'preview') requestPreviewMetadata(blockId, normalized.url);
  }, [insertAtAnchor, linkComposer, linkURL, requestPreviewMetadata, scheduleFocus, updateBlock]);

  const cancelLinkComposer = useCallback(() => {
    const current = linkComposer;
    setLinkComposer(null);
    if (current?.restoreKeyboard && current.restoreFocus) {
      scheduleFocus(current.restoreFocus.input, current.restoreFocus.selection);
    } else Keyboard.dismiss();
  }, [linkComposer, scheduleFocus]);

  const applyParagraphUpdate = useCallback((updates: Partial<RichNoteParagraphBlock>) => {
    const active = activeInputRef.current;
    const paragraphId = active?.kind === 'paragraph'
      ? active.blockId
      : null;
    if (!paragraphId) return;
    updateBlock(paragraphId, (block) => block.type === 'paragraph' ? { ...block, ...updates } : block);
  }, [updateBlock]);

  const toggleChecklistItem = useCallback((blockId: string, itemId: string) => {
    updateChecklistItem(blockId, itemId, (item) => ({ ...item, checked: !item.checked }));
  }, [updateChecklistItem]);

  const addChecklistItem = useCallback((blockId: string, afterItemId: string) => {
    const itemId = createRichNoteId('task');
    updateBlock(blockId, (block) => {
      if (block.type !== 'checklist') return block;
      const index = block.items.findIndex((item) => item.id === afterItemId);
      const items = [...block.items];
      items.splice(index + 1, 0, { id: itemId, text: '', checked: false });
      return { ...block, items };
    });
    activeInputRef.current = { kind: 'checklist', blockId, itemId };
    scheduleFocus({ kind: 'checklist', blockId, itemId }, { start: 0, end: 0 });
  }, [scheduleFocus, updateBlock]);

  const submitChecklistItem = useCallback((blockId: string, itemId: string) => {
    if (submittedChecklistItemRef.current === itemId) return;
    submittedChecklistItemRef.current = itemId;
    addChecklistItem(blockId, itemId);
  }, [addChecklistItem]);

  const insertChecklist = useCallback(() => {
    const blockId = createRichNoteId('checklist');
    const itemId = createRichNoteId('task');
    const block: RichNoteChecklistBlock = {
      id: blockId,
      type: 'checklist',
      items: [{ id: itemId, text: '', checked: false }],
    };
    insertAfterActivePosition([block], false);
    activeInputRef.current = { kind: 'checklist', blockId, itemId };
    scheduleFocus({ kind: 'checklist', blockId, itemId }, { start: 0, end: 0 });
  }, [insertAfterActivePosition, scheduleFocus]);

  const removeChecklistItem = useCallback((blockId: string, itemId: string) => {
    updateBlock(blockId, (block) => block.type === 'checklist'
      ? { ...block, items: block.items.filter((item) => item.id !== itemId) }
      : block);
  }, [updateBlock]);

  const removeBlock = useCallback((blockId: string) => {
    publishDocument({
      ...documentRef.current,
      blocks: documentRef.current.blocks.filter((block) => block.id !== blockId),
    });
  }, [publishDocument]);

  const imageActions = useCallback((blockId: string): NativeCardContextMenuAction[] => [
    { id: 'small', title: 'Tamanho pequeno', systemImage: 'minus', onPress: () => updateBlock(blockId, (block) => block.type === 'image' ? { ...block, size: 'small' } : block) },
    { id: 'medium', title: 'Tamanho médio', systemImage: 'arrow.left.and.right', onPress: () => updateBlock(blockId, (block) => block.type === 'image' ? { ...block, size: 'medium' } : block) },
    { id: 'full', title: 'Largura total', systemImage: 'arrow.up.left.and.arrow.down.right', onPress: () => updateBlock(blockId, (block) => block.type === 'image' ? { ...block, size: 'full' } : block) },
    { id: 'replace', title: 'Substituir', systemImage: 'photo', onPress: () => void openImagePicker(blockId) },
    { id: 'remove', title: 'Remover imagem', systemImage: 'trash', destructive: true, onPress: () => removeBlock(blockId) },
  ], [openImagePicker, removeBlock, updateBlock]);

  const linkActions = useCallback((block: RichNoteLinkBlock): NativeCardContextMenuAction[] => {
    const nextPresentation = block.presentation === 'preview' ? 'text' : 'preview';
    return [
      { id: 'open', title: 'Abrir link', systemImage: 'arrow.up.right', onPress: () => confirmSavedLinkOpen(() => Linking.openURL(block.url)) },
      { id: 'copy', title: 'Copiar link', systemImage: 'doc.on.doc', onPress: () => void Clipboard.setStringAsync(block.url).catch(() => Alert.alert('Não foi possível copiar', 'Tente novamente.')) },
      { id: 'edit', title: 'Editar URL', systemImage: 'pencil', onPress: () => openLinkComposer(block.id) },
      { id: 'presentation', title: block.presentation === 'preview' ? 'Mostrar link simples' : 'Mostrar prévia', systemImage: 'rectangle.on.rectangle', onPress: () => {
        updateBlock(block.id, (current) => current.type === 'link' ? { ...current, presentation: nextPresentation } : current);
        if (nextPresentation === 'preview') requestPreviewMetadata(block.id, block.url);
      } },
      { id: 'remove', title: 'Remover link', systemImage: 'trash', destructive: true, onPress: () => removeBlock(block.id) },
    ];
  }, [openLinkComposer, removeBlock, requestPreviewMetadata, updateBlock]);

  const checklistItemActions = useCallback((blockId: string, itemId: string): NativeCardContextMenuAction[] => [
    { id: 'remove-task', title: 'Remover tarefa', systemImage: 'trash', destructive: true, onPress: () => removeChecklistItem(blockId, itemId) },
  ], [removeChecklistItem]);

  const insertImage = useCallback(() => { void openImagePicker(); }, [openImagePicker]);
  const insertLink = useCallback(() => openLinkComposer(), [openLinkComposer]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    undoGroupRef.current = null;
    documentRef.current = previous;
    onChange(previous);
    const active = activeInputRef.current;
    if (active?.kind === 'paragraph') {
      const paragraph = previous.blocks.find((block): block is RichNoteParagraphBlock => block.type === 'paragraph' && block.id === active.blockId);
      if (paragraph) {
        const selection = selectionByInputRef.current.get(active.blockId) ?? selectionRef.current;
        const cursor = Math.min(selection.end, paragraph.text.length);
        focusInput(active, { start: cursor, end: cursor });
        return;
      }
    } else if (active?.kind === 'checklist') {
      const checklist = previous.blocks.find((block): block is RichNoteChecklistBlock => block.type === 'checklist' && block.id === active.blockId);
      const item = checklist?.items.find((candidate) => candidate.id === active.itemId);
      if (item) {
        const cursor = Math.min(selectionByInputRef.current.get(active.itemId)?.end ?? item.text.length, item.text.length);
        focusInput(active, { start: cursor, end: cursor });
        return;
      }
    }
    const fallback = [...previous.blocks].reverse().find((block): block is RichNoteParagraphBlock => block.type === 'paragraph');
    if (fallback) focusInput({ kind: 'paragraph', blockId: fallback.id }, { start: fallback.text.length, end: fallback.text.length });
  }, [focusInput, onChange]);

  const toggleKeyboard = useCallback(() => {
    if (linkComposer) {
      if (Keyboard.isVisible()) dismissKeyboard();
      else linkURLInputRef.current?.focus();
      return;
    }
    if (Keyboard.isVisible()) {
      dismissKeyboard();
      return;
    }
    const active = activeInputRef.current;
    if (active?.kind === 'paragraph') {
      const paragraph = documentRef.current.blocks.find((block): block is RichNoteParagraphBlock => block.type === 'paragraph' && block.id === active.blockId);
      const selection = selectionByInputRef.current.get(active.blockId);
      if (paragraph) {
        focusInput(active, selection ?? { start: paragraph.text.length, end: paragraph.text.length });
        return;
      }
    } else if (active?.kind === 'checklist') {
      const checklist = documentRef.current.blocks.find((block): block is RichNoteChecklistBlock => block.type === 'checklist' && block.id === active.blockId);
      const item = checklist?.items.find((candidate) => candidate.id === active.itemId);
      if (item) {
        const selection = selectionByInputRef.current.get(active.itemId);
        focusInput(active, selection ?? { start: item.text.length, end: item.text.length });
        return;
      }
    }
    focusAtEnd();
  }, [dismissKeyboard, focusAtEnd, focusInput, linkComposer]);

  const handleToolbarAction = useCallback((action: string) => {
    if (linkComposer && action !== 'toggleKeyboard' && action !== 'focusAtEnd' && action !== 'undo') return;
    const active = activeInputRef.current;
    const paragraph = active?.kind === 'paragraph'
      ? documentRef.current.blocks.find((block): block is RichNoteParagraphBlock => block.type === 'paragraph' && block.id === active.blockId)
      : undefined;
    switch (action) {
      case 'focusAtEnd':
        if (linkComposer) linkURLInputRef.current?.focus();
        else focusAtEnd();
        break;
      case 'format.body': applyParagraphUpdate({ style: 'body', bold: false, italic: false, underline: false, listStyle: 'none' }); break;
      case 'format.title': applyParagraphUpdate({ style: 'title', bold: true, listStyle: 'none' }); break;
      case 'format.subtitle': applyParagraphUpdate({ style: 'subtitle', listStyle: 'none' }); break;
      case 'format.bold': if (paragraph) applyParagraphUpdate({ bold: !paragraph.bold }); break;
      case 'format.italic': if (paragraph) applyParagraphUpdate({ italic: !paragraph.italic }); break;
      case 'format.underline': if (paragraph) applyParagraphUpdate({ underline: !paragraph.underline }); break;
      case 'format.bullet': applyParagraphUpdate({ listStyle: 'bullet' }); break;
      case 'format.numbered': applyParagraphUpdate({ listStyle: 'numbered' }); break;
      case 'format.clear': applyParagraphUpdate({ style: 'body', bold: false, italic: false, underline: false, listStyle: 'none' }); break;
      case 'insertChecklist': insertChecklist(); break;
      case 'insertImage': insertImage(); break;
      case 'insertLink': insertLink(); break;
      case 'undo': undo(); break;
      case 'toggleKeyboard': toggleKeyboard(); break;
      default: break;
    }
  }, [applyParagraphUpdate, focusAtEnd, insertChecklist, insertImage, insertLink, linkComposer, toggleKeyboard, undo]);

  useImperativeHandle(forwardedRef, () => ({
    dismissKeyboard,
    focusAtEnd,
    insertChecklist,
    insertImage,
    insertLink,
    handleToolbarAction,
  }), [dismissKeyboard, focusAtEnd, handleToolbarAction, insertChecklist, insertImage, insertLink]);

  const paragraphFontSize = (style: RichNoteParagraphStyle) => style === 'title'
    ? theme.typography.largeTitle.fontSize + 2
    : style === 'subtitle' ? 21 : 17;
  const paragraphLineHeight = (style: RichNoteParagraphStyle, fontSize: number) => style === 'title'
    ? theme.typography.largeTitle.lineHeight
    : fontSize * 1.45;
  const lastBlock = document.blocks[document.blocks.length - 1];
  const bodyPlaceholderBlockId = lastBlock?.type === 'paragraph'
    && lastBlock.style === 'body'
    && lastBlock.text.length === 0
    ? lastBlock.id
    : null;

  const renderParagraph = (block: RichNoteParagraphBlock, index: number) => {
    const marker = block.listStyle === 'bullet' ? '•' : block.listStyle === 'numbered' ? `${listNumber(document.blocks, block.id)}.` : null;
    const fontSize = paragraphFontSize(block.style);
    const lineHeight = paragraphLineHeight(block.style, fontSize);
    const fontWeight: TextStyle['fontWeight'] = block.bold ? block.style === 'title' ? theme.typography.largeTitle.fontWeight : '600' : '400';
    const placeholder = block.id === bodyPlaceholderBlockId ? 'Comece a escrever...' : undefined;
    const inputTextStyle: TextStyle = {
      color: theme.colors.textPrimary,
      fontSize,
      fontStyle: block.italic ? 'italic' as const : 'normal' as const,
      fontWeight,
      lineHeight,
      padding: 0,
      textDecorationLine: block.underline ? 'underline' as const : 'none' as const,
    };
    return (
      <View key={block.id} style={{ alignItems: 'flex-start', flexDirection: 'row', gap: marker ? theme.spacing.xs : 0, minWidth: 0, width: '100%' }}>
        {marker ? <Text style={{ color: theme.colors.textPrimary, fontSize, lineHeight: fontSize * 1.45, minWidth: 22 }}>{marker}</Text> : null}
        <View
          onLayout={(event) => measureInputHitArea(block.id, event.nativeEvent.layout.width)}
          style={{ flex: 1, minWidth: 0, position: 'relative' }}
        >
          <TextInput
            accessibilityLabel={block.style === 'title' ? `Título do parágrafo ${index + 1}` : `Parágrafo ${index + 1}`}
            autoCapitalize="sentences"
            editable={!disabled}
            multiline
            onContentSizeChange={(event) => measureInput(block.id, event.nativeEvent.contentSize.height, lineHeight, lineHeight, 0, block.text)}
            onBlur={handleInputBlur}
            onChangeText={(text) => {
              preserveExplicitLines(block.id, text, lineHeight);
              updateParagraphText(block.id, text);
            }}
            onFocus={() => {
              const input = { kind: 'paragraph' as const, blockId: block.id };
              editorHasFocusRef.current = true;
              activeInputRef.current = input;
            }}
            onSelectionChange={(event) => {
              selectionRef.current = event.nativeEvent.selection;
              selectionByInputRef.current.set(block.id, event.nativeEvent.selection);
            }}
            onTouchStart={(event) => markTextLineInteraction(block.id, event, lineHeight, measuredInputHeights[block.id] ?? lineHeight)}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textTertiary}
            ref={(node) => {
              if (!node) {
                inputRefs.current.delete(block.id);
                return;
              }
              inputRefs.current.set(block.id, node);
            }}
            selectionColor={theme.colors.primary}
            style={{
              ...inputTextStyle,
              flex: 1,
              height: measuredInputHeights[block.id] ?? lineHeight,
              minHeight: lineHeight,
              minWidth: 0,
              textAlignVertical: 'top',
            }}
            scrollEnabled={false}
            submitBehavior="newline"
            value={block.text}
          />
          <Text
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onTextLayout={(event) => measureInputTextLines(block.id, event.nativeEvent.lines.map((line) => ({ width: line.width, height: line.height })))}
            pointerEvents="none"
            style={{ ...inputTextStyle, left: 0, opacity: 0, position: 'absolute', top: 0, width: '100%' }}
          >
            {block.text || placeholder || '\u200b'}
          </Text>
        </View>
      </View>
    );
  };

  const renderImage = (block: Extract<RichNoteBlock, { type: 'image' }>) => {
    const uri = imageUri(block);
    const imageWidth = Math.max(1, editorContentWidth * (block.size === 'small' ? 0.45 : block.size === 'medium' ? 0.72 : 1));
    const showImageFailure = () => <RichNoteImageLoadFailure blockId={block.id} key={block.id} onInteractionStart={markInteraction} onRetry={requestImageRetry} theme={theme} width={imageWidth} />;
    if (!uri) {
      return showImageFailure();
    }
    if (failedImageIds.has(block.id)) return showImageFailure();
    return (
      <NativeCardContextMenu key={block.id} actions={imageActions(block.id)} matchContents={{ vertical: true }} title="Imagem" triggerContentWidth={imageWidth} style={{ alignSelf: 'flex-start', width: imageWidth }}>
        <View onTouchStart={markInteraction} style={{ alignSelf: 'flex-start', borderRadius: theme.radius.card, overflow: 'hidden', width: imageWidth }}>
          <Image
            accessibilityLabel="Imagem dentro da nota. Toque e segure para ações."
            contentFit="contain"
            onError={() => setFailedImageIds((current) => new Set(current).add(block.id))}
            source={{ uri }}
            style={{ aspectRatio: block.width / block.height, backgroundColor: theme.colors.surfaceMuted, width: '100%' }}
          />
        </View>
      </NativeCardContextMenu>
    );
  };

  const renderLink = (block: RichNoteLinkBlock) => {
    if (block.presentation === 'text') {
      return (
        <NativeCardContextMenu key={block.id} actions={linkActions(block)} title={block.domain}>
          <Pressable onPress={() => confirmSavedLinkOpen(() => Linking.openURL(block.url))} onPressIn={markInteraction} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
            <Text style={[theme.typography.body, { color: theme.colors.primary, textDecorationLine: 'underline' }]}>{block.title || block.url}</Text>
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{block.domain}</Text>
          </Pressable>
        </NativeCardContextMenu>
      );
    }
    const showImage = block.previewImageUrl && !failedPreviewIds.has(block.id);
    return (
      <NativeCardContextMenu key={block.id} actions={linkActions(block)} title={block.domain}>
      <Pressable
        accessibilityLabel={`Abrir prévia do link ${block.domain}. Toque e segure para ações.`}
        accessibilityRole="button"
        onPress={() => confirmSavedLinkOpen(() => Linking.openURL(block.url))}
        onPressIn={markInteraction}
        style={{ alignSelf: 'stretch', backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.card, flexDirection: 'row', gap: theme.spacing.md, minHeight: 84, overflow: 'hidden', padding: theme.spacing.md }}
      >
        {showImage ? (
          <Image
            contentFit="cover"
            onError={() => setFailedPreviewIds((current) => new Set(current).add(block.id))}
            source={{ uri: block.previewImageUrl! }}
            style={{ aspectRatio: 1, borderRadius: theme.radius.md, height: 64, width: 64 }}
          />
        ) : null}
        <View style={{ flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <Text numberOfLines={2} style={[theme.typography.body, { color: theme.colors.textPrimary, fontWeight: '600' }]}>{block.title || block.url}</Text>
          <Text numberOfLines={1} style={[theme.typography.footnote, { color: theme.colors.primary }]}>{block.domain}</Text>
          {block.description ? <Text numberOfLines={2} style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{block.description}</Text> : null}
        </View>
        <Ionicons color={theme.colors.textTertiary} name="ellipsis-horizontal" size={18} />
      </Pressable>
      </NativeCardContextMenu>
    );
  };

  const renderChecklist = (block: RichNoteChecklistBlock) => (
    <View key={block.id} style={{ gap: 2, width: '100%' }}>
      {block.items.map((item, index) => (
        <NativeCardContextMenu
          key={item.id}
          actions={checklistItemActions(block.id, item.id)}
          matchContents={{ vertical: true }}
          style={{
            alignSelf: 'stretch',
            flexShrink: 0,
            minHeight: theme.sizes.touchTargetMinimum,
            minWidth: 0,
            width: editorContentWidth > 0 ? editorContentWidth : '100%',
          }}
          title="Tarefa"
          triggerContentWidth={editorContentWidth > 0 ? editorContentWidth : undefined}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: theme.sizes.touchTargetMinimum, width: '100%' }}>
            <Pressable
              accessibilityLabel={item.checked ? `Desmarcar tarefa ${index + 1}` : `Marcar tarefa ${index + 1}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
              onPress={() => toggleChecklistItem(block.id, item.id)}
              onPressIn={markInteraction}
              style={{ alignItems: 'center', justifyContent: 'center', minHeight: theme.sizes.touchTargetMinimum, width: RICH_NOTE_CHECKLIST_CONTROL_WIDTH }}
            >
              <ChecklistCheckboxIndicator isCompleted={item.checked} />
            </Pressable>
            <View
              onLayout={(event) => measureInputHitArea(item.id, event.nativeEvent.layout.width)}
              style={{ flex: 1, minWidth: 0, position: 'relative' }}
            >
              <TextInput
                accessibilityLabel={`Tarefa ${index + 1}`}
                editable={!disabled}
                multiline
                onContentSizeChange={(event) => measureChecklistInput(item.id, event.nativeEvent.contentSize.height, item.text)}
                onBlur={handleInputBlur}
                onChangeText={(text) => {
                  preserveExplicitLines(item.id, text, checklistTaskLineHeight, checklistTaskMinimumHeight, checklistTaskVerticalPadding);
                  updateChecklistItem(block.id, item.id, (current) => ({ ...current, text }), `checklist:${item.id}`);
                }}
                onFocus={() => {
                  if (submittedChecklistItemRef.current === item.id) submittedChecklistItemRef.current = null;
                  const input = { kind: 'checklist' as const, blockId: block.id, itemId: item.id };
                  editorHasFocusRef.current = true;
                  activeInputRef.current = input;
                }}
                onSelectionChange={(event) => {
                  selectionRef.current = event.nativeEvent.selection;
                  selectionByInputRef.current.set(item.id, event.nativeEvent.selection);
                }}
                onSubmitEditing={() => submitChecklistItem(block.id, item.id)}
                onTouchStart={(event) => markTextLineInteraction(item.id, event, checklistTaskLineHeight, measuredInputHeights[item.id] ?? checklistTaskMinimumHeight, theme.spacing.xs)}
                placeholder="Item da checklist"
                placeholderTextColor={theme.colors.textTertiary}
                ref={(node) => {
                  if (!node) {
                    inputRefs.current.delete(item.id);
                    return;
                  }
                  inputRefs.current.set(item.id, node);
                }}
                returnKeyType="next"
                scrollEnabled={false}
                selectionColor={theme.colors.primary}
                style={[theme.typography.body, { color: item.checked ? theme.colors.textSecondary : theme.colors.textPrimary, flex: 1, height: measuredInputHeights[item.id] ?? checklistTaskMinimumHeight, minHeight: checklistTaskMinimumHeight, minWidth: 0, paddingVertical: theme.spacing.xs, textDecorationLine: item.checked ? 'line-through' : 'none', textAlignVertical: 'center' }]}
                submitBehavior="submit"
                value={item.text}
              />
              <Text
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onTextLayout={(event) => measureInputTextLines(item.id, event.nativeEvent.lines.map((line) => ({ width: line.width, height: line.height })))}
                pointerEvents="none"
                style={[theme.typography.body, { color: item.checked ? theme.colors.textSecondary : theme.colors.textPrimary, left: 0, opacity: 0, paddingVertical: theme.spacing.xs, position: 'absolute', textDecorationLine: item.checked ? 'line-through' : 'none', top: 0, width: '100%' }]}
              >
                {item.text || 'Item da checklist'}
              </Text>
            </View>
          </View>
        </NativeCardContextMenu>
      ))}
      <Pressable
        accessibilityLabel="Adicionar tarefa à checklist da nota"
        accessibilityRole="button"
        onPress={() => addChecklistItem(block.id, block.items.at(-1)?.id ?? '')}
        onPressIn={markInteraction}
        style={{ alignSelf: 'flex-start', justifyContent: 'center', minHeight: theme.sizes.touchTargetMinimum, paddingLeft: 34 }}
      >
        <Text style={[theme.typography.body, { color: theme.colors.textTertiary }]}>Adicionar tarefa</Text>
      </Pressable>
    </View>
  );

  const renderInlineLinkComposer = () => (
    <View
      accessibilityLabel={linkComposer?.blockId ? 'Editar link na nota' : 'Compor link na nota'}
      onTouchStart={markInteraction}
      style={{ backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.separator, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.spacing.sm, padding: theme.spacing.md, width: '100%' }}
    >
      <TextInput
        accessibilityLabel="Endereço do link"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={(value) => { setLinkURL(value); setLinkError(null); }}
        onSubmitEditing={commitLinkComposer}
        onTouchStart={markInteraction}
        placeholder="Cole ou digite uma URL"
        placeholderTextColor={theme.colors.textTertiary}
        ref={linkURLInputRef}
        returnKeyType="done"
        style={[theme.typography.body, { color: theme.colors.textPrimary, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }]}
        value={linkURL}
      />
      <View style={{ backgroundColor: theme.colors.background, borderRadius: theme.radius.pill, flexDirection: 'row', padding: 3 }}>
        {(['preview', 'text'] as const).map((presentation) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: linkComposer?.presentation === presentation }}
            key={presentation}
            onPress={() => setLinkComposer((current) => current ? { ...current, presentation } : null)}
            onPressIn={markInteraction}
            style={{ alignItems: 'center', backgroundColor: linkComposer?.presentation === presentation ? theme.colors.surfaceMuted : 'transparent', borderRadius: theme.radius.pill, flex: 1, justifyContent: 'center', minHeight: 40 }}
          >
            <Text style={[theme.typography.footnote, { color: theme.colors.textPrimary, fontWeight: linkComposer?.presentation === presentation ? '600' : '400' }]}>
              {presentation === 'preview' ? 'Prévia' : 'Link simples'}
            </Text>
          </Pressable>
        ))}
      </View>
      {linkError ? <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>{linkError}</Text> : null}
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" onPress={cancelLinkComposer} onPressIn={markInteraction} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 72, paddingHorizontal: theme.spacing.sm }}>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Cancelar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={commitLinkComposer} onPressIn={markInteraction} style={{ alignItems: 'center', backgroundColor: theme.colors.textPrimary, borderRadius: theme.radius.pill, justifyContent: 'center', minHeight: 44, minWidth: 82, paddingHorizontal: theme.spacing.md }}>
          <Text style={[theme.typography.body, { color: theme.colors.background, fontWeight: '600' }]}>Inserir</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderParagraphWithLinkComposer = (block: RichNoteParagraphBlock) => {
    const start = Math.max(0, Math.min(linkComposer?.anchor.selection.start ?? 0, block.text.length));
    const end = Math.max(start, Math.min(linkComposer?.anchor.selection.end ?? start, block.text.length));
    const fontSize = paragraphFontSize(block.style);
    const lineHeight = paragraphLineHeight(block.style, fontSize);
    const frozenTextStyle = {
      color: theme.colors.textPrimary,
      fontSize,
      fontStyle: block.italic ? 'italic' as const : 'normal' as const,
      fontWeight: block.bold ? block.style === 'title' ? theme.typography.largeTitle.fontWeight : '600' as const : '400' as const,
      lineHeight,
      textDecorationLine: block.underline ? 'underline' as const : 'none' as const,
    };
    return (
      <View key={`link-composer-anchor-${block.id}`} style={{ gap: theme.spacing.xs, width: '100%' }}>
        {block.text.slice(0, start) ? <Text style={frozenTextStyle}>{block.text.slice(0, start)}</Text> : null}
        {renderInlineLinkComposer()}
        {block.text.slice(end) ? <Text style={frozenTextStyle}>{block.text.slice(end)}</Text> : null}
      </View>
    );
  };

  return (
    <View onLayout={handleEditorLayout} style={{ width: '100%' }}>
      <View style={{ gap: theme.spacing.md, width: '100%' }}>
        {(() => {
          const composer = linkComposer;
          const paragraphAnchor = composer?.blockId == null && composer?.anchor.input?.kind === 'paragraph'
            ? composer.anchor.input.blockId
            : null;
          const editedLinkIndex = composer?.blockId == null ? -1 : document.blocks.findIndex((block) => block.id === composer.blockId && block.type === 'link');
          const paragraphAnchorIndex = paragraphAnchor == null ? -1 : document.blocks.findIndex((block) => block.id === paragraphAnchor && block.type === 'paragraph');
          const checklistAnchorIndex = composer?.blockId == null && composer?.anchor.input?.kind === 'checklist'
            ? document.blocks.findIndex((block) => block.id === composer.anchor.input?.blockId)
            : -1;
          const rendered = document.blocks.flatMap((block, index) => {
            let row: ReactElement;
            if (block.type === 'paragraph') row = renderParagraph(block, index);
            else if (block.type === 'image') row = renderImage(block);
            else if (block.type === 'link') row = renderLink(block);
            else row = renderChecklist(block);

            if (!composer) return [row];
            if (index === editedLinkIndex && block.type === 'link') {
              return [<View key={`link-composer-edit-${block.id}`}>{renderInlineLinkComposer()}</View>];
            }
            if (index === paragraphAnchorIndex && block.type === 'paragraph') {
              return [renderParagraphWithLinkComposer(block)];
            }
            if (index === checklistAnchorIndex) {
              return [row, <View key="link-composer-after-checklist">{renderInlineLinkComposer()}</View>];
            }
            return [row];
          });
          if (composer && editedLinkIndex < 0 && paragraphAnchorIndex < 0 && checklistAnchorIndex < 0) {
            return [...rendered, <View key="link-composer-inline-fallback">{renderInlineLinkComposer()}</View>];
          }
          return rendered;
        })()}
      </View>
    </View>
  );
});

export function useRichNoteKeyboardInteractions(editorRef: { current: RichNoteEditorHandle | null }) {
  const touchRef = useRef<{ x: number; y: number; moved: boolean; touchedInteractive: boolean; keyboardWasVisible: boolean } | null>(null);

  const markInteractiveTouch = useCallback(() => {
    if (touchRef.current) touchRef.current.touchedInteractive = true;
  }, []);
  const onTouchStartCapture = useCallback((event: GestureResponderEvent) => {
    touchRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, moved: false, touchedInteractive: false, keyboardWasVisible: Keyboard.isVisible() };
  }, []);
  const onTouchMove = useCallback((event: GestureResponderEvent) => {
    const touch = touchRef.current;
    if (touch && (Math.abs(event.nativeEvent.pageX - touch.x) > 8 || Math.abs(event.nativeEvent.pageY - touch.y) > 8)) {
      touch.moved = true;
    }
  }, []);
  const onTouchEnd = useCallback(() => {
    const touch = touchRef.current;
    touchRef.current = null;
    if (!touch || touch.moved || touch.touchedInteractive) return;
    if (touch.keyboardWasVisible) editorRef.current?.dismissKeyboard();
    else editorRef.current?.handleToolbarAction('focusAtEnd');
  }, [editorRef]);

  return { markInteractiveTouch, onTouchEnd, onTouchMove, onTouchStartCapture };
}
