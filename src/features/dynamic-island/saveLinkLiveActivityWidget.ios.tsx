import { Button, HStack, Image, Link, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
  resizable,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

type SaveLinkActivityProps = {
  iconUri: string;
  composeUrl: string;
  expandedHomeUrl: string;
  quickSaveStatus?: 'ready' | 'processing' | 'saved' | 'alreadySaved' | 'invalid' | 'failed';
};

function SaveLinkActivity(props: SaveLinkActivityProps) {
  'widget';

  const quickSaveLabels = {
    ready: 'Salvar link',
    processing: 'Salvando link',
    saved: 'Link salvo',
    alreadySaved: 'Link já salvo',
    invalid: 'Nenhum link válido',
    failed: 'Erro ao salvar link',
  } as const;
  const quickSaveSymbols = {
    ready: 'arrow.down.to.line',
    processing: 'hourglass',
    saved: 'checkmark',
    alreadySaved: 'checkmark',
    invalid: 'exclamationmark',
    failed: 'arrow.clockwise',
  } as const;
  const quickSaveStatus = props.quickSaveStatus ?? 'ready';

  return {
    banner: (
      <HStack alignment="center" spacing={12} modifiers={[padding({ all: 16 })]}>
        <Image
          uiImage={props.iconUri}
          modifiers={[resizable(), frame({ width: 34, height: 34 }), clipShape('roundedRectangle', 8)]}
        />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ weight: 'semibold' })]}>Salvar link</Text>
          <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle('#8E8E93')]}>Toque para abrir</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: (
      <Image
        uiImage={props.iconUri}
        modifiers={[resizable(), frame({ width: 20, height: 20 }), clipShape('roundedRectangle', 5)]}
      />
    ),
    minimal: (
      <Image
        uiImage={props.iconUri}
        modifiers={[resizable(), frame({ width: 20, height: 20 }), clipShape('roundedRectangle', 5)]}
      />
    ),
    expandedLeading: (
      <Link destination={props.expandedHomeUrl} modifiers={[tint('#FFFFFF')]}>
        <Image
          uiImage={props.iconUri}
          modifiers={[
            resizable(),
            frame({ width: 44, height: 44 }),
            clipShape('roundedRectangle', 10),
            padding({ top: 8 }),
          ]}
        />
      </Link>
    ),
    expandedCenter: (
      <Link destination={props.expandedHomeUrl} modifiers={[tint('#FFFFFF')]}>
        <VStack alignment="center" spacing={2}>
          <Text
            modifiers={[
              font({ weight: 'semibold', textStyle: 'headline' }),
              multilineTextAlignment('center'),
            ]}
          >
            Salvar link
          </Text>
          <Text
            modifiers={[
              font({ textStyle: 'subheadline' }),
              foregroundStyle('#8E8E93'),
              multilineTextAlignment('center'),
            ]}
          >
            Toque para salvar
          </Text>
        </VStack>
      </Link>
    ),
    expandedTrailing: (
      <Button
        // The native renderer uses this label for accessibility only.
        label={quickSaveLabels[quickSaveStatus]}
        systemImage={quickSaveSymbols[quickSaveStatus]}
        target="saveapp.quickSave"
      />
    ),
  };
}

export default createLiveActivity<SaveLinkActivityProps>('SaveAppSaveLink', SaveLinkActivity);
