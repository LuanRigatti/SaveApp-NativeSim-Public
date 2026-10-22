import { BottomSheet } from '@/components/premium';
import type { NativeSheetProps } from '@/types/native-ui';

export default function NativeSheetExpo({
  accessibilityLabel,
  children,
  onDismiss,
  onVisibleChange,
  title,
  visible,
}: NativeSheetProps) {
  const handleClose = () => {
    onVisibleChange(false);
    onDismiss?.();
  };

  return (
    <BottomSheet
      accessibilityLabel={accessibilityLabel}
      onClose={handleClose}
      title={title}
      visible={visible}
    >
      {children}
    </BottomSheet>
  );
}
