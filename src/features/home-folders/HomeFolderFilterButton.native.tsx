import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, Text } from 'react-native';

import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { useAppTheme } from '@/theme';

export default function HomeFolderFilterButton() {
  const { setViewMode, viewMode } = useHomeViewMode();
  const { folders, selectFolder, selectView, selection, view } = useLocalHomeFolders();
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const selectedFolderId = selection.kind === 'folder' ? selection.folderId : null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const selectedFolderColor = selectedFolder
    ? getHomeFolderAccentColor(selectedFolder.color, accentColor, resolvedMode)
    : theme.colors.primary;
  const currentLabel = selectedFolder?.name ?? (
    view === 'folders' ? 'Pastas' : 'Todos'
  );
  const actions: MenuAction[] = useMemo(
    () => [
      { id: 'view:all-items', title: 'Todos', state: view === 'all-items' ? 'on' : 'off' },
      { id: 'view:folders', title: 'Pastas', state: view === 'folders' ? 'on' : 'off', image: 'folder', imageColor: theme.colors.primary },
      ...folders.map((folder) => ({
        id: `folder:${folder.id}`,
        title: folder.name,
        state: selectedFolderId === folder.id ? 'on' as const : 'off' as const,
        image: 'folder' as const,
        imageColor: getHomeFolderAccentColor(folder.color, accentColor, resolvedMode),
      })),
      {
        id: 'visualization',
        title: 'Visualização',
        subactions: [
          { id: 'mode:large', title: 'Maiores', state: viewMode === 'large' ? 'on' : 'off' },
          { id: 'mode:small', title: 'Menores', state: viewMode === 'small' ? 'on' : 'off' },
          { id: 'mode:list', title: 'Lista', state: viewMode === 'list' ? 'on' : 'off' },
          { id: 'mode:compact-list', title: 'Lista compacta', state: viewMode === 'compact-list' ? 'on' : 'off' },
          { id: 'mode:single-line', title: 'Linha única', state: viewMode === 'single-line' ? 'on' : 'off' },
        ],
      },
    ],
    [accentColor, folders, resolvedMode, selectedFolderId, theme.colors.primary, view, viewMode],
  );

  return (
    <MenuView
      actions={actions}
      colorScheme={resolvedMode}
      onPressAction={({ nativeEvent }) => {
        const selected = nativeEvent.event;
        if (selected === 'view:all-items') selectView('all-items');
        else if (selected === 'view:folders') selectView('folders');
        else if (selected.startsWith('folder:')) {
          selectFolder(selected.slice('folder:'.length));
        } else if (selected.startsWith('mode:')) {
          const mode = selected.slice('mode:'.length);
          if (
            mode === 'large' ||
            mode === 'small' ||
            mode === 'list' ||
            mode === 'compact-list' ||
            mode === 'single-line'
          ) {
            setViewMode(mode);
          }
        }
      }}
    >
      <Pressable
        accessibilityLabel={`Pastas e visualização: ${currentLabel}`}
        accessibilityRole="button"
        style={{
          alignItems: 'center',
          borderColor: theme.colors.separator,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          maxWidth: 176,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <Ionicons color={selectedFolderColor} name="folder-outline" size={14} />
        <Text
          numberOfLines={1}
          style={[theme.typography.caption, { color: theme.colors.textPrimary, flexShrink: 1, minWidth: 0 }]}
        >
          {currentLabel}
        </Text>
        <Ionicons color={theme.colors.textTertiary} name="chevron-down" size={12} />
      </Pressable>
    </MenuView>
  );
}
