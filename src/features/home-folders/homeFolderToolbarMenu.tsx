import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import type { HomeViewMode } from '@/features/home-content/homeViewMode';
import { triggerSelectionHaptic } from '@/utils/haptics';

import type { HomeFolder, HomeFolderHomeView } from './homeFolderTypes';

function withSelectionHaptic(action: () => void): () => void {
  return () => {
    triggerSelectionHaptic();
    action();
  };
}

export type HomeFolderToolbarMenuProps = {
  currentFolderId: string | null;
  currentLabel: string;
  folders: readonly HomeFolder[];
  hidden: boolean;
  tintColor: string;
  onOpenFolder: (folderId: string) => void;
  onSelectHomeView: (view: HomeFolderHomeView) => void;
  onSelectViewMode: (viewMode: HomeViewMode) => void;
  view: HomeFolderHomeView;
  viewMode: HomeViewMode;
};

/**
 * Return Stack.Toolbar.Menu itself so Expo Router converts this as the direct
 * native toolbar child. The system toolbar sizes this icon-only menu like the
 * adjacent Stack.Toolbar.Button without a custom Host or fixed frame.
 */
export function createHomeFolderToolbarMenu({
  currentFolderId,
  currentLabel,
  folders,
  hidden,
  tintColor,
  onOpenFolder,
  onSelectHomeView,
  onSelectViewMode,
  view,
  viewMode,
}: HomeFolderToolbarMenuProps): ReactElement {
  return (
    <Stack.Toolbar.Menu
      accessibilityHint="Abre as opções de pastas e visualização."
      accessibilityLabel={`Selecionar pasta. Atual: ${currentLabel}.`}
      hidden={hidden}
      icon="folder"
      separateBackground={false}
      tintColor={tintColor}
    >
      <Stack.Toolbar.MenuAction
        icon="folder"
        isOn={!currentFolderId && view === 'all-items'}
        onPress={withSelectionHaptic(() => onSelectHomeView('all-items'))}
      >
        Todos
      </Stack.Toolbar.MenuAction>
      <Stack.Toolbar.MenuAction
        icon="folder"
        isOn={!currentFolderId && view === 'folders'}
        onPress={withSelectionHaptic(() => onSelectHomeView('folders'))}
      >
        Pastas
      </Stack.Toolbar.MenuAction>
      {folders.length > 0 ? (
        <Stack.Toolbar.Menu inline title="Pastas existentes">
          {folders.map((folder) => (
            <Stack.Toolbar.MenuAction
              icon="folder"
              isOn={currentFolderId === folder.id}
              key={folder.id}
              onPress={withSelectionHaptic(() => onOpenFolder(folder.id))}
            >
              {folder.name}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      ) : null}
      <Stack.Toolbar.Menu icon="square.grid.2x2" title="Visualização">
        <Stack.Toolbar.MenuAction
          icon="square.grid.2x2"
          isOn={viewMode === 'large'}
          onPress={withSelectionHaptic(() => onSelectViewMode('large'))}
        >
          Maiores
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="square.grid.3x3"
          isOn={viewMode === 'small'}
          onPress={withSelectionHaptic(() => onSelectViewMode('small'))}
        >
          Menores
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="list.bullet"
          isOn={viewMode === 'list'}
          onPress={withSelectionHaptic(() => onSelectViewMode('list'))}
        >
          Lista
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="list.bullet.rectangle"
          isOn={viewMode === 'compact-list'}
          onPress={withSelectionHaptic(() => onSelectViewMode('compact-list'))}
        >
          Lista compacta
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="line.3.horizontal"
          isOn={viewMode === 'single-line'}
          onPress={withSelectionHaptic(() => onSelectViewMode('single-line'))}
        >
          Linha única
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar.Menu>
  );
}
