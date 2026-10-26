import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type ViewProps } from 'react-native';

import type { NativeCardContextMenuProps } from './NativeCardContextMenu.types';
import { useAppTheme } from '@/theme';

export default function NativeCardContextMenu({ actions, children, title }: NativeCardContextMenuProps) {
  const { theme } = useAppTheme();
  const [isPresented, setIsPresented] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const webContextMenuProps = {
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      setIsPresented(true);
    },
  } as unknown as ViewProps;

  return (
    <>
      <View {...webContextMenuProps}>
        <Pressable onLongPress={() => setIsPresented(true)}>{children}</Pressable>
      </View>
      <Modal
        animationType="fade"
        onDismiss={() => {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          action?.();
        }}
        onRequestClose={() => setIsPresented(false)}
        transparent
        visible={isPresented}
      >
        <Pressable
          onPress={() => setIsPresented(false)}
          style={{ alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.24)', flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, maxWidth: 360, overflow: 'hidden', width: '100%' }}
          >
            {title ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md }]}>
                {title}
              </Text>
            ) : null}
            <ScrollView>
              {actions.map((action) => (
                <Pressable
                  key={action.id}
                  accessibilityRole="button"
                  disabled={action.disabled}
                  onPress={() => {
                    pendingActionRef.current = action.onPress;
                    setIsPresented(false);
                  }}
                  style={{ alignItems: 'center', borderBottomColor: theme.colors.separator, borderBottomWidth: 0.5, flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, opacity: action.disabled ? 0.45 : 1, paddingHorizontal: theme.spacing.md }}
                >
                  <Ionicons
                    color={action.destructive ? theme.colors.danger : theme.colors.primary}
                    name={action.destructive ? 'trash-outline' : 'folder-outline'}
                    size={17}
                  />
                  <Text style={[theme.typography.body, { color: action.destructive ? theme.colors.danger : theme.colors.textPrimary, flex: 1 }]}>
                    {action.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
