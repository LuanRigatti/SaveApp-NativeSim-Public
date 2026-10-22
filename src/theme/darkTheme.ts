import { animations } from './animations';
import { borders } from './borders';
import { darkColors } from './colors';
import { icons } from './icons';
import { layout } from './layout';
import { opacities } from './opacities';
import { radius } from './radius';
import { createShadows } from './shadows';
import { sizes } from './sizes';
import { spacing } from './spacing';
import { typography } from './typography';
import type { AppTheme } from './types';

export const darkTheme: AppTheme = {
  colors: darkColors,
  typography,
  spacing,
  radius,
  borders,
  shadows: createShadows(darkColors.textPrimary),
  animations,
  icons,
  sizes,
  layout,
  opacities,
};
