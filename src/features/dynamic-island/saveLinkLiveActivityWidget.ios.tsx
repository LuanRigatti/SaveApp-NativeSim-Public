import { Button, Divider, HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  background,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  resizable,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

type SaveLinkActivityProps = {
  iconUri: string;
  composeUrl: string;
  expandedHomeUrl: string;
  quickSaveStatus?: 'ready' | 'processing' | 'queued' | 'alreadyQueued' | 'alreadySaved' | 'invalid' | 'failed';
  showRecentQuickSaveLinks?: boolean;
  recentQuickSaveLinksRevision?: number;
  recentQuickSaveLinks?: { domain: string; createdAt: number; faviconUri?: string }[];
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
        : quickSaveStatus === 'ready'
          ? 'Pronto para salvar'
        : undefined;
  const recentQuickSaveLinks = props.showRecentQuickSaveLinks
    ? (props.recentQuickSaveLinks ?? []).slice(0, 3)
    : [];
  const recentQuickSaveLinksCountLabel = recentQuickSaveLinks.length === 1
    ? '1 recente'
    : `${recentQuickSaveLinks.length} recentes`;

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 14, vertical: 10 })]}>
        <Link destination={props.expandedHomeUrl}>
          <HStack alignment="center" spacing={12}>
            <Image
              uiImage={props.iconUri}
              modifiers={[resizable(), frame({ width: 34, height: 34 }), clipShape('roundedRectangle', 8)]}
            />
            <VStack alignment="leading" spacing={2}>
              <Text modifiers={[font({ weight: 'semibold' }), foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>Salvar link</Text>
              <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>Toque para abrir</Text>
            </VStack>
            <Spacer minLength={8} />
            <Image
              systemName="chevron.right"
              size={13}
              modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}
            />
          </HStack>
        </Link>
        {recentQuickSaveLinks.length > 0 ? (
          <>
            <Divider modifiers={[foregroundStyle({ type: 'hierarchical', style: 'tertiary' })]} />
            <VStack alignment="leading" spacing={3}>
              {recentQuickSaveLinks.map((link) => (
                <HStack
                  key={`${link.domain}-${link.createdAt}`}
                  alignment="center"
                  spacing={10}
                  modifiers={[frame({ maxWidth: Infinity })]}
                >
                  {link.faviconUri ? (
                    <Image
                      uiImage={link.faviconUri}
                      modifiers={[
                        resizable(),
                        frame({ width: 18, height: 18 }),
                        clipShape('roundedRectangle', 4),
                        frame({ width: 24, height: 24, alignment: 'center' }),
                      ]}
                    />
                  ) : (
                    <Image
                      systemName="globe"
                      size={18}
                      modifiers={[
                        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                        frame({ width: 24, height: 24, alignment: 'center' }),
                      ]}
                    />
                  )}
                  <Text
                    modifiers={[
                      font({ textStyle: 'subheadline' }),
                      lineLimit(1),
                      frame({ maxWidth: Infinity, alignment: 'leading' }),
                    ]}
                  >
                    {link.domain}
                  </Text>
                  <Spacer minLength={6} />
                  <Text
                    date={new Date(link.createdAt)}
                    dateStyle="time"
                    modifiers={[
                      font({ textStyle: 'caption' }),
                      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                      lineLimit(1),
                      monospacedDigit(),
                      frame({ minWidth: 56, alignment: 'trailing' }),
                    ]}
                  />
                </HStack>
              ))}
            </VStack>
          </>
        ) : null}
      </VStack>
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
          modifiers={[resizable(), frame({ width: 48, height: 48 }), clipShape('roundedRectangle', 12)]}
        />
      </Link>
    ),
    expandedCenter: (
      <Link destination={props.expandedHomeUrl} modifiers={[tint('#FFFFFF')]}>
        <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
          <Text
            modifiers={[
              font({ weight: 'semibold', textStyle: 'headline' }),
              foregroundStyle('#FFFFFF'),
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
    expandedBottom: recentQuickSaveLinks.length > 0 ? (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[frame({ maxWidth: Infinity }), padding({ top: 2 })]}
      >
        <Divider modifiers={[foregroundStyle('#38383A')]} />
        <HStack alignment="center" spacing={4} modifiers={[frame({ maxWidth: Infinity })]}>
          <Image
            systemName="clock"
            size={14}
            modifiers={[foregroundStyle('#8E8E93')]}
          />
          <Text
            modifiers={[
              font({ textStyle: 'caption2' }),
              foregroundStyle('#8E8E93'),
              lineLimit(1),
            ]}
          >
            {recentQuickSaveLinksCountLabel}
          </Text>
          {recentQuickSaveLinks.map((link) => (
            <HStack
              key={`${link.domain}-${link.createdAt}`}
              alignment="center"
              spacing={3}
              modifiers={[
                padding({ horizontal: 5, vertical: 4 }),
                background('#1C1C1E', shapes.capsule()),
              ]}
            >
              {link.faviconUri ? (
                <Image
                  uiImage={link.faviconUri}
                  modifiers={[resizable(), frame({ width: 14, height: 14 }), clipShape('roundedRectangle', 3)]}
                />
              ) : (
                <Image
                  systemName="globe"
                  size={12}
                  modifiers={[foregroundStyle('#A1A1A6'), frame({ width: 14, height: 14, alignment: 'center' })]}
                />
              )}
              <Text
                modifiers={[
                  font({ textStyle: 'caption2' }),
                  foregroundStyle('#D1D1D6'),
                  lineLimit(1),
                  frame({ maxWidth: 56 }),
                ]}
              >
                {link.domain}
              </Text>
            </HStack>
          ))}
        </HStack>
      </VStack>
    ) : undefined,
  };
}

export default createLiveActivity<SaveLinkActivityProps>('SaveAppSaveLink', SaveLinkActivity);
