import { Circle, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, padding, resizable } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

type SaveLinkActivityProps = {
  iconUri: string;
};

function SaveLinkActivity(props: SaveLinkActivityProps) {
  'widget';

  return {
    banner: (
      <HStack alignment="center" spacing={12} modifiers={[padding({ all: 16 })]}>
        <Image uiImage={props.iconUri} modifiers={[resizable(), frame({ width: 34, height: 34 })]} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ weight: 'semibold' })]}>Salvar link</Text>
          <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle('#8E8E93')]}>Toque para abrir</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: (
      <Image uiImage={props.iconUri} modifiers={[resizable(), frame({ width: 20, height: 20 })]} />
    ),
    compactTrailing: <Image systemName="circle.fill" size={7} color="#34C759" />,
    minimal: (
      <Image uiImage={props.iconUri} modifiers={[resizable(), frame({ width: 20, height: 20 })]} />
    ),
    expandedLeading: (
      <Image uiImage={props.iconUri} modifiers={[resizable(), frame({ width: 40, height: 40 })]} />
    ),
    expandedTrailing: (
      <HStack alignment="center" spacing={5}>
        <Circle modifiers={[frame({ width: 7, height: 7 }), foregroundStyle('#34C759')]} />
        <Text modifiers={[font({ weight: 'semibold', textStyle: 'caption' })]}>Ativo</Text>
      </HStack>
    ),
    // Leave the TrueDepth sensor area intentionally empty.
    expandedCenter: null,
    expandedBottom: (
      <VStack alignment="leading" spacing={3} modifiers={[padding({ top: 8, leading: 16, bottom: 14, trailing: 16 })]}>
        <Text modifiers={[font({ weight: 'semibold', textStyle: 'headline' })]}>Salvar link</Text>
        <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle('#8E8E93')]}>Toque para abrir</Text>
      </VStack>
    ),
  };
}

export default createLiveActivity<SaveLinkActivityProps>('SaveAppSaveLink', SaveLinkActivity);
