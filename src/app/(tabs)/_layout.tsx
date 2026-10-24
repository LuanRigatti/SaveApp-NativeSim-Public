import { NativeTabs } from 'expo-router/native-tabs';
import { Stack, usePathname } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { HomeContentComposer, type HomeComposerKind } from '@/components/homeContent/HomeContentComposer';
import { HomeViewModeProvider, useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import { triggerTabHaptic } from '@/utils/haptics';

export default function TabsLayout() {
  return (
    <HomeViewModeProvider>
      <TabsLayoutContent />
    </HomeViewModeProvider>
  );
}

function TabsLayoutContent() {
  const isHomeRoute = usePathname() === '/';
  const { importFromPhotoLibrary, importVideosFromPhotoLibrary } = useLocalPhotoLibrary();
  const { setViewMode, viewMode } = useHomeViewMode();
  const [composerKind, setComposerKind] = useState<HomeComposerKind>(null);

  return (
    <View collapsable={false} style={{ flex: 1 }}>
      {Platform.OS === 'ios' ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Spacer width={0} />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Spacer width={0} />
            <Stack.Toolbar.Menu
              accessibilityLabel="Modo de visualização"
              hidden={!isHomeRoute}
              icon="square.grid.2x2"
              separateBackground={false}
            >
              <Stack.Toolbar.MenuAction
                icon="square.grid.2x2"
                isOn={viewMode === 'large'}
                onPress={() => setViewMode('large')}
              >
                Maiores
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon="square.grid.3x3"
                isOn={viewMode === 'small'}
                onPress={() => setViewMode('small')}
              >
                Menores
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon="list.bullet"
                isOn={viewMode === 'list'}
                onPress={() => setViewMode('list')}
              >
                Lista
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon="list.bullet.rectangle"
                isOn={viewMode === 'compact-list'}
                onPress={() => setViewMode('compact-list')}
              >
                Lista compacta
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu
              accessibilityLabel="Adicionar"
              hidden={!isHomeRoute}
              icon="plus"
              separateBackground={false}
            >
              <Stack.Toolbar.MenuAction
                icon="photo"
                onPress={() => void importFromPhotoLibrary()}
              >
                Adicionar imagens
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon="video"
                onPress={() => void importVideosFromPhotoLibrary()}
              >
                Adicionar vídeos
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="link" onPress={() => setComposerKind('link')}>
                Adicionar link
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon="text.alignleft"
                onPress={() => setComposerKind('text')}
              >
                Adicionar texto
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="doc" onPress={() => {}}>
                Adicionar arquivos
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          </Stack.Toolbar>
        </>
      ) : null}
      <NativeTabs
        labelVisibilityMode="unlabeled"
        screenListeners={{ tabPress: () => triggerTabHaptic() }}
        tintColor="#315AE8"
      >
        <NativeTabs.Trigger name="index" accessibilityLabel="Início">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home_filled' }} />
          <NativeTabs.Trigger.Label hidden>Início</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="collections" accessibilityLabel="Coleções">
          <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md={{ default: 'grid_view', selected: 'grid_view' }} />
          <NativeTabs.Trigger.Label hidden>Coleções</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" accessibilityLabel="Buscar">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
          <NativeTabs.Trigger.Label hidden>Buscar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" accessibilityLabel="Ajustes">
          <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md={{ default: 'settings', selected: 'settings' }} />
          <NativeTabs.Trigger.Label hidden>Ajustes</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <HomeContentComposer kind={composerKind} onClose={() => setComposerKind(null)} />
    </View>
  );
}
