import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme';

export type AvatarProps = {
  name: string;
  imageUri?: string | null;
  size?: 'small' | 'medium' | 'large';
  dimension?: number;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ name, imageUri, size = 'medium', dimension, style }: AvatarProps) {
  const { theme } = useAppTheme();
  const defaultDimension = {
    small: theme.sizes.avatarSmall,
    medium: theme.sizes.avatarMedium,
    large: theme.sizes.avatarLarge,
  }[size];
  const resolvedDimension = dimension ?? defaultDimension;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();

  return (
    <View
      accessibilityLabel={name}
      accessibilityRole="image"
      style={[
        {
          alignItems: 'center',
          backgroundColor: theme.colors.brand,
          borderRadius: theme.radius.pill,
          height: resolvedDimension,
          justifyContent: 'center',
          overflow: 'hidden',
          width: resolvedDimension,
        },
        style,
      ]}
    >
      {imageUri ? (
        <Image
          accessibilityLabel={name}
          source={{ uri: imageUri }}
          style={{ height: resolvedDimension, width: resolvedDimension }}
        />
      ) : (
        <Text style={[theme.typography.headline, { color: theme.colors.primary }]}>{initials}</Text>
      )}
    </View>
  );
}
