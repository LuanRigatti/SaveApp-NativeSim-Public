import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

type SaveLinkActivityProps = {
  iconUri: string;
};

function SaveLinkActivity(props: SaveLinkActivityProps) {
  'widget';

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
      <Image
        uiImage={props.iconUri}
        modifiers={[
          resizable(),
          frame({ width: 44, height: 44 }),
          clipShape('roundedRectangle', 10),
          padding({ top: 8 }),
        ]}
      />
    ),
    expandedTrailing: (
      <Text
        modifiers={[
          font({ weight: 'semibold', textStyle: 'caption' }),
          padding({ top: 8 }),
        ]}
      >
        Ativo
      </Text>
    ),
    expandedCenter: (
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
          Toque para abrir
        </Text>
      </VStack>
    ),
  };
}

export default createLiveActivity<SaveLinkActivityProps>('SaveAppSaveLink', SaveLinkActivity);
