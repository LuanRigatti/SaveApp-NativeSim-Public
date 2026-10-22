import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/feedback';
import { GlassSurface } from '@/components/premium';
import { useAppTheme } from '@/theme';
import { triggerNativeButtonHaptic } from '@/utils/haptics';

import {
  HOME_TOOLBAR_AVATAR_SIZE,
  HOME_TOOLBAR_CONTROL_SIZE,
  HOME_TOOLBAR_HORIZONTAL_PADDING,
  HOME_TOOLBAR_SEARCH_WIDTH,
  HOME_TOOLBAR_WIDTH,
} from './NativeHomeToolbarActions.constants';
import type { NativeHomeToolbarActionsProps } from './NativeHomeToolbarActions.types';

export default function NativeHomeToolbarActionsFallback(props: NativeHomeToolbarActionsProps) {
  const { theme } = useAppTheme();

  if (props.mode === 'modeAndSearchActions' || props.mode === 'modeOnlyAction') {
    const hasSearch = props.mode === 'modeAndSearchActions';
    const toolbarWidth = hasSearch ? HOME_TOOLBAR_SEARCH_WIDTH : HOME_TOOLBAR_CONTROL_SIZE;

    return (
      <GlassSurface
        glassEffectStyle="clear"
        interactive
        style={[
          styles.surface,
          {
            backgroundColor: 'transparent',
            borderRadius: theme.radius.pill,
            width: toolbarWidth,
          },
        ]}
      >
        <View
          style={[
            styles.modeActions,
            {
              justifyContent: hasSearch ? 'space-between' : 'center',
              width: toolbarWidth,
            },
          ]}
        >
          <Pressable
            accessibilityHint={props.accessibilityHint}
            accessibilityLabel={props.accessibilityLabel}
            accessibilityRole="button"
            onPress={props.onModePress}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.72 : 1 }]}
            testID="home-mode-toolbar-action"
          >
            <Ionicons color={theme.colors.textPrimary} name="options-outline" size={19} />
          </Pressable>
          {hasSearch ? (
            <>
              <Pressable
                accessibilityHint={props.searchAccessibilityHint}
                accessibilityLabel={props.searchAccessibilityLabel}
                accessibilityRole="button"
                onPress={props.onSearchPress}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.72 : 1 }]}
                testID="home-search-toolbar-action"
              >
                <Ionicons color={theme.colors.textPrimary} name="search-outline" size={19} />
              </Pressable>
            </>
          ) : null}
        </View>
      </GlassSurface>
    );
  }

  const {
    accessibilityHint,
    accessibilityLabel = 'Abrir opções do SaveApp',
    foregroundColor,
    imageUri,
    name,
    onProfilePress,
    onSearchPress,
    searchAccessibilityLabel = 'Abrir Pesquisa',
    showSearch = true,
  } = props;
  const toolbarWidth = showSearch ? HOME_TOOLBAR_WIDTH : HOME_TOOLBAR_CONTROL_SIZE;

  return (
    <GlassSurface
      glassEffectStyle="clear"
      interactive
      style={[
        styles.surface,
        {
          backgroundColor: 'transparent',
          borderRadius: theme.radius.pill,
          width: toolbarWidth,
        },
      ]}
    >
      <View style={styles.actions}>
        <Pressable
          accessibilityHint={accessibilityHint}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          onPress={() => {
            triggerNativeButtonHaptic('light');
            onProfilePress?.();
          }}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.72 : 1 }]}
        >
          <Avatar
            dimension={HOME_TOOLBAR_AVATAR_SIZE}
            imageUri={imageUri ?? undefined}
            name={name}
            size="medium"
          />
        </Pressable>
        {showSearch ? (
          <Pressable
            accessibilityLabel={searchAccessibilityLabel}
            accessibilityRole="button"
            onPress={onSearchPress}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Ionicons
              color={foregroundColor ?? theme.colors.textPrimary}
              name="search-outline"
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  modeActions: {
    alignItems: 'center',
    flexDirection: 'row',
    height: HOME_TOOLBAR_CONTROL_SIZE,
    justifyContent: 'center',
  },
  surface: {
    height: HOME_TOOLBAR_CONTROL_SIZE,
    overflow: 'hidden',
    width: HOME_TOOLBAR_WIDTH,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HOME_TOOLBAR_HORIZONTAL_PADDING,
  },
  action: {
    alignItems: 'center',
    height: HOME_TOOLBAR_CONTROL_SIZE,
    justifyContent: 'center',
    width: HOME_TOOLBAR_CONTROL_SIZE,
  },
});
