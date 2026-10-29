import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { useHomeFavorites } from '@/features/home-content/HomeFavoritesProvider';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { HOME_CATEGORIES, isHomeCategory } from '@/features/home-content/homeCategories';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { useAppTheme } from '@/theme';
import { triggerSelectionHaptic } from '@/utils/haptics';

export default function HomeFolderFilterButton() {
  const { setViewMode, viewMode } = useHomeViewMode();
  const { authorizeFolder, folders, isFolderAuthorized, selectCategory, selectFolder, selectView, selection, view } = useLocalHomeFolders();
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const { favoritesOnly, setFavoritesOnly } = useHomeFavorites();
  const selectedFolderId = selection.kind === 'folder' ? selection.folderId : null;
  const selectedCategory = selection.kind === 'category' ? selection.category : null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const selectedFolderColor = selectedFolder
    ? getHomeFolderAccentColor(selectedFolder.color, accentColor, resolvedMode)
    : theme.colors.primary;
  const currentLabel = selectedFolder?.name ?? (
    HOME_CATEGORIES.find((category) => category.id === selectedCategory)?.label ??
      (view === 'folders' ? 'Pastas' : 'Todos')
  );
  const actions: MenuAction[] = useMemo(
    () => [
      { id: 'view:all-items', title: 'Todos', state: !selectedCategory && view === 'all-items' ? 'on' : 'off' },
      { id: 'view:folders', title: 'Pastas', state: !selectedCategory && view === 'folders' ? 'on' : 'off', image: 'folder', imageColor: theme.colors.primary },
      {
        id: 'section-title:categories',
        title: 'CATEGORIAS',
        attributes: { disabled: true },
        titleColor: theme.colors.textSecondary,
      },
      {
        id: 'section:categories',
        title: 'CATEGORIAS',
        displayInline: true,
        subactions: HOME_CATEGORIES.map((category) => ({
          id: `category:${category.id}`,
          title: category.label,
          state: selectedCategory === category.id ? 'on' as const : 'off' as const,
          image: category.icon,
          imageColor: theme.colors.primary,
        })),
      },
      {
        id: 'section-title:folders',
        title: 'MINHAS PASTAS',
        attributes: { disabled: true },
        titleColor: theme.colors.textSecondary,
      },
      {
        id: 'section:folders',
        title: 'MINHAS PASTAS',
        displayInline: true,
        subactions: folders.length > 0 ? folders.map((folder) => ({
          id: `folder:${folder.id}`,
          title: folder.name,
          state: selectedFolderId === folder.id ? 'on' as const : 'off' as const,
          image: 'folder' as const,
          imageColor: getHomeFolderAccentColor(folder.color, accentColor, resolvedMode),
        })) : [{
          id: 'folder:none',
          title: 'Nenhuma pasta criada',
          attributes: { disabled: true },
          image: 'folder' as const,
        }],
      },
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
    [accentColor, folders, resolvedMode, selectedCategory, selectedFolderId, theme.colors.primary, theme.colors.textSecondary, view, viewMode],
  );

  return (
      <View style={{ alignItems: 'center', borderColor: theme.colors.separator, borderRadius: theme.radius.pill, borderWidth: 1, flexDirection: 'row', height: 44, paddingHorizontal: 2 }}>
        <Pressable
          accessibilityLabel={favoritesOnly ? 'Desativar Favoritos' : 'Mostrar Favoritos'}
          accessibilityRole="button"
          accessibilityState={{ selected: favoritesOnly }}
          onPress={() => {
            triggerSelectionHaptic();
            setFavoritesOnly(!favoritesOnly);
          }}
          style={{ alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }}
        >
          <Ionicons color={theme.colors.primary} name={favoritesOnly ? 'star' : 'star-outline'} size={18} />
        </Pressable>
        <MenuView
          actions={actions}
          colorScheme={resolvedMode}
          onPressAction={({ nativeEvent }) => {
            const selected = nativeEvent.event;
            if (selected === 'view:all-items') {
              setFavoritesOnly(false);
              selectView('all-items');
            } else if (selected === 'view:folders') {
              setFavoritesOnly(false);
              selectView('folders');
            } else if (selected.startsWith('category:')) {
              const category = selected.slice('category:'.length);
              if (isHomeCategory(category)) {
                setFavoritesOnly(false);
                selectCategory(category);
              }
            } else if (selected.startsWith('folder:')) {
              const folderId = selected.slice('folder:'.length);
              void (async () => {
                const outcome = await authorizeFolder(folderId);
                if (outcome !== 'authenticated' || !isFolderAuthorized(folderId)) return;
                selectFolder(folderId);
                setFavoritesOnly(false);
              })();
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
            accessibilityLabel={`Selecionar pasta. Atual: ${currentLabel}.`}
            accessibilityRole="button"
            style={{ alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }}
          >
            <Ionicons color={selectedCategory ? theme.colors.primary : selectedFolderColor} name="folder-outline" size={18} />
          </Pressable>
        </MenuView>
      </View>
  );
}
