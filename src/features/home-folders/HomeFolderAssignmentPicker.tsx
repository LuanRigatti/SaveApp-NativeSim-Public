import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import type { HomeFolder } from './homeFolderTypes';
import { getHomeFolderAccentColor } from './homeFolderColor';
import { useAppTheme } from '@/theme';

type HomeFolderAssignmentPickerProps = {
  currentFolderId: string | null;
  folders: readonly HomeFolder[];
  onClose: () => void;
  onCreateFolder: () => void;
  onSelectFolder: (folderId: string | null) => void;
  visible: boolean;
};

export function HomeFolderAssignmentPicker({
  currentFolderId,
  folders,
  onClose,
  onCreateFolder,
  onSelectFolder,
  visible,
}: HomeFolderAssignmentPickerProps) {
  const { accentColor, resolvedMode, theme } = useAppTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable
        onPress={onClose}
        style={{ alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.24)', flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, maxHeight: '75%', maxWidth: 380, overflow: 'hidden', width: '100%' }}
        >
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md }]}>
            {currentFolderId ? 'Alterar pasta' : 'Adicionar à pasta'}
          </Text>
          {folders.length > 0 ? (
            <ScrollView>
              {folders.map((folder) => (
                <Pressable
                  key={folder.id}
                  accessibilityRole="button"
                  onPress={() => onSelectFolder(folder.id)}
                  style={{ alignItems: 'center', borderBottomColor: theme.colors.separator, borderBottomWidth: 0.5, flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
                >
                  <Ionicons color={getHomeFolderAccentColor(folder.color, accentColor, resolvedMode)} name="folder-outline" size={17} />
                  <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>{folder.name}</Text>
                  {folder.isProtected ? (
                    <Ionicons color={theme.colors.textSecondary} name="lock-closed-outline" size={15} />
                  ) : null}
                  {folder.id === currentFolderId ? <Ionicons color={getHomeFolderAccentColor(folder.color, accentColor, resolvedMode)} name="checkmark" size={18} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, padding: theme.spacing.md }]}>
              Nenhuma pasta criada
            </Text>
          )}
          {currentFolderId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectFolder(null)}
              style={{ alignItems: 'center', borderTopColor: theme.colors.separator, borderTopWidth: 0.5, flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
            >
              <Ionicons color={theme.colors.primary} name="folder-open-outline" size={17} />
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>Remover da pasta</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onCreateFolder}
            style={{ alignItems: 'center', borderTopColor: theme.colors.separator, borderTopWidth: 0.5, flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
          >
            <Ionicons color={theme.colors.primary} name="add-circle-outline" size={18} />
            <Text style={[theme.typography.body, { color: theme.colors.primary, flex: 1 }]}>Criar pasta</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ alignItems: 'center', minHeight: theme.sizes.touchTargetMinimum, justifyContent: 'center' }}>
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Cancelar</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
