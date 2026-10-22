import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ScrollViewInstance,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { easeGradient } from 'react-native-easing-gradient';

import { PREMIUM_TITLE_ACCESSIBILITY_SWITCH_AT } from '@/components/premium/PremiumScreenCollapsibleTitleConstants';
import { useAppSafeAreaInsets } from '@/providers';
import MaskedView from '@/components/ui/MaskedViewCompat';
import { useAppTheme } from '@/theme';

const MAX_BLUR_INTENSITY = 50;
const FIXED_HEADER_HEIGHT = 100;
const FIXED_HEADER_PADDING_TOP = 60;
const SMALL_HEADER_TITLE_LINE_HEIGHT = 20;
const SMALL_HEADER_TITLE_FONT_SIZE = 17;
const NATIVE_HEADER_PIPELINE_RAISE = 28;
const AnimatedBlurView =
  typeof Animated.createAnimatedComponent === 'function'
    ? Animated.createAnimatedComponent(BlurView)
    : BlurView;
export type ProgressiveCollapsibleScreenProps = {
  children: ReactNode;
  compactTitle: ReactNode;
  compactTitleAccessibilityManaged?: boolean;
  contentGap?: number;
  contentTopInset: number;
  fixedContent?: ReactNode;
  largeTitle: ReactNode;
  largeTitleContainerStyle?: StyleProp<ViewStyle>;
  nativeHeader?: boolean;
  nativeTabRoot?: boolean;
  scrollRef?: Ref<ScrollViewInstance>;
  scrollContentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'onScroll' | 'ref' | 'style'>;
};

export function ProgressiveCollapsibleScreen({
  children,
  compactTitle,
  compactTitleAccessibilityManaged = false,
  contentGap,
  contentTopInset,
  fixedContent,
  largeTitle,
  largeTitleContainerStyle,
  nativeHeader = false,
  nativeTabRoot = false,
  scrollRef,
  scrollContentContainerStyle,
  scrollViewProps,
}: ProgressiveCollapsibleScreenProps) {
  const { resolvedMode, theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [compactTitleActive, setCompactTitleActive] = useState(false);
  const scrollY = useSharedValue(0);
  const isDarkMode = resolvedMode === 'dark';
  const opaqueGradientColor = isDarkMode ? 'rgba(0,0,0,0.99)' : 'rgba(255,255,255,0.99)';
  const solidGradientColor = isDarkMode ? 'black' : 'white';
  const { colors, locations } = easeGradient({
    colorStops: {
      1: { color: 'transparent' },
      0: { color: opaqueGradientColor },
      0.5: { color: solidGradientColor },
    },
  });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const setCompactTitleAccessibility = useCallback((active: boolean) => {
    setCompactTitleActive(active);
  }, []);

  useAnimatedReaction(
    () => scrollY.value >= PREMIUM_TITLE_ACCESSIBILITY_SWITCH_AT,
    (nextCompactTitleActive, previousCompactTitleActive) => {
      if (
        !compactTitleAccessibilityManaged ||
        nextCompactTitleActive === previousCompactTitleActive
      ) {
        return;
      }

      runOnJS(setCompactTitleAccessibility)(nextCompactTitleActive);
    },
    [compactTitleAccessibilityManaged, setCompactTitleAccessibility],
  );

  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [1, 0], Extrapolation.CLAMP),
  }));

  const compactTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [40, 80], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [40, 80], [20, 0], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const headerBackgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 80], [0, 1], Extrapolation.CLAMP),
  }));

  const animatedHeaderBlur = useAnimatedProps(() => ({
    intensity:
      interpolate(scrollY.value, [100, 0], [0, 1], Extrapolation.CLAMP) * MAX_BLUR_INTENSITY,
  }));
  const compactTitleTop =
    FIXED_HEADER_PADDING_TOP +
    (FIXED_HEADER_HEIGHT - FIXED_HEADER_PADDING_TOP - SMALL_HEADER_TITLE_LINE_HEIGHT) / 2;
  const usesRootStackHeaderCoordinates = nativeHeader || (nativeTabRoot && Platform.OS === 'ios');
  const baseRootStackOffset = usesRootStackHeaderCoordinates
    ? Math.max(0, insets.top + theme.sizes.touchTargetMinimum - compactTitleTop)
    : 0;
  const rootStackOffset =
    baseRootStackOffset - (usesRootStackHeaderCoordinates ? NATIVE_HEADER_PIPELINE_RAISE : 0);
  const contentTopOffset =
    Math.max(0, insets.top + contentTopInset - baseRootStackOffset) +
    (usesRootStackHeaderCoordinates ? NATIVE_HEADER_PIPELINE_RAISE : 0);

  const progressiveBlurTint = isDarkMode
    ? Platform.OS === 'ios'
      ? 'systemChromeMaterialDark'
      : 'systemMaterialDark'
    : Platform.OS === 'ios'
      ? 'systemChromeMaterialLight'
      : 'systemMaterialLight';
  const fixedHeaderTint = isDarkMode
    ? Platform.OS === 'ios'
      ? 'dark'
      : 'systemMaterialDark'
    : Platform.OS === 'ios'
      ? 'light'
      : 'systemMaterialLight';
  const compactTitleFontSize = SMALL_HEADER_TITLE_FONT_SIZE + (nativeTabRoot ? 1 : 0);

  const fixedHeaderContent = (
    <View
      accessibilityElementsHidden={compactTitleAccessibilityManaged && !compactTitleActive}
      importantForAccessibility={
        compactTitleAccessibilityManaged && !compactTitleActive ? 'no-hide-descendants' : 'auto'
      }
      pointerEvents="none"
      style={styles.fixedHeaderContent}
    >
      {typeof compactTitle === 'string' || typeof compactTitle === 'number' ? (
        <Animated.Text
          style={[
            styles.smallHeaderTitle,
            { color: theme.colors.textPrimary, fontSize: compactTitleFontSize },
          ]}
        >
          {compactTitle}
        </Animated.Text>
      ) : (
        compactTitle
      )}
    </View>
  );
  const fixedHeaderBlur = (
    <AnimatedBlurView
      animatedProps={animatedHeaderBlur}
      pointerEvents="none"
      tint={fixedHeaderTint}
      style={StyleSheet.absoluteFill}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.pipeline, { marginTop: rootStackOffset }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 150,
              zIndex: 10,
            },
            headerBackgroundStyle,
          ]}
        >
          <MaskedView
            maskElement={
              <LinearGradient
                locations={locations as [number, number, ...number[]]}
                colors={colors as [string, string, ...string[]]}
                style={StyleSheet.absoluteFill}
              />
            }
            style={StyleSheet.absoluteFill}
          >
            <LinearGradient
              colors={
                isDarkMode ? ['black', 'rgba(0, 0, 0, 0.2)'] : ['white', 'rgba(255, 255, 255, 0.2)']
              }
              style={StyleSheet.absoluteFill}
            />
            <BlurView intensity={15} tint={progressiveBlurTint} style={StyleSheet.absoluteFill} />
          </MaskedView>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.fixedHeader, compactTitleStyle]}>
          {fixedHeaderContent}
          {fixedHeaderBlur}
        </Animated.View>
        <Animated.ScrollView
          {...scrollViewProps}
          alwaysBounceVertical={Platform.OS === 'ios'}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          ref={scrollRef}
          scrollEventThrottle={16}
          onScroll={onScroll}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: theme.layout.screenHorizontalPadding,
              paddingTop: contentTopOffset,
              paddingBottom: Math.max(100, insets.bottom + theme.spacing.lg),
            },
            scrollContentContainerStyle,
          ]}
          showsVerticalScrollIndicator={scrollViewProps?.showsVerticalScrollIndicator ?? false}
        >
          <View style={[styles.content, { gap: contentGap ?? theme.spacing.lg }]}>
            <Animated.View
              accessibilityElementsHidden={compactTitleAccessibilityManaged && compactTitleActive}
              importantForAccessibility={
                compactTitleAccessibilityManaged && compactTitleActive
                  ? 'no-hide-descendants'
                  : 'auto'
              }
              style={[styles.largeTitle, largeTitleContainerStyle, largeTitleStyle]}
            >
              {largeTitle}
            </Animated.View>
            {children}
          </View>
        </Animated.ScrollView>
      </View>
      {fixedContent ? (
        <View pointerEvents="box-none" style={styles.fixedContent}>
          {fixedContent}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedContent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  pipeline: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: FIXED_HEADER_HEIGHT,
    paddingTop: FIXED_HEADER_PADDING_TOP,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 11,
    overflow: 'hidden',
  },
  fixedHeaderContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallHeaderTitle: {
    fontSize: SMALL_HEADER_TITLE_FONT_SIZE,
    fontWeight: '600',
    lineHeight: SMALL_HEADER_TITLE_LINE_HEIGHT,
  },
  content: {
    width: '100%',
  },
  largeTitle: {
    width: '100%',
  },
});
