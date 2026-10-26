import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  runOnUI,
  type SharedValue,
} from 'react-native-reanimated';
import { easeGradient } from 'react-native-easing-gradient';

import { PREMIUM_TITLE_ACCESSIBILITY_SWITCH_AT } from '@/components/premium/PremiumScreenCollapsibleTitleConstants';
import { useAppSafeAreaInsets } from '@/providers';
import MaskedView from '@/components/ui/MaskedViewCompat';
import {
  getProgressiveBlurOverlayColors,
  progressiveBlurColorWithAlpha,
} from '@/components/ui/progressive-blur';
import { useAppTheme } from '@/theme';

const MAX_BLUR_INTENSITY = 50;
const FIXED_HEADER_HEIGHT = 100;
const FIXED_HEADER_PADDING_TOP = 60;
const SMALL_HEADER_TITLE_LINE_HEIGHT = 20;
const SMALL_HEADER_TITLE_FONT_SIZE = 17;
const NATIVE_HEADER_PIPELINE_RAISE = 28;
function setSharedScrollOffset(sharedValue: SharedValue<number>, offset: number) {
  'worklet';
  sharedValue.value = offset;
}

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
  fixedLargeTitleAccessory?: ReactNode;
  largeTitle: ReactNode;
  largeTitleContainerStyle?: StyleProp<ViewStyle>;
  nativeHeader?: boolean;
  nativeTabRoot?: boolean;
  renderScrollableContent?: (props: ProgressiveCollapsibleScrollContentProps) => ReactNode;
  scrollRef?: Ref<ScrollViewInstance>;
  scrollContentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'onScroll' | 'ref' | 'style'>;
};

export type ProgressiveCollapsibleScrollContentProps = {
  contentContainerStyle: StyleProp<ViewStyle>;
  contentGap: number;
  largeTitle: ReactNode;
  onScroll: NonNullable<ScrollViewProps['onScroll']>;
  showsVerticalScrollIndicator: boolean;
};

export function ProgressiveCollapsibleScreen({
  children,
  compactTitle,
  compactTitleAccessibilityManaged = false,
  contentGap,
  contentTopInset,
  fixedContent,
  fixedLargeTitleAccessory,
  largeTitle,
  largeTitleContainerStyle,
  nativeHeader = false,
  nativeTabRoot = false,
  renderScrollableContent,
  scrollRef,
  scrollContentContainerStyle,
  scrollViewProps,
}: ProgressiveCollapsibleScreenProps) {
  const { resolvedMode, theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [compactTitleActive, setCompactTitleActive] = useState(false);
  const scrollY = useSharedValue(0);
  const isDarkMode = resolvedMode === 'dark';
  const onListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      runOnUI(setSharedScrollOffset)(scrollY, event.nativeEvent.contentOffset.y);
    },
    [scrollY],
  );
  const opaqueGradientColor = progressiveBlurColorWithAlpha(theme.colors.background, 0.99);
  const solidGradientColor = theme.colors.background;
  const { colors, locations } = easeGradient({
    colorStops: {
      1: { color: 'transparent' },
      0: { color: opaqueGradientColor },
      0.5: { color: solidGradientColor },
    },
  });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      setSharedScrollOffset(scrollY, event.contentOffset.y);
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
    ? 'systemUltraThinMaterialDark'
    : 'systemUltraThinMaterialLight';
  const fixedHeaderTint = progressiveBlurTint;
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
  const largeTitleElement = (
    <Animated.View
      accessibilityElementsHidden={compactTitleAccessibilityManaged && compactTitleActive}
      importantForAccessibility={
        compactTitleAccessibilityManaged && compactTitleActive ? 'no-hide-descendants' : 'auto'
      }
      style={[styles.largeTitle, largeTitleContainerStyle, largeTitleStyle]}
    >
      {largeTitle}
    </Animated.View>
  );
  const contentContainerStyle = [
    styles.scrollContent,
    {
      paddingHorizontal: theme.layout.screenHorizontalPadding,
      paddingTop: contentTopOffset,
      paddingBottom: Math.max(100, insets.bottom + theme.spacing.lg),
    },
    scrollContentContainerStyle,
  ];
  const showsVerticalScrollIndicator = scrollViewProps?.showsVerticalScrollIndicator ?? false;

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
            <BlurView intensity={15} tint={progressiveBlurTint} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={getProgressiveBlurOverlayColors(theme.colors.background, 'top')}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.fixedHeader, compactTitleStyle]}>
          {fixedHeaderContent}
          {fixedHeaderBlur}
        </Animated.View>
        {renderScrollableContent ? (
          renderScrollableContent({
            contentContainerStyle,
            contentGap: contentGap ?? theme.spacing.lg,
            largeTitle: largeTitleElement,
            onScroll: onListScroll,
            showsVerticalScrollIndicator,
          })
        ) : (
          <Animated.ScrollView
            {...scrollViewProps}
            alwaysBounceVertical={Platform.OS === 'ios'}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            ref={scrollRef}
            scrollEventThrottle={16}
            onScroll={onScroll}
            style={styles.scrollView}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          >
            <View style={[styles.content, { gap: contentGap ?? theme.spacing.lg }]}>
              {largeTitleElement}
              {children}
            </View>
          </Animated.ScrollView>
        )}
      </View>
      {fixedContent ? (
        <View pointerEvents="box-none" style={styles.fixedContent}>
          {fixedContent}
        </View>
      ) : null}
      {fixedLargeTitleAccessory ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.fixedLargeTitleAccessory,
            {
              left: theme.layout.screenHorizontalPadding,
              right: theme.layout.screenHorizontalPadding,
              top: rootStackOffset + contentTopOffset,
            },
          ]}
        >
          {fixedLargeTitleAccessory}
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
  fixedLargeTitleAccessory: {
    alignItems: 'flex-end',
    height: 50,
    justifyContent: 'center',
    position: 'absolute',
    zIndex: 21,
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
