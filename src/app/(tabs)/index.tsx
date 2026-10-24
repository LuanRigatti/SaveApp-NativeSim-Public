import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { PhotoMasonryGallery } from '@/components/photos/PhotoMasonryGallery';
import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const { media } = useLocalPhotoLibrary();
  const { contents } = useLocalSavedContent();

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true }} />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Salvo"
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text
                style={[
                  theme.typography.largeTitle,
                  {
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.largeTitle.fontSize + 2,
                  },
                ]}
              >
                Salvo
              </Text>
            </View>
          }
          nativeTabRoot
          contentGap={theme.spacing.md}
          renderScrollableContent={(scrollProps) => (
            <PhotoMasonryGallery {...scrollProps} contents={contents} media={media} />
          )}
          scrollContentContainerStyle={{
            paddingBottom: theme.layout.tabBarHeight + insets.bottom + theme.spacing.xxxl,
            paddingHorizontal: 0,
          }}
        >
          {null}
        </ProgressiveCollapsibleScreen>
      </View>
    </>
  );
}
