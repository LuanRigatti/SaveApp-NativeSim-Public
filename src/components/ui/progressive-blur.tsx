import { BlurView, type BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from './MaskedViewCompat';

type ProgressiveBlurMaskProps = {
  children: ReactNode;
  colors: readonly [ColorValue, ColorValue, ColorValue, ColorValue, ColorValue];
  locations: readonly [number, number, number, number, number];
  style?: StyleProp<ViewStyle>;
};

export function ProgressiveBlurMask({
  children,
  colors,
  locations,
  style,
}: ProgressiveBlurMaskProps) {
  return (
    <MaskedView
      pointerEvents="none"
      style={style}
      maskElement={
        <LinearGradient colors={colors} locations={locations} style={StyleSheet.absoluteFill} />
      }
    >
      {children}
    </MaskedView>
  );
}

export type ProgressiveBlurProps = {
  height: number;
  fadeStart?: number;
  edge?: 'top' | 'bottom';
  intensity?: number;
  layers?: number;
  tint?: BlurTint;
  overlayColors?: readonly [ColorValue, ColorValue, ColorValue] | null;
  style?: StyleProp<ViewStyle>;
};

/**
 * Progressive backdrop blur built only from public Expo APIs.
 * Render it after the content it should sample.
 */
export function ProgressiveBlur({
  height,
  fadeStart = Math.max(height - 64, 0),
  edge = 'top',
  intensity = 70,
  layers = 6,
  tint = 'systemUltraThinMaterial',
  overlayColors,
  style,
}: ProgressiveBlurProps) {
  const layerCount = clamp(Math.round(layers), 1, 6);
  const safeHeight = Math.max(height, 1);
  const resolvedFadeStart = clamp(fadeStart, 0, safeHeight);
  const fadeDistance = safeHeight - resolvedFadeStart;
  const fadeEnd = Math.max(resolvedFadeStart, safeHeight - Math.min(2, fadeDistance * 0.08));
  const layerIntensity = clamp(intensity, 1, 100) / layerCount;

  return (
    <View pointerEvents="none" style={[styles.container, { height }, style]}>
      {Array.from({ length: layerCount }, (_, index) => {
        const bandStart =
          resolvedFadeStart + (fadeEnd - resolvedFadeStart) * (index / layerCount) * 0.55;
        const softEnd = bandStart + (fadeEnd - bandStart) * 0.72;
        const maskLocations: readonly [number, number, number, number, number] =
          edge === 'top'
            ? [0, bandStart / safeHeight, softEnd / safeHeight, fadeEnd / safeHeight, 1]
            : [
                0,
                1 - fadeEnd / safeHeight,
                1 - softEnd / safeHeight,
                1 - bandStart / safeHeight,
                1,
              ];
        const maskColors: readonly [ColorValue, ColorValue, ColorValue, ColorValue, ColorValue] =
          edge === 'top'
            ? ['#000000', '#000000', 'rgba(0, 0, 0, 0.18)', 'transparent', 'transparent']
            : ['transparent', 'transparent', 'rgba(0, 0, 0, 0.18)', '#000000', '#000000'];

        return (
          <ProgressiveBlurMask
            key={index}
            style={StyleSheet.absoluteFill}
            colors={maskColors}
            locations={maskLocations}
          >
            <BlurView intensity={layerIntensity} tint={tint} style={StyleSheet.absoluteFill} />
          </ProgressiveBlurMask>
        );
      })}
      {overlayColors ? (
        <LinearGradient
          colors={overlayColors}
          locations={
            edge === 'top'
              ? [0, resolvedFadeStart / safeHeight, 1]
              : [0, 1 - resolvedFadeStart / safeHeight, 1]
          }
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
