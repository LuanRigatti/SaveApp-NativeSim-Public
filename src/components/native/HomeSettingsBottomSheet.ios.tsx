import {
  BottomSheet,
  Button,
  Circle,
  Alert as SwiftUIAlert,
  ContextMenu,
  Form,
  Group,
  HStack,
  Host,
  Image,
  List,
  NavigationDestination,
  NavigationLink,
  NavigationStack,
  Picker,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  Toolbar,
  VStack,
  ZStack,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityHint,
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  disabled,
  foregroundStyle,
  frame,
  font,
  labelStyle,
  lineLimit,
  presentationDetents,
  presentationDragIndicator,
  navigationTitle,
  navigationBarTitleDisplayMode,
  padding,
  pickerStyle,
  tag,
  tint,
  textFieldStyle,
} from '@expo/ui/swift-ui/modifiers';
import { Alert } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { getFolderAuthenticationFailureMessage } from '@/features/home-folders/folderFaceIdAuthentication';
import { getHomeFolderNameErrorMessage } from '@/features/home-folders/homeFolderTypes';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import type { HomeFolder } from '@/features/home-folders/homeFolderTypes';
import {
  createSavedTag,
  deleteSavedTag,
  listSavedTags,
  updateSavedTag,
} from '@/features/home-tags/tagLibrary';
import { getSavedTagNameErrorMessage, type SavedTag } from '@/features/home-tags/tagTypes';
import {
  getAccentColorRows,
  getAccentColorSwatch,
  getAccentColorSwatchForeground,
  useAppTheme,
} from '@/theme';
import type { AccentColorName } from '@/theme';
import { getAccentColorTokens } from '@/theme/colors';
import { useSaveLinkDynamicIsland } from '@/features/dynamic-island/SaveLinkDynamicIslandProvider';
import { createLiveActivityFailureAlert } from '@/features/dynamic-island/liveActivityFailureAlert';
import { formatStorageBytes } from '@/features/storage/storageUsage';
import { useStorageUsage } from '@/features/storage/useStorageUsage';
import {
  getRecentlyDeletedDaysRemaining,
  type RecentlyDeletedItem,
} from '@/features/home-trash/trashLibrary';
import { getRecentlyDeletedItemLabel, useRecentlyDeletedItems } from '@/features/home-trash/useRecentlyDeletedItems';

type HomeSettingsBottomSheetProps = {
  initialPage: 'root' | 'folders' | 'tags';
  isPresented: boolean;
  onDismiss: () => void;
  onIsPresentedChange: (isPresented: boolean) => void;
  onSavedTagsChanged: () => void;
};

type FolderFormDraft = {
  initialName: string;
  session: number;
};

type TagFormDraft = {
  tag: SavedTag | null;
  session: number;
};

const FOLDER_SETTINGS_ROUTE_PREFIX = 'settings-folder:';
const SAVED_TAG_SETTINGS_ROUTE_PREFIX = 'settings-tag:';

function getFolderSettingsRouteValue(folderId: string) {
  return `${FOLDER_SETTINGS_ROUTE_PREFIX}${folderId}`;
}

function getFolderIdFromSettingsRouteValue(value: string) {
  return value.startsWith(FOLDER_SETTINGS_ROUTE_PREFIX)
    ? value.slice(FOLDER_SETTINGS_ROUTE_PREFIX.length)
    : null;
}

function getSavedTagSettingsRouteValue(tagId: string) {
  return `${SAVED_TAG_SETTINGS_ROUTE_PREFIX}${tagId}`;
}

function getSavedTagIdFromSettingsRouteValue(value: string) {
  return value.startsWith(SAVED_TAG_SETTINGS_ROUTE_PREFIX)
    ? value.slice(SAVED_TAG_SETTINGS_ROUTE_PREFIX.length)
    : null;
}

function showFolderFailure(error: unknown) {
  Alert.alert('Não foi possível salvar a pasta', getHomeFolderNameErrorMessage(error));
}

function showSavedTagFailure(error: unknown) {
  Alert.alert('Não foi possível salvar a etiqueta', getSavedTagNameErrorMessage(error));
}

function SavedTagListPage({ tags, onCreate }: {
  tags: readonly SavedTag[];
  onCreate: () => void;
}) {
  const { resolvedMode, theme } = useAppTheme();

  return (
    <Toolbar>
      <List modifiers={[navigationTitle('Etiquetas'), navigationBarTitleDisplayMode('inline')] }>
        <Section>
          {tags.length === 0 ? (
            <Text modifiers={[foregroundStyle(theme.colors.textSecondary), padding({ vertical: theme.spacing.xs })]}>
              Nenhuma etiqueta criada
            </Text>
          ) : tags.map((savedTag) => (
            <NavigationLink key={savedTag.id} value={getSavedTagSettingsRouteValue(savedTag.id)}>
              <HStack alignment="center" spacing={theme.spacing.sm}>
                <Circle modifiers={[frame({ width: 12, height: 12 }), foregroundStyle(getAccentColorSwatch(savedTag.color, resolvedMode))]} />
                <Text modifiers={[foregroundStyle(theme.colors.textPrimary), lineLimit(1)]}>{savedTag.name}</Text>
                <Spacer />
              </HStack>
            </NavigationLink>
          ))}
        </Section>
      </List>
      <Toolbar.Content>
        <Button
          label="Criar etiqueta"
          onPress={onCreate}
          modifiers={[labelStyle('iconOnly'), accessibilityLabel('Criar etiqueta')]}
          systemImage="plus"
        />
      </Toolbar.Content>
    </Toolbar>
  );
}

function SavedTagFormPage({ draft, onCancel, onSave, onDelete }: {
  draft: TagFormDraft;
  onCancel: () => void;
  onSave: (name: string, color: AccentColorName) => Promise<void>;
  onDelete: (tag: SavedTag) => Promise<void>;
}) {
  const nameState = useNativeState(draft.tag?.name ?? '');
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const initialColor: AccentColorName = draft.tag?.color ?? accentColor;
  const [selectedColor, setSelectedColor] = useState<AccentColorName>(initialColor);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    nameState.set(draft.tag?.name ?? '');
  }, [draft.session, draft.tag?.name, nameState]);

  const save = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await onSave(nameState.get(), selectedColor);
    } finally {
      setIsBusy(false);
    }
  };

  const requestDelete = () => {
    if (!draft.tag || isBusy) return;
    Alert.alert(
      `Excluir “${draft.tag.name}”?`,
      'A etiqueta será removida dos conteúdos associados. Os conteúdos salvos não serão excluídos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir etiqueta',
          style: 'destructive',
          onPress: () => {
            setIsBusy(true);
            void onDelete(draft.tag!).finally(() => setIsBusy(false));
          },
        },
      ],
    );
  };

  return (
    <Toolbar>
      <Form modifiers={[navigationTitle(draft.tag ? 'Editar etiqueta' : 'Nova etiqueta'), navigationBarTitleDisplayMode('inline'), tint(theme.colors.primary)]}>
        <Section title="Nome">
          <TextField
            autoFocus={!draft.tag}
            maxLength={40}
            onTextChange={(value) => nameState.set(value)}
            placeholder="Nome da etiqueta"
            text={nameState}
            modifiers={[textFieldStyle('plain'), accessibilityLabel('Nome da etiqueta')]}
          />
        </Section>
        <Section title="Cor da etiqueta">
          <VStack alignment="leading" spacing={8}>
            {getAccentColorRows().map((row, rowIndex) => (
              <HStack alignment="center" key={`tag-color-row-${rowIndex}`} spacing={12}>
                {row.map(({ id, label }) => {
                  const isSelected = selectedColor === id;
                  return (
                    <Button
                      key={id}
                      modifiers={[
                        buttonStyle('plain'),
                        frame({ width: 44, height: 44 }),
                        accessibilityLabel(`Cor ${label}`),
                        accessibilityValue(isSelected ? 'Selecionada' : 'Não selecionada'),
                        disabled(isBusy),
                      ]}
                      onPress={() => setSelectedColor(id)}
                    >
                      <ZStack alignment="center" modifiers={[frame({ width: 44, height: 44 })]}>
                        <Circle modifiers={[frame({ width: 36, height: 36 }), foregroundStyle(isSelected ? theme.colors.primary : theme.colors.borderStrong)]} />
                        <Circle modifiers={[frame({ width: 28, height: 28 }), foregroundStyle(getAccentColorSwatch(id, resolvedMode))]} />
                        {isSelected ? <Image color={getAccentColorSwatchForeground(id, resolvedMode)} size={14} systemName="checkmark" /> : null}
                      </ZStack>
                    </Button>
                  );
                })}
              </HStack>
            ))}
          </VStack>
        </Section>
        {draft.tag ? (
          <Section>
            <Button label="Excluir etiqueta" onPress={requestDelete} role="destructive" modifiers={[disabled(isBusy)]} />
          </Section>
        ) : null}
      </Form>
      <Toolbar.Content>
        <Button label="Cancelar" onPress={onCancel} role="cancel" modifiers={[disabled(isBusy)]} />
        <Button label="Salvar" onPress={() => void save()} modifiers={[disabled(isBusy)]} />
      </Toolbar.Content>
    </Toolbar>
  );
}

function FolderNamePage({ draft, onCancel, onSave }: {
  draft: FolderFormDraft;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const nameState = useNativeState(draft.initialName);
  const { theme } = useAppTheme();

  return (
    <Toolbar>
      <List
        modifiers={[
          navigationTitle('Nova pasta'),
          navigationBarTitleDisplayMode('inline'),
        ]}
      >
        <Section>
          <TextField
            autoFocus
            maxLength={40}
            onTextChange={(value) => nameState.set(value)}
            placeholder="Nome da pasta"
            text={nameState}
            modifiers={[textFieldStyle('plain'), accessibilityLabel('Nome da pasta')]}
          />
          <Text
            modifiers={[
              font({ textStyle: 'footnote' }),
              foregroundStyle(theme.colors.textSecondary),
              lineLimit(2),
            ]}
          >
            As pastas organizam os itens salvos sem mover seus arquivos.
          </Text>
        </Section>
      </List>
      <Toolbar.Content>
        <Button label="Cancelar" onPress={onCancel} role="cancel" />
        <Button label="Salvar" onPress={() => onSave(nameState.get())} />
      </Toolbar.Content>
    </Toolbar>
  );
}

function AppearanceSettingsPage() {
  const {
    accentColor,
    appearanceMode,
    resolvedMode,
    setAccentColor,
    setAppearanceMode,
    theme,
  } = useAppTheme();
  const swatchRows = getAccentColorRows();

  return (
    <Toolbar>
      <Form
        modifiers={[
          navigationTitle('Aparência'),
          navigationBarTitleDisplayMode('inline'),
          tint(theme.colors.primary),
        ]}
      >
        <Section title="Tema">
          <Picker
            label="Tema"
            modifiers={[pickerStyle('segmented')]}
            onSelectionChange={(mode) => {
              if (mode === 'system' || mode === 'light' || mode === 'dark') setAppearanceMode(mode);
            }}
            selection={appearanceMode}
          >
            <Text modifiers={[tag('system')]}>Sistema</Text>
            <Text modifiers={[tag('light')]}>Claro</Text>
            <Text modifiers={[tag('dark')]}>Escuro</Text>
          </Picker>
        </Section>
        <Section
          footer={(
            <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
              A cor de destaque aparece em ações e seleções. Fundos, conteúdos e materiais do sistema mantêm suas cores.
            </Text>
          )}
          title="Cor do aplicativo"
        >
          <VStack alignment="leading" spacing={8}>
            {swatchRows.map((row, rowIndex) => (
              <HStack alignment="center" key={`accent-row-${rowIndex}`} spacing={12}>
                {row.map(({ id, label }) => {
                  const isSelected = accentColor === id;
                  return (
                    <Button
                      key={id}
                      modifiers={[
                        buttonStyle('plain'),
                        frame({ width: 44, height: 44 }),
                        accessibilityLabel(`Cor ${label}`),
                        accessibilityValue(isSelected ? 'Selecionada' : 'Não selecionada'),
                      ]}
                      onPress={() => setAccentColor(id)}
                    >
                      <ZStack alignment="center" modifiers={[frame({ width: 44, height: 44 })]}>
                        <Circle
                          modifiers={[
                            frame({ width: 36, height: 36 }),
                            foregroundStyle(isSelected ? theme.colors.primary : theme.colors.borderStrong),
                          ]}
                        />
                        <Circle
                          modifiers={[
                            frame({ width: 28, height: 28 }),
                            foregroundStyle(getAccentColorSwatch(id, resolvedMode)),
                          ]}
                        />
                        {isSelected ? <Image color={getAccentColorSwatchForeground(id, resolvedMode)} size={14} systemName="checkmark" /> : null}
                      </ZStack>
                    </Button>
                  );
                })}
              </HStack>
            ))}
          </VStack>
          <Button
            label="Restaurar cor padrão"
            modifiers={[disabled(accentColor === 'black')]}
            onPress={() => setAccentColor('black')}
          />
        </Section>
      </Form>
    </Toolbar>
  );
}

function StorageUsagePage({ isActive }: { isActive: boolean }) {
  const { hasError, isLoading, snapshot } = useStorageUsage(isActive);
  const { theme } = useAppTheme();
  const rows = [
    { icon: 'internaldrive', label: 'Total do SaveApp', value: snapshot?.total ?? null },
    { icon: 'photo', label: 'Fotos', value: snapshot?.photos ?? null },
    { icon: 'video', label: 'Vídeos', value: snapshot?.videos ?? null },
    { icon: 'doc', label: 'Documentos', value: snapshot?.documents ?? null },
    { icon: 'externaldrive', label: 'Outros dados', value: snapshot?.other ?? null },
  ] as const;

  const valueLabel = (value: number | null) => {
    if (value !== null) return formatStorageBytes(value);
    if (isLoading) return 'Calculando…';
    return hasError ? 'Erro na medição' : 'Não foi possível medir';
  };

  return (
    <Toolbar>
      <List modifiers={[navigationTitle('Armazenamento'), navigationBarTitleDisplayMode('inline')]}>
        <Section
          footer={(
            <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
              Soma o tamanho lógico dos arquivos acessíveis em Documentos e Cache, incluindo o banco SQLite, miniaturas e prévias. Arquivos em Apagados recentemente continuam contando até a exclusão definitiva. Preferências do sistema, arquivos temporários fora dessas pastas e o próprio app não são incluídos.
            </Text>
          )}
          title="Uso local"
        >
          {rows.map(({ icon, label, value }) => (
            <HStack alignment="center" key={label} spacing={12}>
              <Image color={theme.colors.primary} size={18} systemName={icon} />
              <Text>{label}</Text>
              <Spacer />
              <Text modifiers={[font({ textStyle: label === 'Total do SaveApp' ? 'body' : 'callout' }), foregroundStyle(theme.colors.textSecondary)]}>
                {valueLabel(value)}
              </Text>
            </HStack>
          ))}
        </Section>
      </List>
    </Toolbar>
  );
}

function RecentlyDeletedPage({ isActive }: { isActive: boolean }) {
  const { theme } = useAppTheme();
  const { items, isLoading, loadFailed, operationError, refresh, restore, permanentlyDelete } = useRecentlyDeletedItems(isActive);
  const [pendingDeletion, setPendingDeletion] = useState<RecentlyDeletedItem | null>(null);

  return (
    <Toolbar>
      <SwiftUIAlert
        isPresented={pendingDeletion !== null}
        onIsPresentedChange={(isPresented) => {
          if (!isPresented) setPendingDeletion(null);
        }}
        title="Apagar item?"
      >
        <SwiftUIAlert.Trigger>
          <List modifiers={[navigationTitle('Apagados recentemente'), navigationBarTitleDisplayMode('inline')]}>
            <Section
              footer={(
                <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                  Os conteúdos são removidos definitivamente após 30 dias. Os arquivos continuam ocupando espaço até serem apagados.
                </Text>
              )}
            >
              {operationError ? (
                <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.danger)]}>
                  {operationError}
                </Text>
              ) : null}
              {isLoading && items.length === 0 ? (
                <Text modifiers={[foregroundStyle(theme.colors.textSecondary)]}>Carregando…</Text>
              ) : loadFailed ? (
                <Button label="Tentar novamente" onPress={() => void refresh()} />
              ) : items.length === 0 ? (
                <Text modifiers={[foregroundStyle(theme.colors.textSecondary)]}>Nada apagado recentemente</Text>
              ) : items.map((item) => {
                const days = getRecentlyDeletedDaysRemaining(item.deletedAt);
                const title = item.requiresAuthorization
                  ? 'Conteúdo protegido'
                  : item.title ?? getRecentlyDeletedItemLabel(item.itemType);
                const icon = item.requiresAuthorization
                  ? 'lock.fill'
                  : item.itemType === 'photo' ? 'photo'
                    : item.itemType === 'video' ? 'video'
                      : item.itemType === 'link' ? 'link'
                        : item.itemType === 'text' ? 'text.alignleft'
                          : item.itemType === 'document' ? 'doc'
                            : 'checklist';
                const expirationLabel = days === 0
                  ? 'Expira hoje'
                  : `${days} ${days === 1 ? 'dia restante' : 'dias restantes'}`;

                return (
                  <ContextMenu key={`${item.itemType}:${item.itemId}`}>
                    <ContextMenu.Items>
                      <Button label="Restaurar" onPress={() => void restore(item)} systemImage="arrow.uturn.backward" />
                      <Button
                        label="Apagar definitivamente"
                        onPress={() => setPendingDeletion(item)}
                        role="destructive"
                        systemImage="trash"
                      />
                    </ContextMenu.Items>
                    <ContextMenu.Trigger>
                      <HStack
                        alignment="center"
                        modifiers={[
                          accessibilityElement('combine'),
                          accessibilityLabel(`${title}, ${expirationLabel}`),
                          accessibilityHint('Toque e segure para restaurar ou apagar definitivamente.'),
                        ]}
                        spacing={theme.spacing.sm}
                      >
                        <Image color={theme.colors.primary} size={20} systemName={icon} />
                        <VStack alignment="leading" spacing={2}>
                          <Text modifiers={[foregroundStyle(theme.colors.textPrimary), lineLimit(2)]}>{title}</Text>
                          <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                            {expirationLabel}
                          </Text>
                        </VStack>
                        <Spacer />
                      </HStack>
                    </ContextMenu.Trigger>
                  </ContextMenu>
                );
              })}
            </Section>
          </List>
        </SwiftUIAlert.Trigger>
        <SwiftUIAlert.Message>
          <Text>Este conteúdo será removido do SaveApp e não poderá ser restaurado.</Text>
        </SwiftUIAlert.Message>
        <SwiftUIAlert.Actions>
          <Button
            label="Cancelar"
            onPress={() => setPendingDeletion(null)}
            role="cancel"
          />
          <Button
            label="Apagar"
            onPress={() => {
              const item = pendingDeletion;
              setPendingDeletion(null);
              if (item) void permanentlyDelete(item);
            }}
            role="destructive"
          />
        </SwiftUIAlert.Actions>
      </SwiftUIAlert>
    </Toolbar>
  );
}

function FolderListPage({ folders, onCreate }: {
  folders: readonly HomeFolder[];
  onCreate: () => void;
}) {
  const { accentColor, resolvedMode, theme } = useAppTheme();

  return (
    <Toolbar>
      <List modifiers={[navigationTitle('Pastas'), navigationBarTitleDisplayMode('inline')] }>
        <Section>
          {folders.length === 0 ? (
            <Text modifiers={[foregroundStyle(theme.colors.textSecondary), padding({ vertical: theme.spacing.xs })]}>
              Nenhuma pasta criada
            </Text>
          ) : (
            folders.map((folder) => (
              <NavigationLink key={folder.id} value={getFolderSettingsRouteValue(folder.id)}>
                <HStack alignment="center" spacing={theme.spacing.sm}>
                  <Image color={getHomeFolderAccentColor(folder.color, accentColor, resolvedMode)} size={18} systemName="folder" />
                  <VStack alignment="leading" spacing={2}>
                    <Text modifiers={[foregroundStyle(theme.colors.textPrimary), lineLimit(1)]}>
                      {folder.name}
                    </Text>
                    <Text modifiers={[foregroundStyle(theme.colors.textSecondary), font({ textStyle: 'footnote' })]}>
                      {folder.isProtected
                        ? 'Protegida com Face ID'
                        : `${folder.itemCount} ${folder.itemCount === 1 ? 'item' : 'itens'}`}
                    </Text>
                  </VStack>
                  {folder.isProtected ? (
                    <Image color={theme.colors.textSecondary} size={15} systemName="lock" />
                  ) : null}
                  <Spacer />
                </HStack>
              </NavigationLink>
            ))
          )}
        </Section>
      </List>
      <Toolbar.Content>
        <Button
          label="Criar pasta"
          onPress={onCreate}
          modifiers={[labelStyle('iconOnly'), accessibilityLabel('Criar pasta')]}
          systemImage="plus"
        />
      </Toolbar.Content>
    </Toolbar>
  );
}

function FolderSettingsPage({
  folder,
  onRename,
  onSetColor,
  onToggleProtection,
  onDelete,
}: {
  folder: HomeFolder | null;
  onRename: (folderId: string, name: string) => Promise<HomeFolder>;
  onSetColor: (folderId: string, color: AccentColorName | null) => Promise<boolean>;
  onToggleProtection: (folder: HomeFolder, nextIsProtected: boolean) => Promise<void>;
  onDelete: (folder: HomeFolder) => Promise<boolean>;
}) {
  const nameState = useNativeState(folder?.name ?? '');
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const [pendingOperation, setPendingOperation] = useState<'rename' | 'color' | 'protection' | 'delete' | null>(null);
  const pendingOperationRef = useRef(false);
  const isBusy = pendingOperation !== null;

  useEffect(() => {
    nameState.set(folder?.name ?? '');
  }, [folder?.id, folder?.name, nameState]);

  if (!folder) {
    return (
      <List modifiers={[navigationTitle('Pasta indisponível'), navigationBarTitleDisplayMode('inline')]}>
        <Section>
          <Text modifiers={[foregroundStyle(theme.colors.textSecondary)]}>
            Esta pasta não está mais disponível.
          </Text>
        </Section>
      </List>
    );
  }

  const saveName = async () => {
    if (pendingOperationRef.current) return;
    const nextName = nameState.get();
    const normalizedDisplayName = nextName.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (normalizedDisplayName === folder.name) {
      nameState.set(folder.name);
      return;
    }

    pendingOperationRef.current = true;
    setPendingOperation('rename');
    try {
      const updated = await onRename(folder.id, nextName);
      nameState.set(updated.name);
    } catch (error) {
      showFolderFailure(error);
    } finally {
      pendingOperationRef.current = false;
      setPendingOperation(null);
    }
  };

  const toggleProtection = async (nextIsProtected: boolean) => {
    if (pendingOperationRef.current) return;
    pendingOperationRef.current = true;
    setPendingOperation('protection');
    try {
      await onToggleProtection(folder, nextIsProtected);
    } finally {
      pendingOperationRef.current = false;
      setPendingOperation(null);
    }
  };

  const deleteFolder = async () => {
    if (pendingOperationRef.current) return;
    pendingOperationRef.current = true;
    setPendingOperation('delete');
    try {
      await onDelete(folder);
    } finally {
      pendingOperationRef.current = false;
      setPendingOperation(null);
    }
  };

  const changeColor = async (color: AccentColorName | null) => {
    if (pendingOperationRef.current || !folder) return;
    pendingOperationRef.current = true;
    setPendingOperation('color');
    try {
      if (!await onSetColor(folder.id, color)) {
        Alert.alert('Não foi possível alterar a cor', 'A cor anterior da pasta foi mantida.');
      }
    } catch {
      Alert.alert('Não foi possível alterar a cor', 'A cor anterior da pasta foi mantida.');
    } finally {
      pendingOperationRef.current = false;
      setPendingOperation(null);
    }
  };

  return (
    <Toolbar>
      <Form modifiers={[navigationTitle(folder.name), navigationBarTitleDisplayMode('inline')]}>
        <Section title="Nome">
          <TextField
            maxLength={40}
            placeholder="Nome da pasta"
            text={nameState}
            modifiers={[textFieldStyle('plain'), accessibilityLabel('Nome da pasta')]}
          />
        </Section>
        <Section title="Cor da pasta">
          <Button
            modifiers={[
              buttonStyle('plain'),
              accessibilityLabel('Cor padrão da pasta'),
              accessibilityValue(folder.color === null ? 'Selecionada. Acompanha a cor do aplicativo.' : 'Não selecionada'),
              disabled(isBusy),
            ]}
            onPress={() => void changeColor(null)}
          >
            <HStack alignment="center" spacing={theme.spacing.sm}>
              <ZStack alignment="center" modifiers={[frame({ width: 44, height: 44 })]}>
                <Circle modifiers={[frame({ width: 36, height: 36 }), foregroundStyle(folder.color === null ? theme.colors.primary : theme.colors.borderStrong)]} />
                <Circle modifiers={[frame({ width: 28, height: 28 }), foregroundStyle(getAccentColorSwatch(accentColor, resolvedMode))]} />
                {folder.color === null ? <Image color={getAccentColorSwatchForeground(accentColor, resolvedMode)} size={14} systemName="checkmark" /> : null}
              </ZStack>
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[foregroundStyle(theme.colors.textPrimary)]}>Padrão</Text>
                <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                  Acompanha a cor do aplicativo
                </Text>
              </VStack>
              <Spacer />
            </HStack>
          </Button>
          <VStack alignment="leading" spacing={8}>
            {getAccentColorRows().map((row, rowIndex) => (
              <HStack alignment="center" key={`folder-accent-row-${rowIndex}`} spacing={12}>
                {row.map(({ id, label }) => {
                  const isSelected = folder.color === id;
                  return (
                    <Button
                      key={id}
                      modifiers={[
                        buttonStyle('plain'),
                        frame({ width: 44, height: 44 }),
                        accessibilityLabel(`Cor da pasta ${label}`),
                        accessibilityValue(isSelected ? 'Selecionada' : 'Não selecionada'),
                        disabled(isBusy),
                      ]}
                      onPress={() => void changeColor(id)}
                    >
                      <ZStack alignment="center" modifiers={[frame({ width: 44, height: 44 })]}>
                        <Circle modifiers={[
                          frame({ width: 36, height: 36 }),
                          foregroundStyle(isSelected ? getAccentColorTokens(id, resolvedMode).primary : theme.colors.borderStrong),
                        ]} />
                        <Circle modifiers={[frame({ width: 28, height: 28 }), foregroundStyle(getAccentColorSwatch(id, resolvedMode))]} />
                        {isSelected ? <Image color={getAccentColorSwatchForeground(id, resolvedMode)} size={14} systemName="checkmark" /> : null}
                      </ZStack>
                    </Button>
                  );
                })}
              </HStack>
            ))}
          </VStack>
        </Section>
        <Section
          title="Privacidade"
          footer={(
            <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
              Exigir autenticação para acessar os conteúdos desta pasta.
            </Text>
          )}
        >
          <Toggle
            isOn={folder.isProtected}
            label="Proteger com Face ID"
            onIsOnChange={(nextValue) => void toggleProtection(nextValue)}
            systemImage="lock"
            modifiers={[disabled(isBusy)]}
          />
        </Section>
        <Section>
          <Button
            label="Excluir pasta"
            onPress={() => void deleteFolder()}
            role="destructive"
            modifiers={[disabled(isBusy)]}
          />
        </Section>
      </Form>
      <Toolbar.Content>
        <Button
          label="Salvar"
          onPress={() => void saveName()}
          modifiers={[disabled(isBusy)]}
        />
      </Toolbar.Content>
    </Toolbar>
  );
}

export default function HomeSettingsBottomSheet({
  initialPage,
  isPresented,
  onDismiss,
  onIsPresentedChange,
  onSavedTagsChanged,
}: HomeSettingsBottomSheetProps) {
  const {
    authorizeFolder,
    createFolder,
    deleteFolder,
    folders,
    renameFolder,
    setFolderColor,
    setFolderProtection,
  } = useLocalHomeFolders();
  const { resolvedMode, theme } = useAppTheme();
  const {
    isEnabled: isSaveLinkModeEnabled,
    isReady: isSaveLinkModeReady,
    isAvailable: isSaveLinkModeAvailable,
    isBusy: isSaveLinkModeBusy,
    setEnabled: setSaveLinkModeEnabled,
  } = useSaveLinkDynamicIsland();
  const [path, setPath] = useState<string[]>([]);
  const [savedTags, setSavedTags] = useState<SavedTag[]>([]);
  const [formDraft, setFormDraft] = useState<FolderFormDraft>({
    initialName: '',
    session: 0,
  });
  const [tagFormDraft, setTagFormDraft] = useState<TagFormDraft>({ tag: null, session: 0 });
  const wasPresentedRef = useRef(false);

  useEffect(() => {
    if (!isPresented) return;
    let cancelled = false;
    void listSavedTags().then((nextTags) => {
      if (!cancelled) setSavedTags(nextTags);
    }).catch(() => {
      if (!cancelled) Alert.alert('Não foi possível carregar as etiquetas', 'Tente novamente.');
    });
    return () => { cancelled = true; };
  }, [isPresented]);

  const dismiss = () => {
    wasPresentedRef.current = false;
    setPath([]);
    onDismiss();
  };

  const updatePresentation = (nextIsPresented: boolean) => {
    if (nextIsPresented && !wasPresentedRef.current) {
      setPath(initialPage === 'folders' ? ['folders'] : initialPage === 'tags' ? ['tags'] : []);
    }
    if (!nextIsPresented) setPath([]);
    wasPresentedRef.current = nextIsPresented;
    onIsPresentedChange(nextIsPresented);
  };

  const startFolderForm = () => {
    setFormDraft((current) => ({
      initialName: '',
      session: current.session + 1,
    }));
    setPath((current) => [...current, 'folder-form']);
  };

  const saveFolder = async (name: string) => {
    try {
      await createFolder(name);
      setPath((current) => current.slice(0, -1));
    } catch (error) {
      showFolderFailure(error);
    }
  };

  const startTagForm = (savedTag: SavedTag | null = null) => {
    setTagFormDraft((current) => ({ tag: savedTag, session: current.session + 1 }));
    setPath((current) => [...current, 'tag-form']);
  };

  const saveTag = async (name: string, color: AccentColorName): Promise<void> => {
    try {
      if (tagFormDraft.tag) await updateSavedTag(tagFormDraft.tag.id, name, color);
      else await createSavedTag(name, color);
      setSavedTags(await listSavedTags());
      onSavedTagsChanged();
      setPath((current) => current.slice(0, -1));
    } catch (error) {
      showSavedTagFailure(error);
    }
  };

  const removeTag = async (savedTag: SavedTag) => {
    try {
      if (!await deleteSavedTag(savedTag.id)) throw new Error('SAVED_TAG_NOT_FOUND');
      setSavedTags((current) => current.filter((item) => item.id !== savedTag.id));
      onSavedTagsChanged();
      setPath((current) => current.slice(0, -1));
    } catch {
      Alert.alert('Não foi possível excluir a etiqueta', 'Os conteúdos salvos foram mantidos. Tente novamente.');
    }
  };

  const showAuthenticationResult = (outcome: 'unavailable' | 'failed') => {
    Alert.alert('Face ID indisponível', getFolderAuthenticationFailureMessage(outcome));
  };

  const toggleFolderProtection = async (folder: HomeFolder, nextIsProtected: boolean) => {
    try {
      const outcome = await setFolderProtection(folder.id, nextIsProtected);
      if (outcome === 'unavailable' || outcome === 'failed') showAuthenticationResult(outcome);
    } catch {
      Alert.alert('Não foi possível alterar a proteção', 'A pasta continua com a configuração anterior.');
    }
  };

  const confirmDeleteFolder = async (folder: HomeFolder): Promise<boolean> => {
    if (folder.isProtected) {
      const outcome = await authorizeFolder(folder.id);
      if (outcome !== 'authenticated') {
        if (outcome === 'unavailable' || outcome === 'failed') showAuthenticationResult(outcome);
        return false;
      }
    }

    const wasDeleted = await new Promise<boolean>((resolve) => {
      let didResolve = false;
      const finish = (result: boolean) => {
        if (didResolve) return;
        didResolve = true;
        resolve(result);
      };

      Alert.alert(
        `Excluir “${folder.name}”?`,
        folder.isProtected
          ? 'Os conteúdos continuarão salvos, ficarão sem pasta e voltarão a aparecer em Todos.'
          : 'Os conteúdos continuarão salvos e ficarão sem pasta.',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
          {
            text: 'Excluir pasta',
            style: 'destructive',
            onPress: () => {
              void deleteFolder(folder.id).then((deleted) => {
                if (!deleted) {
                  Alert.alert('Não foi possível excluir', 'A pasta permanece como está.');
                  finish(false);
                  return;
                }
                setPath((current) => current.at(-1) === getFolderSettingsRouteValue(folder.id)
                  ? current.slice(0, -1)
                  : current);
                finish(true);
              }).catch(() => {
                Alert.alert('Não foi possível excluir', 'Tente novamente. Os conteúdos continuam salvos.');
                finish(false);
              });
            },
          },
        ],
        { cancelable: true, onDismiss: () => finish(false) },
      );
    });

    return wasDeleted;
  };

  const renameFolderSettings = async (folderId: string, name: string) => {
    return renameFolder(folderId, name);
  };

  const updateFolderSettingsColor = async (folderId: string, color: AccentColorName | null) => {
    return setFolderColor(folderId, color);
  };

  const folderIdsForDestinations = useMemo(() => {
    const ids = new Set(folders.map((folder) => folder.id));
    for (const routeValue of path) {
      const folderId = getFolderIdFromSettingsRouteValue(routeValue);
      if (folderId) ids.add(folderId);
    }
    return [...ids];
  }, [folders, path]);
  const tagIdsForDestinations = useMemo(() => {
    const ids = new Set(savedTags.map((savedTag) => savedTag.id));
    for (const routeValue of path) {
      const tagId = getSavedTagIdFromSettingsRouteValue(routeValue);
      if (tagId) ids.add(tagId);
    }
    return [...ids];
  }, [path, savedTags]);

  return (
    <Host
      colorScheme={resolvedMode}
      pointerEvents="none"
      seedColor={theme.colors.primary}
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
    >
      <BottomSheet
        isPresented={isPresented}
        onDismiss={dismiss}
        onIsPresentedChange={updatePresentation}
      >
        <Group
          modifiers={[presentationDetents(['large']), presentationDragIndicator('visible')]}
        >
          <NavigationStack path={path} onPathChange={setPath}>
            <List modifiers={[navigationTitle('Configurações'), navigationBarTitleDisplayMode('inline')]}>
              <Section>
                <VStack alignment="leading" spacing={6}>
                  <HStack alignment="center">
                    <Text>Dynamic Island</Text>
                    <Spacer />
                    <Toggle
                      isOn={isSaveLinkModeEnabled}
                      onIsOnChange={(nextValue) => {
                        if (!isSaveLinkModeAvailable) return;
                        void setSaveLinkModeEnabled(nextValue).catch((error: unknown) => {
                          const failure = createLiveActivityFailureAlert(
                            error,
                            nextValue ? 'activate' : 'deactivate',
                          );
                          Alert.alert(failure.title, failure.message);
                        });
                      }}
                      modifiers={[
                        accessibilityLabel('Dynamic Island'),
                        accessibilityValue(
                          !isSaveLinkModeAvailable
                            ? 'Indisponível nesta versão do app'
                            : isSaveLinkModeEnabled ? 'Ativado' : 'Desativado',
                        ),
                        disabled(!isSaveLinkModeReady || !isSaveLinkModeAvailable || isSaveLinkModeBusy),
                      ]}
                    />
                  </HStack>
                  {isSaveLinkModeReady && !isSaveLinkModeAvailable ? (
                    <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                      Indisponível nesta versão. A preferência será mantida.
                    </Text>
                  ) : null}
                </VStack>
              </Section>
              <Section title="Personalização">
                <NavigationLink value="appearance">
                  <HStack alignment="center" spacing={theme.spacing.sm}>
                    <Image color={theme.colors.textSecondary} size={18} systemName="paintpalette" />
                    <VStack alignment="leading" spacing={2}>
                      <Text>Aparência</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                        Tema e cor de destaque
                      </Text>
                    </VStack>
                  </HStack>
                </NavigationLink>
              </Section>
              <Section title="Organização">
                <NavigationLink value="folders">
                  <HStack alignment="center" spacing={theme.spacing.sm}>
                    <Image color={theme.colors.primary} size={18} systemName="folder" />
                    <VStack alignment="leading" spacing={2}>
                      <Text>Pastas</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                        Criar e gerenciar pastas
                      </Text>
                    </VStack>
                  </HStack>
                </NavigationLink>
                <NavigationLink value="tags">
                  <HStack alignment="center" spacing={theme.spacing.sm}>
                    <Image color={theme.colors.primary} size={18} systemName="tag" />
                    <VStack alignment="leading" spacing={2}>
                      <Text>Etiquetas</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                        Identificar conteúdos por cor
                      </Text>
                    </VStack>
                  </HStack>
                </NavigationLink>
              </Section>
              <Section title="Dados">
                <NavigationLink value="storage">
                  <HStack alignment="center" spacing={theme.spacing.sm}>
                    <Image color={theme.colors.primary} size={18} systemName="internaldrive" />
                    <VStack alignment="leading" spacing={2}>
                      <Text>Armazenamento</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                        Ver uso local do SaveApp
                      </Text>
                    </VStack>
                  </HStack>
                </NavigationLink>
                <NavigationLink value="recently-deleted">
                  <HStack alignment="center" spacing={theme.spacing.sm}>
                    <Image color={theme.colors.primary} size={18} systemName="trash" />
                    <VStack alignment="leading" spacing={2}>
                      <Text>Apagados recentemente</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.colors.textSecondary)]}>
                        Restaurar ou apagar conteúdos
                      </Text>
                    </VStack>
                  </HStack>
                </NavigationLink>
              </Section>
            </List>
            <NavigationDestination value="appearance">
              <AppearanceSettingsPage />
            </NavigationDestination>
            <NavigationDestination value="storage">
              <StorageUsagePage isActive={isPresented && path.at(-1) === 'storage'} />
            </NavigationDestination>
            <NavigationDestination value="recently-deleted">
              <RecentlyDeletedPage isActive={isPresented && path.at(-1) === 'recently-deleted'} />
            </NavigationDestination>
            <NavigationDestination value="folders">
              <FolderListPage
                folders={folders}
                onCreate={startFolderForm}
              />
            </NavigationDestination>
            <NavigationDestination value="tags">
              <SavedTagListPage tags={savedTags} onCreate={() => startTagForm()} />
            </NavigationDestination>
            <NavigationDestination value="tag-form">
              <SavedTagFormPage
                key={tagFormDraft.session}
                draft={tagFormDraft}
                onCancel={() => setPath((current) => current.slice(0, -1))}
                onDelete={removeTag}
                onSave={saveTag}
              />
            </NavigationDestination>
            <NavigationDestination value="folder-form">
              <FolderNamePage
                key={formDraft.session}
                draft={formDraft}
                onCancel={() => setPath((current) => current.slice(0, -1))}
                onSave={(name) => void saveFolder(name)}
              />
            </NavigationDestination>
            {folderIdsForDestinations.map((folderId) => {
              const folder = folders.find((item) => item.id === folderId) ?? null;
              const routeValue = getFolderSettingsRouteValue(folderId);
              return (
                <NavigationDestination key={routeValue} value={routeValue}>
                  <FolderSettingsPage
                    key={folderId}
                    folder={folder}
                    onDelete={confirmDeleteFolder}
                    onRename={renameFolderSettings}
                    onSetColor={updateFolderSettingsColor}
                    onToggleProtection={toggleFolderProtection}
                  />
                </NavigationDestination>
              );
            })}
            {tagIdsForDestinations.map((tagId) => {
              const savedTag = savedTags.find((item) => item.id === tagId) ?? null;
              const routeValue = getSavedTagSettingsRouteValue(tagId);
              return (
                <NavigationDestination key={routeValue} value={routeValue}>
                  <SavedTagFormPage
                    key={`${tagId}-${savedTag?.updatedAt ?? 'missing'}`}
                    draft={{ tag: savedTag, session: savedTag?.updatedAt ?? 0 }}
                    onCancel={() => setPath((current) => current.slice(0, -1))}
                    onDelete={removeTag}
                    onSave={async (name, color) => {
                      if (!savedTag) return;
                      try {
                        await updateSavedTag(savedTag.id, name, color);
                        setSavedTags(await listSavedTags());
                        onSavedTagsChanged();
                        setPath((current) => current.slice(0, -1));
                      } catch (error) {
                        showSavedTagFailure(error);
                      }
                    }}
                  />
                </NavigationDestination>
              );
            })}
          </NavigationStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}
