import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { getFolderAuthenticationFailureMessage } from '@/features/home-folders/folderFaceIdAuthentication';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { getHomeFolderNameErrorMessage } from '@/features/home-folders/homeFolderTypes';
import type { HomeFolder } from '@/features/home-folders/homeFolderTypes';
import { createSavedTag, deleteSavedTag, listSavedTags, updateSavedTag } from '@/features/home-tags/tagLibrary';
import { getSavedTagNameErrorMessage, type SavedTag } from '@/features/home-tags/tagTypes';
import { useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { getAccentColorTokens } from '@/theme/colors';
import { formatStorageBytes } from '@/features/storage/storageUsage';
import { useStorageUsage } from '@/features/storage/useStorageUsage';
import { getRecentlyDeletedDaysRemaining } from '@/features/home-trash/trashLibrary';
import { getRecentlyDeletedItemLabel, useRecentlyDeletedItems } from '@/features/home-trash/useRecentlyDeletedItems';
import type { RecentlyDeletedItem } from '@/features/home-trash/trashLibrary';
import {
  getAccentColorRows,
  getAccentColorSwatch,
  getAccentColorSwatchForeground,
  useAppTheme,
} from '@/theme';
import type { AccentColorName } from '@/theme';

type RecentlyDeletedAction = { label: string; onSelect: () => void; destructive?: boolean };

function showRecentlyDeletedItemMenu(item: RecentlyDeletedItem, actions: {
  onRestore: (item: RecentlyDeletedItem) => void;
  onPermanentlyDelete: (item: RecentlyDeletedItem) => void;
}) {
  const availableActions: RecentlyDeletedAction[] = [
    { label: 'Restaurar', onSelect: () => actions.onRestore(item) },
    { label: 'Apagar definitivamente', onSelect: () => actions.onPermanentlyDelete(item), destructive: true },
  ];
  const cancelButtonIndex = availableActions.length;
  const options = [...availableActions.map(({ label }) => label), 'Cancelar'];
  const destructiveButtonIndex = availableActions.findIndex(({ destructive }) => destructive);

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex, destructiveButtonIndex },
      (selectedIndex) => availableActions[selectedIndex]?.onSelect(),
    );
    return;
  }

  Alert.alert(
    'Ações do conteúdo apagado',
    undefined,
    [
      ...availableActions.map(({ label, onSelect, destructive }) => ({
        text: label,
        onPress: onSelect,
        ...(destructive ? { style: 'destructive' as const } : {}),
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ],
  );
}

export default function SettingsSheetFallbackScreen() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  const initialPage = page === 'folders' ? 'folders' : page === 'tags' ? 'tags' : page === 'storage' ? 'storage' : 'root';

  return <SettingsSheetFallbackContent key={initialPage} initialPage={initialPage} />;
}

function SettingsSheetFallbackContent({ initialPage }: { initialPage: 'root' | 'folders' | 'tags' | 'storage' }) {
  const { accentColor, appearanceMode, resolvedMode, setAccentColor, setAppearanceMode, theme } = useAppTheme();
  const router = useRouter();
  const { notifySavedTagsChanged } = useHomeSettingsSheet();
  const {
    authorizeFolder,
    createFolder,
    deleteFolder,
    folders,
    renameFolder,
    setFolderColor,
    setFolderProtection,
  } = useLocalHomeFolders();
  const [currentPage, setCurrentPage] = useState<'root' | 'appearance' | 'folders' | 'folder-settings' | 'tags' | 'tag-settings' | 'storage' | 'recently-deleted'>(initialPage);
  const [isCreateEditorVisible, setIsCreateEditorVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isOperationPending, setIsOperationPending] = useState(false);
  const [savedTags, setSavedTags] = useState<SavedTag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagDraftName, setTagDraftName] = useState('');
  const [tagDraftColor, setTagDraftColor] = useState<AccentColorName>(accentColor);
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  const selectedTag = savedTags.find((savedTag) => savedTag.id === selectedTagId) ?? null;
  const storageUsage = useStorageUsage(currentPage === 'storage');
  const recentlyDeleted = useRecentlyDeletedItems(currentPage === 'recently-deleted');

  useEffect(() => {
    let cancelled = false;
    void listSavedTags().then((nextTags) => {
      if (!cancelled) setSavedTags(nextTags);
    }).catch(() => {
      if (!cancelled) Alert.alert('Não foi possível carregar as etiquetas', 'Tente novamente.');
    });
    return () => { cancelled = true; };
  }, []);

  const startEditor = () => {
    setDraftName('');
    setIsCreateEditorVisible(true);
  };

  const saveFolder = async () => {
    try {
      await createFolder(draftName);
      setIsCreateEditorVisible(false);
    } catch (error) {
      Alert.alert('Não foi possível salvar a pasta', getHomeFolderNameErrorMessage(error));
    }
  };

  const showAuthFailure = (outcome: 'unavailable' | 'failed') => {
    Alert.alert('Face ID indisponível', getFolderAuthenticationFailureMessage(outcome));
  };

  const toggleProtection = async (folder: HomeFolder) => {
    if (isOperationPending) return;
    setIsOperationPending(true);
    try {
      const outcome = await setFolderProtection(folder.id, !folder.isProtected);
      if (outcome === 'unavailable' || outcome === 'failed') showAuthFailure(outcome);
    } catch {
      Alert.alert('Não foi possível alterar a proteção', 'A pasta continua com a configuração anterior.');
    } finally {
      setIsOperationPending(false);
    }
  };

  const requestDelete = async (folder: HomeFolder) => {
    if (isOperationPending) return;
    setIsOperationPending(true);
    if (folder.isProtected) {
      try {
        const outcome = await authorizeFolder(folder.id);
        if (outcome !== 'authenticated') {
          if (outcome === 'unavailable' || outcome === 'failed') showAuthFailure(outcome);
          setIsOperationPending(false);
          return;
        }
      } catch {
        Alert.alert('Não foi possível autenticar', 'A pasta continua protegida.');
        setIsOperationPending(false);
        return;
      }
    }
    Alert.alert(
      `Excluir “${folder.name}”?`,
      folder.isProtected
        ? 'Os conteúdos continuarão salvos, ficarão sem pasta e voltarão a aparecer em Todos.'
        : 'Os conteúdos continuarão salvos e ficarão sem pasta.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setIsOperationPending(false) },
        { text: 'Excluir pasta', style: 'destructive', onPress: () => void finishDelete(folder) },
      ],
      { cancelable: false },
    );
  };

  const openFolderSettings = (folder: HomeFolder) => {
    setSelectedFolderId(folder.id);
    setDraftName(folder.name);
    setCurrentPage('folder-settings');
  };

  const startTagEditor = (savedTag: SavedTag | null = null) => {
    setSelectedTagId(savedTag?.id ?? null);
    setTagDraftName(savedTag?.name ?? '');
    setTagDraftColor(savedTag?.color ?? accentColor);
    setCurrentPage('tag-settings');
  };

  const saveTag = async () => {
    if (isOperationPending) return;
    setIsOperationPending(true);
    try {
      if (selectedTag) await updateSavedTag(selectedTag.id, tagDraftName, tagDraftColor);
      else await createSavedTag(tagDraftName, tagDraftColor);
      setSavedTags(await listSavedTags());
      notifySavedTagsChanged();
      setCurrentPage('tags');
    } catch (error) {
      Alert.alert('Não foi possível salvar a etiqueta', getSavedTagNameErrorMessage(error));
    } finally {
      setIsOperationPending(false);
    }
  };

  const requestDeleteTag = (savedTag: SavedTag) => {
    if (isOperationPending) return;
    Alert.alert(
      `Excluir “${savedTag.name}”?`,
      'A etiqueta será removida dos conteúdos associados. Os conteúdos salvos não serão excluídos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir etiqueta',
          style: 'destructive',
          onPress: () => void (async () => {
            setIsOperationPending(true);
            try {
              if (!await deleteSavedTag(savedTag.id)) throw new Error('SAVED_TAG_NOT_FOUND');
              setSavedTags((current) => current.filter((item) => item.id !== savedTag.id));
              notifySavedTagsChanged();
              setCurrentPage('tags');
            } catch {
              Alert.alert('Não foi possível excluir a etiqueta', 'Os conteúdos salvos foram mantidos. Tente novamente.');
            } finally {
              setIsOperationPending(false);
            }
          })(),
        },
      ],
      { cancelable: true },
    );
  };

  const saveFolderName = async () => {
    if (!selectedFolder || isOperationPending) return;
    setIsOperationPending(true);
    try {
      const updated = await renameFolder(selectedFolder.id, draftName);
      setSelectedFolderId(updated.id);
      setDraftName(updated.name);
    } catch (error) {
      Alert.alert('Não foi possível salvar a pasta', getHomeFolderNameErrorMessage(error));
    } finally {
      setIsOperationPending(false);
    }
  };

  const saveFolderColor = async (color: typeof accentColor | null) => {
    if (!selectedFolder || isOperationPending) return;
    setIsOperationPending(true);
    try {
      if (!await setFolderColor(selectedFolder.id, color)) {
        Alert.alert('Não foi possível alterar a cor', 'A cor anterior da pasta foi mantida.');
      }
    } catch {
      Alert.alert('Não foi possível alterar a cor', 'A cor anterior da pasta foi mantida.');
    } finally {
      setIsOperationPending(false);
    }
  };

  const finishDelete = async (folder: HomeFolder) => {
    try {
      const deleted = await deleteFolder(folder.id);
      if (!deleted) {
        Alert.alert('Não foi possível excluir', 'A pasta permanece como está.');
        return;
      }
      setSelectedFolderId(null);
      setCurrentPage('folders');
    } catch {
      Alert.alert('Não foi possível excluir', 'Tente novamente. Os conteúdos continuam salvos.');
    } finally {
      setIsOperationPending(false);
    }
  };

  const textInputStyle = [
    theme.typography.body,
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.separator,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      color: theme.colors.textPrimary,
      padding: theme.spacing.md,
    },
  ];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <View style={{ alignItems: 'center', borderBottomColor: theme.colors.separator, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 52, paddingHorizontal: theme.spacing.md }}>
        {currentPage !== 'root' ? (
          <Pressable
            accessibilityLabel={currentPage === 'folder-settings' ? 'Voltar para Pastas' : currentPage === 'tag-settings' ? 'Voltar para Etiquetas' : 'Voltar para Configurações'}
            onPress={() => setCurrentPage(currentPage === 'folder-settings' ? 'folders' : currentPage === 'tag-settings' ? 'tags' : 'root')}
            style={{ minWidth: 76 }}
          >
            <Text style={[theme.typography.body, { color: theme.colors.primary }]}>
              ‹ {currentPage === 'folder-settings' ? 'Pastas' : currentPage === 'tag-settings' ? 'Etiquetas' : 'Configurações'}
            </Text>
          </Pressable>
        ) : (
          <View style={{ minWidth: 76 }} />
        )}
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary, flex: 1, textAlign: 'center' }]}>
          {currentPage === 'root'
            ? 'Configurações'
            : currentPage === 'appearance'
              ? 'Aparência'
              : currentPage === 'folders'
              ? 'Pastas'
              : currentPage === 'tags'
                ? 'Etiquetas'
                : currentPage === 'storage'
                  ? 'Armazenamento'
                : currentPage === 'recently-deleted'
                  ? 'Apagados recentemente'
                : currentPage === 'tag-settings'
                  ? selectedTag?.name ?? 'Nova etiqueta'
                  : selectedFolder?.name ?? 'Pastas'}
        </Text>
        {currentPage === 'folders' || currentPage === 'tags' ? (
          <Pressable accessibilityLabel={currentPage === 'folders' ? 'Criar pasta' : 'Criar etiqueta'} onPress={currentPage === 'folders' ? startEditor : () => startTagEditor()} style={{ alignItems: 'flex-end', minWidth: 76 }}>
            <Ionicons color={theme.colors.primary} name="add" size={26} />
          </Pressable>
        ) : currentPage === 'root' ? (
          <Pressable accessibilityLabel="Fechar configurações" onPress={() => router.back()} style={{ alignItems: 'flex-end', minWidth: 76 }}>
            <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Fechar</Text>
          </Pressable>
        ) : (
          <View style={{ minWidth: 76 }} />
        )}
      </View>

      {currentPage === 'root' ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>PERSONALIZAÇÃO</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage('appearance')}
            style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg, minHeight: 64, padding: theme.spacing.md }}
          >
            <Ionicons color={theme.colors.textSecondary} name="color-palette-outline" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Aparência</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Tema e cor de destaque</Text>
            </View>
            <Ionicons color={theme.colors.textTertiary} name="chevron-forward" size={16} />
          </Pressable>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>ORGANIZAÇÃO</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage('folders')}
            style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, minHeight: 64, padding: theme.spacing.md }}
          >
            <Ionicons color={theme.colors.primary} name="folder-outline" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Pastas</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Criar e gerenciar pastas</Text>
            </View>
            <Ionicons color={theme.colors.textTertiary} name="chevron-forward" size={16} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage('tags')}
            style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm, minHeight: 64, padding: theme.spacing.md }}
          >
            <Ionicons color={theme.colors.primary} name="pricetag-outline" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Etiquetas</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Criar e gerenciar etiquetas coloridas</Text>
            </View>
            <Ionicons color={theme.colors.textTertiary} name="chevron-forward" size={16} />
          </Pressable>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, marginTop: theme.spacing.lg }]}>DADOS</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage('storage')}
            style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, minHeight: 64, padding: theme.spacing.md }}
          >
            <Ionicons color={theme.colors.primary} name="server-outline" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Armazenamento</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Ver uso local do SaveApp</Text>
            </View>
            <Ionicons color={theme.colors.textTertiary} name="chevron-forward" size={16} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage('recently-deleted')}
            style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm, minHeight: 64, padding: theme.spacing.md }}
          >
            <Ionicons color={theme.colors.primary} name="trash-outline" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Apagados recentemente</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Restaurar ou apagar conteúdos</Text>
            </View>
            <Ionicons color={theme.colors.textTertiary} name="chevron-forward" size={16} />
          </Pressable>
        </ScrollView>
      ) : currentPage === 'appearance' ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, padding: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>TEMA</Text>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', padding: theme.spacing.xs }}>
              {([
                ['system', 'Sistema'],
                ['light', 'Claro'],
                ['dark', 'Escuro'],
              ] as const).map(([mode, label]) => {
                const selected = appearanceMode === mode;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={mode}
                    onPress={() => setAppearanceMode(mode)}
                    style={{ alignItems: 'center', backgroundColor: selected ? theme.colors.selectionSurface : 'transparent', borderRadius: theme.radius.sm, flex: 1, justifyContent: 'center', minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.xs }}
                  >
                    <Text style={[theme.typography.footnote, { color: selected ? theme.colors.selectionContent : theme.colors.textSecondary }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>COR DO APLICATIVO</Text>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, gap: theme.spacing.sm, padding: theme.spacing.md }}>
              {getAccentColorRows().map((row, rowIndex) => (
                <View key={`accent-row-${rowIndex}`} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {row.map(({ id, label }) => {
                    const selected = accentColor === id;
                    return (
                      <Pressable
                        accessibilityLabel={`Cor ${label}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={id}
                        onPress={() => setAccentColor(id)}
                        style={{ alignItems: 'center', borderColor: selected ? theme.colors.primary : 'transparent', borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', width: 44 }}
                      >
                        <View style={{ alignItems: 'center', backgroundColor: getAccentColorSwatch(id, resolvedMode), borderRadius: 14, height: 28, justifyContent: 'center', width: 28 }}>
                          {selected ? <Ionicons color={getAccentColorSwatchForeground(id, resolvedMode)} name="checkmark" size={16} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={accentColor === 'black'}
                onPress={() => setAccentColor('black')}
                style={{ alignItems: 'center', minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center', opacity: accentColor === 'black' ? 0.5 : 1 }}
              >
                <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Restaurar cor padrão</Text>
              </Pressable>
            </View>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>A cor de destaque aparece em ações e seleções. Fundos, conteúdos e materiais do sistema mantêm suas cores.</Text>
          </View>
        </ScrollView>
      ) : currentPage === 'storage' ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>USO LOCAL</Text>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md }}>
            {([
              ['pie-chart-outline', 'Total do SaveApp', storageUsage.snapshot?.total ?? null],
              ['images-outline', 'Fotos', storageUsage.snapshot?.photos ?? null],
              ['videocam-outline', 'Vídeos', storageUsage.snapshot?.videos ?? null],
              ['document-outline', 'Documentos', storageUsage.snapshot?.documents ?? null],
              ['server-outline', 'Outros dados', storageUsage.snapshot?.other ?? null],
            ] as const).map(([icon, label, bytes], index) => {
              const value = bytes !== null
                ? formatStorageBytes(bytes)
                : storageUsage.isLoading
                  ? 'Calculando…'
                  : storageUsage.hasError
                    ? 'Erro na medição'
                    : 'Não foi possível medir';
              return (
                <View key={label} style={{ alignItems: 'center', borderBottomColor: theme.colors.separator, borderBottomWidth: index === 4 ? 0 : StyleSheet.hairlineWidth, flexDirection: 'row', gap: theme.spacing.sm, minHeight: 52 }}>
                  <Ionicons color={theme.colors.primary} name={icon} size={18} />
                  <Text style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>{label}</Text>
                  <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, lineHeight: 18, marginTop: theme.spacing.xs }]}>
            Soma o tamanho lógico dos arquivos acessíveis em Documentos e Cache, incluindo banco SQLite, miniaturas, prévias e arquivos em Apagados recentemente até a exclusão definitiva. Preferências do sistema, arquivos temporários fora dessas pastas e o próprio app não são incluídos.
          </Text>
        </ScrollView>
      ) : currentPage === 'recently-deleted' ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, lineHeight: 18 }]}>
            Os conteúdos são removidos definitivamente após 30 dias. Os arquivos continuam ocupando espaço até serem apagados.
          </Text>
          {recentlyDeleted.operationError ? (
            <Text accessibilityRole="alert" style={[theme.typography.caption, { color: theme.colors.danger }]}>
              {recentlyDeleted.operationError}
            </Text>
          ) : null}
          {recentlyDeleted.operationMessage ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
              {recentlyDeleted.operationMessage}
            </Text>
          ) : null}
          {recentlyDeleted.isLoading && recentlyDeleted.items.length === 0 ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, paddingVertical: theme.spacing.md }]}>Carregando…</Text>
          ) : recentlyDeleted.loadFailed ? (
            <Pressable accessibilityRole="button" onPress={() => void recentlyDeleted.refresh()} style={{ minHeight: 48, justifyContent: 'center' }}>
              <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Tentar novamente</Text>
            </Pressable>
          ) : recentlyDeleted.items.length === 0 ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, paddingVertical: theme.spacing.md }]}>Nada apagado recentemente</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityLabel="Restaurar tudo"
                  accessibilityRole="button"
                  disabled={recentlyDeleted.isLoading || recentlyDeleted.isBulkOperationPending}
                  onPress={() => void recentlyDeleted.restoreAll()}
                  style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flex: 1, flexDirection: 'row', gap: theme.spacing.xs, justifyContent: 'center', minHeight: 48, opacity: recentlyDeleted.isLoading || recentlyDeleted.isBulkOperationPending ? 0.55 : 1, paddingHorizontal: theme.spacing.sm }}
                >
                  <Ionicons color={theme.colors.primary} name="arrow-undo-outline" size={18} />
                  <Text style={[theme.typography.caption, { color: theme.colors.primary }]}>Restaurar tudo</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Apagar tudo definitivamente"
                  accessibilityRole="button"
                  disabled={recentlyDeleted.isLoading || recentlyDeleted.isBulkOperationPending}
                  onPress={() => Alert.alert(
                    'Apagar tudo?',
                    `Os ${recentlyDeleted.items.length} conteúdos serão removidos do SaveApp e não poderão ser restaurados.`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Apagar tudo',
                        style: 'destructive',
                        onPress: () => void recentlyDeleted.permanentlyDeleteAll(),
                      },
                    ],
                    { cancelable: true },
                  )}
                  style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flex: 1, flexDirection: 'row', gap: theme.spacing.xs, justifyContent: 'center', minHeight: 48, opacity: recentlyDeleted.isLoading || recentlyDeleted.isBulkOperationPending ? 0.55 : 1, paddingHorizontal: theme.spacing.sm }}
                >
                  <Ionicons color={theme.colors.danger} name="trash-outline" size={18} />
                  <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>Apagar tudo</Text>
                </Pressable>
              </View>
              {recentlyDeleted.isBulkOperationPending ? (
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Processando…</Text>
              ) : null}
              {recentlyDeleted.items.map((item) => {
            const days = getRecentlyDeletedDaysRemaining(item.deletedAt);
            const title = item.requiresAuthorization ? 'Conteúdo protegido' : item.title ?? getRecentlyDeletedItemLabel(item.itemType);
            const icon = item.requiresAuthorization
              ? 'lock-closed-outline'
              : item.itemType === 'photo' ? 'image-outline'
                : item.itemType === 'video' ? 'videocam-outline'
                  : item.itemType === 'link' ? 'link-outline'
                    : item.itemType === 'text' ? 'document-text-outline'
                      : item.itemType === 'document' ? 'document-outline'
                        : 'checkbox-outline';
            const expirationLabel = days === 0
              ? 'Expira hoje'
              : `${days} ${days === 1 ? 'dia restante' : 'dias restantes'}`;
            const openActions = () => showRecentlyDeletedItemMenu(item, {
              onRestore: (selectedItem) => void recentlyDeleted.restore(selectedItem),
              onPermanentlyDelete: (selectedItem) => Alert.alert(
                'Apagar definitivamente?',
                'Este conteúdo será removido do SaveApp e não poderá ser restaurado.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Apagar definitivamente',
                    style: 'destructive',
                    onPress: () => void recentlyDeleted.permanentlyDelete(selectedItem),
                  },
                ],
                { cancelable: true },
              ),
            });
            return (
              <Pressable
                key={`${item.itemType}:${item.itemId}`}
                accessibilityActions={[{ name: 'longpress', label: 'Abrir ações' }]}
                accessibilityHint="Toque e segure para restaurar ou apagar definitivamente."
                accessibilityLabel={`Ações de ${title}, ${expirationLabel}`}
                accessibilityRole="button"
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'longpress') openActions();
                }}
                onLongPress={openActions}
                style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm, minHeight: 64, paddingVertical: theme.spacing.xs }}
              >
                <Ionicons color={theme.colors.primary} name={icon} size={20} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={[theme.typography.body, { color: theme.colors.textPrimary, flexShrink: 1 }]}>{title}</Text>
                  <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                    {expirationLabel}
                  </Text>
                </View>
              </Pressable>
            );
              })}
            </>
          )}
        </ScrollView>
      ) : currentPage === 'folders' ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.xs, padding: theme.spacing.md }}>
          {folders.length === 0 ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, paddingVertical: theme.spacing.md }]}>Nenhuma pasta criada</Text>
          ) : folders.map((folder) => (
            <View key={folder.id} style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', minHeight: 60, paddingHorizontal: theme.spacing.md }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={folder.isProtected ? `${folder.name}, protegida com Face ID` : folder.name}
                onPress={() => openFolderSettings(folder)}
                style={{ alignItems: 'center', flex: 1, flexDirection: 'row', gap: theme.spacing.sm, minHeight: 60 }}
              >
                <Ionicons color={getHomeFolderAccentColor(folder.color, accentColor, resolvedMode)} name="folder-outline" size={19} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{folder.name}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                    {folder.isProtected ? 'Protegida com Face ID' : `${folder.itemCount} ${folder.itemCount === 1 ? 'item' : 'itens'}`}
                  </Text>
                </View>
              </Pressable>
              {folder.isProtected ? (
                <Ionicons color={theme.colors.textSecondary} name="lock-closed-outline" size={16} />
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : currentPage === 'tags' ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.xs, padding: theme.spacing.md }}>
          {savedTags.length === 0 ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, paddingVertical: theme.spacing.md }]}>Nenhuma etiqueta criada</Text>
          ) : savedTags.map((savedTag) => (
            <Pressable
              accessibilityRole="button"
              key={savedTag.id}
              onPress={() => startTagEditor(savedTag)}
              style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', gap: theme.spacing.sm, minHeight: 56, paddingHorizontal: theme.spacing.md }}
            >
              <View style={{ backgroundColor: getAccentColorSwatch(savedTag.color, resolvedMode), borderRadius: 6, height: 12, width: 12 }} />
              <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>{savedTag.name}</Text>
              <Ionicons color={theme.colors.textTertiary} name="chevron-forward" size={16} />
            </Pressable>
          ))}
        </ScrollView>
      ) : currentPage === 'tag-settings' ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, padding: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>NOME</Text>
            <TextInput
              autoFocus={!selectedTag}
              maxLength={40}
              onChangeText={setTagDraftName}
              placeholder="Nome da etiqueta"
              placeholderTextColor={theme.colors.textTertiary}
              style={textInputStyle}
              value={tagDraftName}
            />
          </View>
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>COR DA ETIQUETA</Text>
            <View style={{ alignItems: 'flex-start', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, gap: theme.spacing.sm, padding: theme.spacing.md }}>
              {getAccentColorRows().map((row, rowIndex) => (
                <View key={`tag-color-row-${rowIndex}`} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {row.map(({ id, label }) => {
                    const selected = tagDraftColor === id;
                    return (
                      <Pressable
                        accessibilityLabel={`Cor ${label}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        disabled={isOperationPending}
                        key={id}
                        onPress={() => setTagDraftColor(id)}
                        style={{ alignItems: 'center', borderColor: selected ? getAccentColorTokens(id, resolvedMode).primary : 'transparent', borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', width: 44 }}
                      >
                        <View style={{ alignItems: 'center', backgroundColor: getAccentColorSwatch(id, resolvedMode), borderRadius: 14, height: 28, justifyContent: 'center', width: 28 }}>
                          {selected ? <Ionicons color={getAccentColorSwatchForeground(id, resolvedMode)} name="checkmark" size={16} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isOperationPending}
            onPress={() => void saveTag()}
            style={{ alignItems: 'flex-end', minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}
          >
            <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Salvar</Text>
          </Pressable>
          {selectedTag ? (
            <Pressable
              accessibilityRole="button"
              disabled={isOperationPending}
              onPress={() => requestDeleteTag(selectedTag)}
              style={{ alignItems: 'center', minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}
            >
              <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Excluir etiqueta</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : currentPage === 'folder-settings' && selectedFolder ? (
        <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, padding: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>NOME</Text>
            <TextInput
              maxLength={40}
              onChangeText={setDraftName}
              placeholder="Nome da pasta"
              placeholderTextColor={theme.colors.textTertiary}
              style={textInputStyle}
              value={draftName}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isOperationPending}
              onPress={() => void saveFolderName()}
              style={{ alignItems: 'flex-end', minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}
            >
              <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Salvar</Text>
            </Pressable>
          </View>
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>COR DA PASTA</Text>
            <View style={{ alignItems: 'flex-start', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, gap: theme.spacing.sm, padding: theme.spacing.md }}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedFolder.color === null }}
                disabled={isOperationPending}
                onPress={() => void saveFolderColor(null)}
                style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum }}
              >
                <View style={{ alignItems: 'center', borderColor: selectedFolder.color === null ? theme.colors.primary : theme.colors.borderStrong, borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', width: 44 }}>
                  <View style={{ alignItems: 'center', backgroundColor: getAccentColorSwatch(accentColor, resolvedMode), borderRadius: 14, height: 28, justifyContent: 'center', width: 28 }}>
                    {selectedFolder.color === null ? <Ionicons color={getAccentColorSwatchForeground(accentColor, resolvedMode)} name="checkmark" size={16} /> : null}
                  </View>
                </View>
                <View>
                  <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Padrão</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Acompanha a cor do aplicativo</Text>
                </View>
              </Pressable>
              {getAccentColorRows().map((row, rowIndex) => (
                <View key={`folder-accent-row-${rowIndex}`} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {row.map(({ id, label }) => {
                    const selected = selectedFolder.color === id;
                    return (
                      <Pressable
                        accessibilityLabel={`Cor da pasta ${label}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        disabled={isOperationPending}
                        key={id}
                        onPress={() => void saveFolderColor(id)}
                        style={{ alignItems: 'center', borderColor: selected ? getAccentColorTokens(id, resolvedMode).primary : 'transparent', borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', width: 44 }}
                      >
                        <View style={{ alignItems: 'center', backgroundColor: getAccentColorSwatch(id, resolvedMode), borderRadius: 14, height: 28, justifyContent: 'center', width: 28 }}>
                          {selected ? <Ionicons color={getAccentColorSwatchForeground(id, resolvedMode)} name="checkmark" size={16} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <View style={{ gap: theme.spacing.xs }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>PRIVACIDADE</Text>
            <View style={{ alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, flexDirection: 'row', minHeight: 56, paddingHorizontal: theme.spacing.md }}>
              <Ionicons color={theme.colors.textSecondary} name="lock-closed-outline" size={18} />
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1, marginLeft: theme.spacing.sm }]}>Proteger com Face ID</Text>
              <Switch
                disabled={isOperationPending}
                onValueChange={() => void toggleProtection(selectedFolder)}
                thumbColor={theme.colors.surface}
                trackColor={{ false: theme.colors.separator, true: theme.colors.info }}
                value={selectedFolder.isProtected}
              />
            </View>
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Exigir autenticação para acessar os conteúdos desta pasta.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isOperationPending}
            onPress={() => void requestDelete(selectedFolder)}
            style={{ alignItems: 'center', minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}
          >
            <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Excluir pasta</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: 'center' }]}>Esta pasta não está mais disponível.</Text>
        </View>
      )}

      <Modal animationType="slide" onRequestClose={() => setIsCreateEditorVisible(false)} transparent visible={isCreateEditorVisible}>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.24)', flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, gap: theme.spacing.md, padding: theme.spacing.lg }}>
            <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Nova pasta</Text>
            <TextInput
              autoFocus
              maxLength={40}
              onChangeText={setDraftName}
              onSubmitEditing={() => void saveFolder()}
              placeholder="Nome da pasta"
              placeholderTextColor={theme.colors.textTertiary}
              returnKeyType="done"
              style={textInputStyle}
              value={draftName}
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Pressable onPress={() => setIsCreateEditorVisible(false)} style={{ alignItems: 'center', flex: 1, minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}>
                <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={() => void saveFolder()} style={{ alignItems: 'center', flex: 1, minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}>
                <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
