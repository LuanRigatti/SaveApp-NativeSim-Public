import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { useRef } from 'react';

import type { NativeCardContextMenuProps } from './NativeCardContextMenu.types';

export default function NativeCardContextMenu({ actions, children, style, title }: NativeCardContextMenuProps) {
  const pendingActionIdRef = useRef<string | null>(null);
  const menuActions: MenuAction[] = actions.map((action) => ({
    id: action.id,
    title: action.title,
    ...(action.disabled ? { attributes: { disabled: true } } : {}),
    ...(action.destructive ? { attributes: { destructive: true } } : {}),
  }));

  return (
    <MenuView
      actions={menuActions}
      onPressAction={({ nativeEvent }) => {
        pendingActionIdRef.current = nativeEvent.event;
      }}
      onCloseMenu={() => {
        const actionId = pendingActionIdRef.current;
        pendingActionIdRef.current = null;
        if (actionId) actions.find((action) => action.id === actionId)?.onPress();
      }}
      shouldOpenOnLongPress
      style={style}
      title={title}
    >
      {children}
    </MenuView>
  );
}
