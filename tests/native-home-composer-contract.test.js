/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const composerSource = readSource('../src/components/homeContent/HomeContentComposer.tsx');
const swiftUIComposerSource = readSource(
  '../src/components/homeContent/HomeContentComposerSwiftUI.ios.tsx',
);
const linkSavingSource = readSource(
  '../src/components/homeContent/HomeContentComposerLinkSavingSwiftUI.ios.tsx',
);
const controllerSource = readSource(
  '../src/components/homeContent/HomeContentComposerController.ts',
);
const tabsLayoutSource = readSource('../src/app/(tabs)/_layout.tsx');
const rootLayoutSource = readSource('../src/app/_layout.tsx');
const composeRouteSource = readSource('../src/app/texts/compose.tsx');
const homeSource = readSource('../src/app/(tabs)/index.tsx');
const gallerySource = readSource('../src/components/photos/PhotoMasonryGallery.tsx');

describe('home link and text composer presentation contract', () => {
  test('keeps the UIKit link prompt and its existing retry flow', () => {
    expect(composerSource).toMatch(/kind === 'link' && Platform\.OS === 'ios'/);
    expect(composerSource).toMatch(/Alert\.prompt\(/);
    expect(composerSource).toMatch(/'Adicionar link'/);
    expect(composerSource).toMatch(/submitLinkFromNativePrompt/);
    expect(composerSource).toMatch(/'Tentar novamente'/);
    expect(composerSource).toMatch(/presentPromptRef\.current\(retryValue\)/);
    expect(composerSource).toMatch(/HomeContentComposerLinkSavingSwiftUI\.ios/);
    expect(composerSource).toMatch(/function AddLinkFallback/);
    expect(composerSource).not.toMatch(/kind === 'text'/);
    expect(swiftUIComposerSource).not.toMatch(/Adicionar link|useLinkComposerController/);
  });

  test('opens a dedicated root Native Stack card while keeping the tabs mounted underneath', () => {
    expect(tabsLayoutSource).toMatch(/<NativeTabs\s+hidden=\{Platform\.OS === 'ios'\}[\s\S]*?<NativeTabs\.Trigger name="settings"/);
    expect(homeSource).toMatch(/router\.push\(TEXT_COMPOSER_ROUTE\)/);
    expect(homeSource).toMatch(/<HomeContentComposer\s+kind=\{composerKind\}/);
    expect(rootLayoutSource).toMatch(/<Stack\.Screen[\s\S]*?name="texts\/compose"[\s\S]*?presentation: 'card'/);
    expect(rootLayoutSource).toMatch(/name="\(tabs\)"/);
    expect(composeRouteSource).toMatch(/router\.back\(\)/);
    expect(composeRouteSource).toMatch(/Stack\.Screen\.BackButton displayMode="minimal"/);
    expect(composeRouteSource).not.toMatch(/<Modal|NativeSheet|BottomSheet|router\.replace\(/);
    expect(composerSource).not.toMatch(/HomeContentComposerSwiftUI\.ios/);
  });

  test('shows the large creation title above the editor in native and fallback composers', () => {
    expect(composeRouteSource).toMatch(/<NativeTextComposerView[\s\S]*?title="Adicionar texto"/);
    expect(composeRouteSource).toMatch(/<TextComposerFallback[\s\S]*?title="Adicionar texto"/);
    expect(composeRouteSource).toMatch(/accessibilityRole="header"[\s\S]*?theme\.typography\.largeTitle/);
    expect(composeRouteSource).toMatch(/KeyboardAvoidingView[\s\S]*?behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
    expect(swiftUIComposerSource).toMatch(/font\(\{ textStyle: 'largeTitle', design: 'rounded', weight: 'bold' \}\)/);
    expect(swiftUIComposerSource).toMatch(/foregroundStyle\(theme\.colors\.textPrimary\)/);
    expect(swiftUIComposerSource.indexOf('{title}')).toBeLessThan(
      swiftUIComposerSource.indexOf('<VStack\n            alignment="leading"'),
    );
    expect(swiftUIComposerSource).toMatch(/alignment="leading"[\s\S]*?spacing=\{theme\.spacing\.md\}/);
  });

  test('uses one full-frame interactive Glass surface and waits for Native Stack transition before focusing', () => {
    for (const nativeControl of [
      'Host',
      'ZStack',
      'VStack',
      'HStack',
      'Text',
      'TextField',
      'Button',
      'ProgressView',
    ]) {
      expect(swiftUIComposerSource).toContain(nativeControl);
    }

    expect(swiftUIComposerSource).toMatch(/ignoreSafeArea="container"/);
    expect(swiftUIComposerSource).toMatch(/matchContents=\{false\}/);
    expect(swiftUIComposerSource).toMatch(/axis="vertical"/);
    expect(swiftUIComposerSource).toMatch(/lineLimit\(\{ min: 1, max: 12 \}\)/);
    expect(swiftUIComposerSource).toMatch(/textSelection\(true\)/);
    expect(swiftUIComposerSource).toMatch(/placeholder="Comece a escrever\.\.\."/);
    expect(swiftUIComposerSource).toMatch(/<TextField[\s\S]*?ref=\{textFieldRef\}/);
    expect(swiftUIComposerSource).toMatch(/textFieldRef\.current\?\.focus\(\)/);
    expect(swiftUIComposerSource).not.toMatch(/autoFocus/);
    expect(swiftUIComposerSource).toMatch(/const CARD_CORNER_RADIUS = 36/);
    expect(swiftUIComposerSource).toMatch(/glassEffect\(\{[\s\S]*?variant: 'regular', interactive: true/);
    expect(swiftUIComposerSource).toMatch(/cornerRadius: cardCornerRadius,[\s\S]*?shape: 'roundedRectangle'/);
    expect(swiftUIComposerSource).toMatch(/shapes\.roundedRectangle\(\{\s*cornerRadius: cardCornerRadius/);
    expect(swiftUIComposerSource).not.toMatch(/MIN_CARD_CORNER_RADIUS|MAX_CARD_CORNER_RADIUS/);
    expect(swiftUIComposerSource).not.toMatch(/clipShape|contentShape/);
    expect(swiftUIComposerSource).toMatch(/frame\(\{ height: cardHeight \}\),[\s\S]*?frame\(\{ maxWidth: Infinity, alignment: 'topLeading' \}\),[\s\S]*?cardSurfaceModifier/);
    expect(swiftUIComposerSource).toMatch(/buttonStyle\('glass'\)/);
    expect(swiftUIComposerSource).toMatch(/controlSize\('regular'\)/);
    expect(swiftUIComposerSource).toMatch(/buttonBorderShape\('capsule'\)/);
    expect(swiftUIComposerSource).not.toMatch(/glassProminent|borderedProminent|tint\(theme\.colors\.contrastSurface\)/);
    expect(swiftUIComposerSource).toMatch(/background\(theme\.colors\.background\)/);
    expect(swiftUIComposerSource).toMatch(/disabled\(isSaving \|\| !canSave\)/);
    expect(swiftUIComposerSource).toMatch(/\{isSaving \? <ProgressView \/> : null\}/);
    expect(swiftUIComposerSource).toMatch(/font\(\{ textStyle: 'body', weight: 'semibold' \}\)/);
    expect(swiftUIComposerSource).toMatch(/foregroundStyle\(resolvedMode === 'dark' \? '#FFFFFF' : '#000000'\)/);
    const saveButton = swiftUIComposerSource.match(/<Button[\s\S]*?<\/Button>/)?.[0] ?? '';
    expect(saveButton).toMatch(/buttonStyle\('glass'\)/);
    expect(saveButton).toMatch(/controlSize\('regular'\)/);
    expect(saveButton).toMatch(/buttonBorderShape\('capsule'\)/);
    expect(saveButton).toMatch(/>\s*Salvar\s*<\/Text>/);
    expect(saveButton).not.toMatch(/frame\(|padding\(/);
    expect(swiftUIComposerSource).not.toMatch(/\{(?:canSave|isSaving)\s*&&\s*<Button/);
    expect((swiftUIComposerSource.match(/<Button\b/g) ?? []).length).toBe(1);
    expect((swiftUIComposerSource.match(/glassEffect\(/g) ?? []).length).toBe(1);
    expect(swiftUIComposerSource).not.toMatch(/Close|Fechar|Cancelar|onTapGesture|onDragGesture|Gesture\.Pan/);
    expect(swiftUIComposerSource).not.toMatch(/Modal|NativeSheet|TextInput|Pressable|TouchableOpacity/);
    expect(swiftUIComposerSource).not.toMatch(/setTimeout|requestAnimationFrame|Keyboard\.addListener/);
    expect(composeRouteSource).toMatch(/useNavigation<NativeStackNavigationProp/);
    expect(composeRouteSource).toMatch(/navigation\.addListener\('transitionEnd'/);
    expect(composeRouteSource).toMatch(/closing: event\.data\.closing/);
    expect(composeRouteSource).toMatch(/setShouldFocusInput\(true\)/);
    expect(composeRouteSource).toMatch(/unsubscribe\(\)/);
    expect(composeRouteSource).toMatch(/textInputRef\.current\?\.focus\(\)/);
    expect(composeRouteSource).not.toMatch(/autoFocus|setTimeout|requestAnimationFrame/);
  });

  test('uses native back removal protection for drafts and returns after confirmed save', () => {
    expect(composeRouteSource).toMatch(/usePreventRemove\(shouldPreventRemoval/);
    expect(composeRouteSource).toMatch(/gestureEnabled: !isSaving/);
    expect(composeRouteSource).toMatch(/Alert\.alert\('Descartar rascunho\?'/);
    expect(composeRouteSource).toMatch(/Continuar escrevendo/);
    expect(composeRouteSource).toMatch(/repeat\(\)/);
    expect(composeRouteSource).toMatch(/const saved = await submit\(value\)/);
    expect(composeRouteSource).toMatch(/disableRemovalPrevention\(\)/);
    expect(composeRouteSource).toMatch(/router\.back\(\)/);
    expect(controllerSource).toMatch(/saveText\(text, controller\.signal\)/);
    expect(controllerSource).toMatch(/textAbortController\.current \|\| !isMounted\.current/);
    expect(controllerSource).toMatch(/Não foi possível salvar o texto/);
  });

  test('reveals a saved text after returning without changing scroll on cancel', () => {
    expect(homeSource).toMatch(/useFocusEffect\(/);
    expect(homeSource).toMatch(/consumePendingTextReveal\(\)/);
    expect(homeSource).toMatch(/revealSavedTextId=\{revealSavedTextId\}/);
    expect(gallerySource).toMatch(/hasSavedTextGalleryEntry\(entries, revealSavedTextId\)/);
    expect(gallerySource).toMatch(/scrollToOffset\(\{ offset: 0, animated: !reduceMotionEnabled \}\)/);
    expect(gallerySource).toMatch(/lastRevealedTextIdRef/);
    expect(homeSource).toMatch(/<HomeContentComposer/);
  });

  test('keeps the non-blocking native link progress feedback', () => {
    expect(linkSavingSource).toMatch(/<Host[\s\S]*?matchContents=\{false\}/);
    expect(linkSavingSource).toMatch(/pointerEvents="none"/);
    expect(linkSavingSource).toMatch(/<ProgressView/);
    expect(linkSavingSource).toMatch(/Salvando link/);
    expect(linkSavingSource).toMatch(/material: 'regular'/);
    expect(linkSavingSource).not.toMatch(/Rectangle|Modal|Alert|NavigationStack/);
  });
});
