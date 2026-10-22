import { Button, ContextMenu, Host, RNHostView, Section } from '@expo/ui/swift-ui';
import { disabled as disabledModifier } from '@expo/ui/swift-ui/modifiers';
import type { StyleProp, ViewStyle } from 'react-native';

import type { NativeCardContextMenuProps } from './NativeCardContextMenu.types';

export default function NativeCardContextMenu({
  actions,
  children,
  matchContents = true,
  preview,
  style,
  title,
}: NativeCardContextMenuProps) {
  const actionButtons = actions.map((action) => (
    <Button
      key={action.id}
      label={action.title}
      modifiers={action.disabled ? [disabledModifier(true)] : undefined}
      onPress={action.onPress}
      role={action.destructive ? 'destructive' : undefined}
      systemImage={action.systemImage}
    />
  ));
  return (
    <Host ignoreSafeArea="all" matchContents={matchContents} style={style as StyleProp<ViewStyle>}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <>{children}</>
          </RNHostView>
        </ContextMenu.Trigger>
        {preview ? (
          <ContextMenu.Preview>
            <RNHostView matchContents>
              <>{preview}</>
            </RNHostView>
          </ContextMenu.Preview>
        ) : null}
        <ContextMenu.Items>
          {title ? <Section title={title}>{actionButtons}</Section> : actionButtons}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
