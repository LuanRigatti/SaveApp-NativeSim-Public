import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme';

export type PremiumBottomSheetProps = {
  visible: boolean;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  accessibilityLabel?: string;
};

export function BottomSheet({
  accessibilityLabel,
  children,
  footer,
  onClose,
  title,
  visible,
}: PremiumBottomSheetProps) {
  const { theme, reduceMotionEnabled } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);
  const spring = reduceMotionEnabled
    ? { damping: 100, stiffness: 1000, mass: 1 }
    : theme.animations.spring.gentle;

  const gesture = Gesture.Pan()
    .onBegin(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateY.value = Math.max(0, startY.value + event.translationY);
    })
    .onEnd(() => {
      if (translateY.value > height * 0.24) {
        runOnJS(onClose)();
        return;
      }

      translateY.value = withSpring(0, spring);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      accessibilityLabel={accessibilityLabel ?? title}
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          accessibilityLabel="Fechar painel"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <GestureDetector gesture={gesture}>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              theme.shadows.elevated,
              {
                backgroundColor: theme.colors.surfaceElevated,
                borderTopLeftRadius: theme.radius.xl,
                borderTopRightRadius: theme.radius.xl,
                paddingBottom: insets.bottom + theme.spacing.lg,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.sm,
              },
              sheetStyle,
            ]}
          >
            <View
              style={[
                styles.handle,
                {
                  backgroundColor: theme.colors.borderStrong,
                  borderRadius: theme.radius.pill,
                  height: theme.sizes.dragIndicatorHeight,
                  width: theme.sizes.dragIndicatorWidth,
                },
              ]}
            />
            {title ? (
              <Text
                style={[
                  theme.typography.title3,
                  { color: theme.colors.textPrimary, marginTop: theme.spacing.md },
                ]}
              >
                {title}
              </Text>
            ) : null}
            <View style={{ marginTop: theme.spacing.md }}>{children}</View>
            {footer ? <View style={{ marginTop: theme.spacing.lg }}>{footer}</View> : null}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', width: '100%' },
  handle: { alignSelf: 'center' },
});
