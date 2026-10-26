import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import type { HomeViewMode } from '@/features/home-content/homeViewMode';
import { useAppTheme } from '@/theme';

export default function HomeFolderFilterButton() {
  const { setViewMode, viewMode } = useHomeViewMode();
  const { folders, selectFolder, selectView, selection, view } = useLocalHomeFolders();
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const [isOpen, setIsOpen] = useState(false);
  const selectedFolderId = selection.kind === 'folder' ? selection.folderId : null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const selectedFolderColor = selectedFolder
    ? getHomeFolderAccentColor(selectedFolder.color, accentColor, resolvedMode)
    : theme.colors.primary;
  const currentLabel = selectedFolder?.name ?? (
    view === 'folders' ? 'Pastas' : 'Todos'
  );

  const selectLayout = (mode: HomeViewMode) => {
    setViewMode(mode);
    setIsOpen(false);
  };

  const renderOption = (
    key: string,
    title: string,
    selected: boolean,
    onPress: () => void,
    icon: 'folder-outline' | 'grid-outline' | 'grid' | 'list-outline' | 'list' | 'menu-outline',
    iconColor?: string,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'center',
        borderBottomColor: theme.colors.separator,
        borderBottomWidth: 0.5,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: theme.sizes.touchTargetMinimum,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Ionicons
        color={icon.startsWith('folder') ? iconColor ?? theme.colors.primary : theme.colors.textSecondary}
        name={icon}
        size={17}
      />
      <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1, minWidth: 0 }]}>
        {title}
      </Text>
      {selected ? <Ionicons color={iconColor ?? theme.colors.primary} name="checkmark" size={18} /> : null}
    </Pressable>
  );

  return (
    <>
      <Pressable
        accessibilityLabel={`Pastas e visualização: ${currentLabel}`}
        accessibilityRole="button"
        onPress={() => setIsOpen(true)}
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
        <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textPrimary, flexShrink: 1, minWidth: 0 }]}>
          {currentLabel}
        </Text>
        <Ionicons color={theme.colors.textTertiary} name="chevron-down" size={12} />
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setIsOpen(false)} transparent visible={isOpen}>
        <Pressable
          onPress={() => setIsOpen(false)}
          style={{ alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.24)', flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, maxWidth: 360, overflow: 'hidden', width: '100%' }}
          >
            <ScrollView>
              {renderOption('all-items', 'Todos', view === 'all-items', () => {
                selectView('all-items');
                setIsOpen(false);
              }, 'grid-outline')}
              {renderOption('folders', 'Pastas', view === 'folders', () => {
                selectView('folders');
                setIsOpen(false);
              }, 'folder-outline')}
              {folders.map((folder) => renderOption(
                `folder:${folder.id}`,
                folder.name,
                selectedFolderId === folder.id,
                () => {
                  selectFolder(folder.id);
                  setIsOpen(false);
                },
                'folder-outline',
                getHomeFolderAccentColor(folder.color, accentColor, resolvedMode),
              ))}
              <View style={{ borderBottomColor: theme.colors.separator, borderBottomWidth: 0.5, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xs }}>
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>VISUALIZAÇÃO</Text>
              </View>
              {([
                ['large', 'Maiores'],
                ['small', 'Menores'],
                ['list', 'Lista'],
                ['compact-list', 'Lista compacta'],
                ['single-line', 'Linha única'],
              ] as const).map(([mode, label]) => renderOption(
                `mode:${mode}`,
                label,
                viewMode === mode,
                () => selectLayout(mode),
                mode === 'large'
                  ? 'grid-outline'
                  : mode === 'small'
                    ? 'grid'
                    : mode === 'list'
                      ? 'list-outline'
                      : mode === 'single-line'
                        ? 'menu-outline'
                        : 'list',
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
