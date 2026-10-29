import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button as NativeButton, HStack, Host, Picker, Text as NativeText, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import {
  padding as nativePadding,
  pickerStyle,
  presentationCornerRadius,
  presentationDetents,
  presentationDragIndicator,
  foregroundStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
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
import { useAppTheme } from '@/theme';

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
type LinkDialogState = { blockId: string | null; presentation: 'text' | 'preview' };

function imageUri(block: Extract<RichNoteBlock, { type: 'image' }>): string | null {
  if (block.sourceUri) return block.sourceUri;
  if (!block.relativePath) return null;
  try {
    return getRichNoteAssetUri(block.relativePath);
  } catch {
    return null;
  }
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
  const { resolvedMode, theme } = useAppTheme();
  const documentRef = useRef(document);
  const inputRefs = useRef(new Map<string, TextInputInstance>());
  const activeInputRef = useRef<EditorInput | null>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const previewRequestsRef = useRef(new Map<string, AbortController>());
  const attemptedPreviewUrlsRef = useRef(new Map<string, string>());
  const didInitialFocusRef = useRef(false);
  const editorHasFocusRef = useRef(false);
  const linkRestoreFocusRef = useRef<{ input: EditorInput; selection: { start: number; end: number } } | null>(null);
  const pendingDismissFocusRef = useRef<{ input: EditorInput; selection: { start: number; end: number } } | null>(null);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [linkURL, setLinkURL] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [failedPreviewIds, setFailedPreviewIds] = useState<Set<string>>(new Set());
  const [measuredInputHeights, setMeasuredInputHeights] = useState<Record<string, number>>({});
  const nativeLinkURL = useNativeState('');

  useEffect(() => {
    documentRef.current = document;
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

  const publishDocument = useCallback((next: RichNoteDocument) => {
    documentRef.current = next;
    onChange(next);
  }, [onChange]);

  const focusInput = useCallback((input: EditorInput, selection?: { start: number; end: number }) => {
    activeInputRef.current = input;
    requestAnimationFrame(() => {
      const target = inputRefs.current.get(input.kind === 'paragraph' ? input.blockId : input.itemId);
      if (!target) return;
      target.focus();
      if (selection) target.setNativeProps({ selection });
    });
  }, []);

  const focusAtEnd = useCallback(() => {
    const current = documentRef.current;
    let paragraph = [...current.blocks].reverse().find((block): block is RichNoteParagraphBlock => block.type === 'paragraph');
    if (!paragraph) {
      paragraph = createRichNoteParagraph();
      publishDocument({ ...current, blocks: [...current.blocks, paragraph] });
    }
    focusInput({ kind: 'paragraph', blockId: paragraph.id }, { start: paragraph.text.length, end: paragraph.text.length });
  }, [focusInput, publishDocument]);

  const dismissKeyboard = useCallback(() => {
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

  const updateBlock = useCallback((blockId: string, update: (block: RichNoteBlock) => RichNoteBlock) => {
    const current = documentRef.current;
    publishDocument({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? update(block) : block),
    });
  }, [publishDocument]);

  const updateParagraphText = useCallback((blockId: string, text: string) => {
    updateBlock(blockId, (block) => block.type === 'paragraph' ? { ...block, text } : block);
  }, [updateBlock]);

  const updateChecklistItem = useCallback((blockId: string, itemId: string, update: (item: RichNoteChecklistBlock['items'][number]) => RichNoteChecklistBlock['items'][number]) => {
    updateBlock(blockId, (block) => block.type === 'checklist'
      ? { ...block, items: block.items.map((item) => item.id === itemId ? update(item) : item) }
      : block);
  }, [updateBlock]);

  const measureInput = useCallback((inputId: string, contentHeight: number, minimumHeight: number, verticalPadding = 0) => {
    const nextHeight = Math.max(minimumHeight, Math.ceil(contentHeight + verticalPadding));
    setMeasuredInputHeights((current) => current[inputId] === nextHeight ? current : { ...current, [inputId]: nextHeight });
  }, []);

  const insertAfterActivePosition = useCallback((inserted: RichNoteBlock[], focusAfter = true) => {
    const current = documentRef.current;
    const active = activeInputRef.current;
    const activeParagraph = active?.kind === 'paragraph'
      ? current.blocks.find((block): block is RichNoteParagraphBlock => block.type === 'paragraph' && block.id === active.blockId)
      : undefined;
    let nextBlocks: RichNoteBlock[];
    let focusParagraph: RichNoteParagraphBlock | null = null;

    if (activeParagraph) {
      const selection = selectionRef.current;
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
      focusInput({ kind: 'paragraph', blockId: focusParagraph.id }, { start: 0, end: 0 });
    }
    return focusParagraph;
  }, [focusInput, publishDocument]);

  const openImagePicker = useCallback(async (replaceBlockId?: string) => {
    markInteraction();
    const editorWasFocused = editorHasFocusRef.current;
    const focusBeforePicker = activeInputRef.current
      ? { input: activeInputRef.current, selection: { ...selectionRef.current } }
      : null;
    onAuxiliaryPresentationChange?.(true);
    dismissKeyboard();
    let focusAfterPicker: { input: EditorInput; selection: { start: number; end: number } } | null = null;
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
      const after = insertAfterActivePosition(images, false);
      if (after) focusAfterPicker = { input: { kind: 'paragraph', blockId: after.id }, selection: { start: 0, end: 0 } };
    } catch {
      Alert.alert('Não foi possível inserir as imagens', 'Tente selecionar as fotos novamente.');
    } finally {
      onAuxiliaryPresentationChange?.(false);
      if (focusAfterPicker) requestAnimationFrame(() => focusInput(focusAfterPicker!.input, focusAfterPicker!.selection));
    }
  }, [dismissKeyboard, focusInput, insertAfterActivePosition, markInteraction, onAuxiliaryPresentationChange, updateBlock]);

  const openLinkDialog = useCallback((blockId: string | null = null) => {
    markInteraction();
    const existing = blockId
      ? documentRef.current.blocks.find((block): block is RichNoteLinkBlock => block.type === 'link' && block.id === blockId)
      : undefined;
    linkRestoreFocusRef.current = editorHasFocusRef.current && activeInputRef.current
      ? { input: activeInputRef.current, selection: { ...selectionRef.current } }
      : null;
    const nextURL = existing?.url ?? '';
    setLinkURL(nextURL);
    nativeLinkURL.set(nextURL);
    setLinkError(null);
    onAuxiliaryPresentationChange?.(true);
    dismissKeyboard();
    setLinkDialog({ blockId, presentation: existing?.presentation ?? 'preview' });
  }, [dismissKeyboard, markInteraction, nativeLinkURL, onAuxiliaryPresentationChange]);

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
        : block);
    }).catch(() => {
      if (!controller.signal.aborted && attemptedPreviewUrlsRef.current.get(blockId) === url) {
        attemptedPreviewUrlsRef.current.delete(blockId);
      }
      // The inserted fallback stays editable and does not block note writing.
    }).finally(() => {
      if (previewRequestsRef.current.get(blockId) === controller) previewRequestsRef.current.delete(blockId);
    });
  }, [updateBlock]);

  const commitLinkDialog = useCallback(() => {
    if (!linkDialog) return;
    let normalized: ReturnType<typeof normalizeWebLink>;
    try {
      normalized = normalizeWebLink(linkURL);
    } catch {
      setLinkError('Digite um endereço HTTP ou HTTPS válido.');
      return;
    }
    setLinkError(null);
    if (linkDialog.blockId) {
      const blockId = linkDialog.blockId;
      updateBlock(blockId, (block) => block.type === 'link'
        ? { ...block, url: normalized.url, domain: normalized.domain, title: fallbackLinkTitle(normalized.url), description: null, previewImageUrl: null, presentation: linkDialog.presentation }
        : block);
      pendingDismissFocusRef.current = linkRestoreFocusRef.current;
      linkRestoreFocusRef.current = null;
      setLinkDialog(null);
      if (linkDialog.presentation === 'preview') requestPreviewMetadata(blockId, normalized.url);
      return;
    }

    const blockId = createRichNoteId('link');
    const block: RichNoteLinkBlock = {
      id: blockId,
      type: 'link',
      url: normalized.url,
      presentation: linkDialog.presentation,
      title: fallbackLinkTitle(normalized.url),
      description: null,
      domain: normalized.domain,
    };
    const after = insertAfterActivePosition([block], false);
    pendingDismissFocusRef.current = after
      ? { input: { kind: 'paragraph', blockId: after.id }, selection: { start: 0, end: 0 } }
      : null;
    setLinkDialog(null);
    if (block.presentation === 'preview') requestPreviewMetadata(blockId, normalized.url);
  }, [insertAfterActivePosition, linkDialog, linkURL, requestPreviewMetadata, updateBlock]);

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
    requestAnimationFrame(() => inputRefs.current.get(itemId)?.focus());
  }, [updateBlock]);

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
    requestAnimationFrame(() => inputRefs.current.get(itemId)?.focus());
  }, [insertAfterActivePosition]);

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
      { id: 'edit', title: 'Editar URL', systemImage: 'pencil', onPress: () => openLinkDialog(block.id) },
      { id: 'presentation', title: block.presentation === 'preview' ? 'Mostrar link simples' : 'Mostrar prévia', systemImage: 'rectangle.on.rectangle', onPress: () => {
        updateBlock(block.id, (current) => current.type === 'link' ? { ...current, presentation: nextPresentation } : current);
        if (nextPresentation === 'preview') requestPreviewMetadata(block.id, block.url);
      } },
      { id: 'remove', title: 'Remover link', systemImage: 'trash', destructive: true, onPress: () => removeBlock(block.id) },
    ];
  }, [openLinkDialog, removeBlock, requestPreviewMetadata, updateBlock]);

  const checklistItemActions = useCallback((blockId: string, itemId: string): NativeCardContextMenuAction[] => [
    { id: 'remove-task', title: 'Remover tarefa', systemImage: 'trash', destructive: true, onPress: () => removeChecklistItem(blockId, itemId) },
  ], [removeChecklistItem]);

  const insertImage = useCallback(() => { void openImagePicker(); }, [openImagePicker]);
  const insertLink = useCallback(() => openLinkDialog(), [openLinkDialog]);

  const handleToolbarAction = useCallback((action: string) => {
    const active = activeInputRef.current;
    const paragraph = active?.kind === 'paragraph'
      ? documentRef.current.blocks.find((block): block is RichNoteParagraphBlock => block.type === 'paragraph' && block.id === active.blockId)
      : undefined;
    switch (action) {
      case 'format.body': applyParagraphUpdate({ style: 'body', bold: false, italic: false, underline: false, listStyle: 'none' }); break;
      case 'format.title': applyParagraphUpdate({ style: 'title', listStyle: 'none' }); break;
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
      case 'dismissKeyboard': dismissKeyboard(); break;
      default: break;
    }
  }, [applyParagraphUpdate, dismissKeyboard, insertChecklist, insertImage, insertLink]);

  useImperativeHandle(forwardedRef, () => ({
    dismissKeyboard,
    focusAtEnd,
    insertChecklist,
    insertImage,
    insertLink,
    handleToolbarAction,
  }), [dismissKeyboard, focusAtEnd, handleToolbarAction, insertChecklist, insertImage, insertLink]);

  const paragraphFontSize = (style: RichNoteParagraphStyle) => style === 'title' ? 28 : style === 'subtitle' ? 21 : 17;

  const renderParagraph = (block: RichNoteParagraphBlock, index: number) => {
    const marker = block.listStyle === 'bullet' ? '•' : block.listStyle === 'numbered' ? `${listNumber(document.blocks, block.id)}.` : null;
    const fontSize = paragraphFontSize(block.style);
    const lineHeight = fontSize * 1.45;
    return (
      <View key={block.id} style={{ alignItems: 'flex-start', flexDirection: 'row', gap: marker ? theme.spacing.xs : 0, minWidth: 0, width: '100%' }}>
        {marker ? <Text style={{ color: theme.colors.textPrimary, fontSize, lineHeight: fontSize * 1.45, minWidth: 22 }}>{marker}</Text> : null}
        <TextInput
          accessibilityLabel={block.style === 'title' ? `Título do parágrafo ${index + 1}` : `Parágrafo ${index + 1}`}
          autoCapitalize="sentences"
          editable={!disabled}
          multiline
          onContentSizeChange={(event) => measureInput(block.id, event.nativeEvent.contentSize.height, lineHeight)}
          onBlur={handleInputBlur}
          onChangeText={(text) => updateParagraphText(block.id, text)}
          onFocus={() => {
            const input = { kind: 'paragraph' as const, blockId: block.id };
            editorHasFocusRef.current = true;
            activeInputRef.current = input;
          }}
          onSelectionChange={(event) => { selectionRef.current = event.nativeEvent.selection; }}
          onTouchStart={markInteraction}
          placeholder={index === 0 ? 'Comece a escrever...' : undefined}
          placeholderTextColor={theme.colors.textTertiary}
          ref={(node) => { if (node) inputRefs.current.set(block.id, node); else inputRefs.current.delete(block.id); }}
          selectionColor={theme.colors.primary}
          style={{
            color: theme.colors.textPrimary,
            flex: 1,
            fontSize,
            fontStyle: block.italic ? 'italic' : 'normal',
            fontWeight: block.bold || block.style === 'title' ? '600' : '400',
            height: measuredInputHeights[block.id] ?? lineHeight,
            lineHeight,
            minHeight: lineHeight,
            minWidth: 0,
            padding: 0,
            textAlignVertical: 'top',
            textDecorationLine: block.underline ? 'underline' : 'none',
          }}
          scrollEnabled={false}
          value={block.text}
        />
      </View>
    );
  };

  const renderImage = (block: Extract<RichNoteBlock, { type: 'image' }>) => {
    const uri = imageUri(block);
    if (!uri) {
      return <Text key={block.id} style={[theme.typography.footnote, { color: theme.colors.danger }]}>Imagem indisponível. Remova e insira novamente.</Text>;
    }
    const width = block.size === 'small' ? '45%' : block.size === 'medium' ? '72%' : '100%';
    return (
      <NativeCardContextMenu key={block.id} actions={imageActions(block.id)} title="Imagem" style={{ alignSelf: 'flex-start', width }}>
        <View onTouchStart={markInteraction} style={{ alignSelf: 'flex-start', borderRadius: theme.radius.card, overflow: 'hidden', width }}>
          <Image
            accessibilityLabel="Imagem dentro da nota. Toque e segure para ações."
            contentFit="contain"
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
        <View key={item.id} style={{ alignItems: 'center', flexDirection: 'row', minHeight: theme.sizes.touchTargetMinimum, width: '100%' }}>
          <NativeCardContextMenu actions={checklistItemActions(block.id, item.id)} title="Tarefa">
          <Pressable
            accessibilityLabel={item.checked ? `Desmarcar tarefa ${index + 1}` : `Marcar tarefa ${index + 1}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
            hitSlop={4}
            onPress={() => toggleChecklistItem(block.id, item.id)}
            onPressIn={markInteraction}
            style={{ alignItems: 'flex-start', justifyContent: 'center', minHeight: theme.sizes.touchTargetMinimum, width: 34 }}
          >
            <ChecklistCheckboxIndicator isCompleted={item.checked} />
          </Pressable>
          </NativeCardContextMenu>
          <TextInput
            accessibilityLabel={`Tarefa ${index + 1}`}
            editable={!disabled}
            multiline
            onContentSizeChange={(event) => measureInput(item.id, event.nativeEvent.contentSize.height, theme.sizes.touchTargetMinimum, theme.spacing.xs * 2)}
            onBlur={handleInputBlur}
            onChangeText={(text) => updateChecklistItem(block.id, item.id, (current) => ({ ...current, text }))}
            onFocus={() => {
              const input = { kind: 'checklist' as const, blockId: block.id, itemId: item.id };
              editorHasFocusRef.current = true;
              activeInputRef.current = input;
            }}
            onSubmitEditing={() => addChecklistItem(block.id, item.id)}
            onTouchStart={markInteraction}
            placeholder="Item da checklist"
            placeholderTextColor={theme.colors.textTertiary}
            ref={(node) => { if (node) inputRefs.current.set(item.id, node); else inputRefs.current.delete(item.id); }}
            returnKeyType="next"
            scrollEnabled={false}
            selectionColor={theme.colors.primary}
            style={[theme.typography.body, { color: item.checked ? theme.colors.textSecondary : theme.colors.textPrimary, flex: 1, height: measuredInputHeights[item.id] ?? theme.sizes.touchTargetMinimum, minHeight: theme.sizes.touchTargetMinimum, minWidth: 0, paddingVertical: theme.spacing.xs, textDecorationLine: item.checked ? 'line-through' : 'none', textAlignVertical: 'center' }]}
            submitBehavior="submit"
            value={item.text}
          />
        </View>
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

  const handleLinkSheetDismiss = useCallback(() => {
    onAuxiliaryPresentationChange?.(false);
    linkRestoreFocusRef.current = null;
    const pending = pendingDismissFocusRef.current;
    pendingDismissFocusRef.current = null;
    if (pending) requestAnimationFrame(() => focusInput(pending.input, pending.selection));
  }, [focusInput, onAuxiliaryPresentationChange]);

  return (
    <View style={{ flexGrow: 1, width: '100%' }}>
      <View style={{ gap: theme.spacing.md, width: '100%' }}>
        {document.blocks.map((block, index) => {
          if (block.type === 'paragraph') return renderParagraph(block, index);
          if (block.type === 'image') return renderImage(block);
          if (block.type === 'link') return renderLink(block);
          return renderChecklist(block);
        })}
      </View>

      <Host colorScheme={resolvedMode} matchContents={false} style={{ height: 1, width: 1 }}>
        <BottomSheet
          isPresented={linkDialog != null}
          modifiers={[
            presentationDetents([{ height: 320 }, 'medium']),
            presentationDragIndicator('visible'),
            presentationCornerRadius(28),
          ]}
          onDismiss={handleLinkSheetDismiss}
          onIsPresentedChange={(presented) => { if (!presented) setLinkDialog(null); }}
        >
          <VStack spacing={theme.spacing.md} modifiers={[nativePadding({ all: theme.spacing.lg })]}>
            <NativeText>{linkDialog?.blockId ? 'Editar link' : 'Adicionar link'}</NativeText>
            <TextField
              autoFocus
              onTextChange={(value) => { setLinkURL(value); setLinkError(null); }}
              placeholder="https://exemplo.com"
              text={nativeLinkURL}
            />
            <Picker
              label="Apresentação"
              modifiers={[pickerStyle('segmented')]}
              onSelectionChange={(presentation) => setLinkDialog((current) => current ? { ...current, presentation: presentation as 'text' | 'preview' } : null)}
              selection={linkDialog?.presentation ?? 'preview'}
            >
              <NativeText modifiers={[tag('preview')]}>Prévia</NativeText>
              <NativeText modifiers={[tag('text')]}>Link simples</NativeText>
            </Picker>
            {linkError ? <NativeText modifiers={[foregroundStyle(theme.colors.danger)]}>{linkError}</NativeText> : null}
            <HStack spacing={theme.spacing.md}>
              <NativeButton label="Cancelar" onPress={() => setLinkDialog(null)} role="cancel" />
              <NativeButton label="Inserir" onPress={commitLinkDialog} />
            </HStack>
          </VStack>
        </BottomSheet>
      </Host>
    </View>
  );
});

export function useRichNoteKeyboardInteractions(editorRef: { current: RichNoteEditorHandle | null }) {
  const touchRef = useRef<{ x: number; y: number; moved: boolean; touchedInteractive: boolean } | null>(null);

  const markInteractiveTouch = useCallback(() => {
    if (touchRef.current) touchRef.current.touchedInteractive = true;
  }, []);
  const onTouchStartCapture = useCallback((event: GestureResponderEvent) => {
    touchRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, moved: false, touchedInteractive: false };
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
    editorRef.current?.dismissKeyboard();
  }, [editorRef]);

  return { markInteractiveTouch, onTouchEnd, onTouchMove, onTouchStartCapture };
}
