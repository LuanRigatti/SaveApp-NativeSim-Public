import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

import { triggerTabHaptic } from '@/utils/haptics';

/**
 * Observa somente mudanças efetivas no índice do Native Tabs navigator.
 * A NativeTabs instalada no SDK atual despacha JUMP_TO diretamente ao selecionar
 * uma aba, por isso não há um evento tabPress público para conectar no layout.
 */
export function TabHapticListener() {
  const navigation = useNavigation();
  const previousIndex = useRef(navigation.getState()?.index);

  useEffect(() => {
    return navigation.addListener('state', (event) => {
      const nextIndex = event.data.state?.index;

      if (nextIndex === undefined || nextIndex === previousIndex.current) {
        return;
      }

      previousIndex.current = nextIndex;
      triggerTabHaptic();
    });
  }, [navigation]);

  return null;
}
