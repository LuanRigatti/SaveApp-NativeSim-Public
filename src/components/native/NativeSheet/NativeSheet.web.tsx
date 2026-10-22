import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/theme';
import type { NativeSheetProps } from '@/types/native-ui';

export default function NativeSheetWeb({
  accessibilityLabel,
  children,
  onDismiss,
  onVisibleChange,
  title,
  visible,
}: NativeSheetProps) {
  const { theme } = useAppTheme();
  const handleClose = () => {
    onVisibleChange(false);
    onDismiss?.();
  };

  return (
    <Modal
      accessibilityLabel={accessibilityLabel ?? title}
      onRequestClose={handleClose}
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          accessibilityLabel="Fechar painel"
          accessibilityRole="button"
          onPress={handleClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            theme.shadows.elevated,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              padding: theme.spacing.lg,
            },
          ]}
        >
          {title ? (
            <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%' },
});
