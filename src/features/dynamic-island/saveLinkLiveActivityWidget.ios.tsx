import { Button, HStack, Image, Link, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  font,
  foregroundStyle,
  frame,
  lineLimit,
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
  quickSaveStatus?: 'ready' | 'processing' | 'queued' | 'alreadyQueued' | 'alreadySaved' | 'invalid' | 'failed';
};

function SaveLinkActivity(props: SaveLinkActivityProps) {
  'widget';

  const quickSaveLabels = {
    ready: 'Salvar link',
    processing: 'Salvando link',
    queued: 'Adicionado à fila',
    alreadyQueued: 'Link já guardado',
    alreadySaved: 'Já salvo na biblioteca',
    invalid: 'Link inválido',
    failed: 'Não foi possível salvar',
  } as const;
  const quickSaveSymbols = {
    ready: 'checkmark',
    processing: 'circle.dotted',
    queued: 'checkmark',
    alreadyQueued: 'checkmark',
    alreadySaved: 'checkmark',
    invalid: 'exclamationmark',
    failed: 'xmark',
  } as const;
  const quickSaveStatus = props.quickSaveStatus ?? 'ready';
  const quickSaveCenterTitle = quickSaveStatus === 'queued'
    ? 'Link salvo'
    : quickSaveStatus === 'alreadyQueued'
      ? 'Link já guardado'
      : quickSaveStatus === 'alreadySaved'
        ? 'Já salvo na biblioteca'
        : quickSaveStatus === 'processing'
          ? 'Salvando link'
          : quickSaveStatus === 'invalid'
            ? 'Link inválido'
            : quickSaveStatus === 'failed'
              ? 'Não foi possível salvar'
              : 'Salvar link';
  const quickSaveCenterSubtitle = quickSaveStatus === 'queued'
    ? 'Adicionado à fila'
    : quickSaveStatus === 'alreadyQueued'
      ? 'Adicionado anteriormente'
      : quickSaveStatus === 'alreadySaved'
        ? 'Confirmado na biblioteca'
        : undefined;

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
            frame({ width: 48, height: 48 }),
            clipShape('circle'),
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
              lineLimit(1),
            ]}
          >
            {quickSaveCenterTitle}
          </Text>
          {quickSaveCenterSubtitle ? (
            <Text
              modifiers={[
                font({ textStyle: 'caption' }),
                foregroundStyle('#8E8E93'),
                multilineTextAlignment('center'),
                lineLimit(1),
              ]}
            >
              {quickSaveCenterSubtitle}
            </Text>
          ) : null}
        </VStack>
      </Link>
    ),
    expandedTrailing: (
      <Button
        // The native renderer uses these values for accessibility and the circular state UI.
        label={quickSaveLabels[quickSaveStatus]}
        systemImage={quickSaveSymbols[quickSaveStatus]}
        target="saveapp.quickSave"
      />
    ),
  };
}

export default createLiveActivity<SaveLinkActivityProps>('SaveAppSaveLink', SaveLinkActivity);
