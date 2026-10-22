import { NativeTabs } from 'expo-router/native-tabs';
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';

import { triggerTabHaptic } from '@/utils/haptics';

export default function TabsLayout() {
  return (
    <View collapsable={false} style={{ flex: 1 }}>
      {Platform.OS === 'ios' ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Spacer width={0} />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Spacer width={0} />
          </Stack.Toolbar>
        </>
      ) : null}
      <NativeTabs
        labelVisibilityMode="labeled"
        screenListeners={{ tabPress: () => triggerTabHaptic() }}
        tintColor="#315AE8"
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home_filled' }} />
          <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="collections">
          <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md={{ default: 'grid_view', selected: 'grid_view' }} />
          <NativeTabs.Trigger.Label>Coleções</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
          <NativeTabs.Trigger.Label>Buscar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md={{ default: 'settings', selected: 'settings' }} />
          <NativeTabs.Trigger.Label>Ajustes</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}
