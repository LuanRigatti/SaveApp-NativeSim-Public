import { Platform } from 'react-native';

export const createShadows = (shadowColor: string) => {
  const nativeCard = {
    shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  };
  const nativeElevated = {
    shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  };

  return {
    none:
      Platform.OS === 'web'
        ? { boxShadow: 'none' }
        : {
            shadowColor: 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
          },
    card: Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(17, 24, 39, 0.06)' } : nativeCard,
    elevated:
      Platform.OS === 'web' ? { boxShadow: '0 6px 16px rgba(17, 24, 39, 0.12)' } : nativeElevated,
  };
};

export const shadows = createShadows('#111827');

export type Shadows = ReturnType<typeof createShadows>;
