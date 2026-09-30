/**
 * GlassSurface — the one material primitive for floating UI.
 *
 * Screens never decide how glass is drawn. They say "this floats over
 * content" and GlassSurface picks the right implementation from the resolved
 * theme (see theme/materials.ts):
 *
 *   glass   → native Liquid Glass (UIGlassEffect via expo-glass-effect).
 *             Tint, clarity and the iOS 26/27 Liquid Glass personalization
 *             (clear ↔ tinted) are rendered by the system; we pass no opacity.
 *   blur    → native system material (UIBlurEffect "chrome"/"ultra thin"),
 *             the pre-Liquid-Glass iOS look, which adapts to light/dark.
 *   opaque  → Reduce Transparency: a solid, higher-contrast surface with a
 *             visible edge. No translucency at all.
 *   solid   → plain semantic surface when no native material is linked.
 *
 * Use it for functional layers only: map header, map controls, the Voice
 * Dock, the speaker capsule, sheets over the map. Not for rows, cards,
 * forms, or reading surfaces.
 *
 * `variant="clear"` is only for small controls where the map beneath is
 * meant to show through and the glyph on top has guaranteed contrast.
 */
import React from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { getBlurLib, getGlassLib } from '@/theme/materials';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';

export interface GlassSurfaceProps extends ViewProps {
  variant?: 'regular' | 'clear';
  /** Native press response (scale/shimmer) — for tappable glass only. */
  interactive?: boolean;
  radius?: number;
  /**
   * Semantic tint, e.g. the live color on a transmitting control. On glass
   * the system blends it into the material; elsewhere it becomes the fill.
   */
  tint?: string;
  /** Soft shadow for non-glass modes so the surface lifts off the map. */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassSurface({
  variant = 'regular',
  interactive = false,
  radius = 0,
  tint,
  floating = true,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const { material, colors } = useTheme();
  const styles = useStyles();
  const shape: ViewStyle = { borderRadius: radius, borderCurve: 'continuous' };

  if (material === 'glass') {
    const glass = getGlassLib();
    if (glass !== null) {
      const { GlassView } = glass;
      return (
        <GlassView
          glassEffectStyle={variant}
          isInteractive={interactive}
          tintColor={tint}
          style={[shape, style]}
          {...rest}
        >
          {children}
        </GlassView>
      );
    }
  }

  if (material === 'blur' && tint === undefined) {
    const blur = getBlurLib();
    if (blur !== null) {
      const { BlurView } = blur;
      return (
        <View
          style={[shape, styles.blurFrame, floating && styles.shadow, style]}
          {...rest}
        >
          <View style={[StyleSheet.absoluteFill, shape, styles.clip]} pointerEvents="none">
            <BlurView
              tint={variant === 'clear' ? 'systemUltraThinMaterial' : 'systemChromeMaterial'}
              intensity={100}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {children}
        </View>
      );
    }
  }

  const fill =
    tint ?? (material === 'opaque' ? colors.surfaceOpaque : colors.surface);
  return (
    <View
      style={[
        shape,
        { backgroundColor: fill },
        material === 'opaque' ? styles.opaqueEdge : styles.solidEdge,
        floating && styles.shadow,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/**
 * Groups neighbouring glass shapes so native Liquid Glass can blend and
 * morph them together. A plain View in every other material mode.
 */
export function GlassGroup({
  spacing,
  style,
  children,
  ...rest
}: ViewProps & { spacing?: number }) {
  const { material } = useTheme();
  const glass = material === 'glass' ? getGlassLib() : null;
  if (glass !== null) {
    const { GlassContainer } = glass;
    return (
      <GlassContainer spacing={spacing} style={style} {...rest}>
        {children}
      </GlassContainer>
    );
  }
  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  blurFrame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.separator,
  },
  clip: {
    overflow: 'hidden',
  },
  solidEdge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.separator,
  },
  opaqueEdge: {
    borderWidth: 1,
    borderColor: t.colors.separatorStrong,
  },
  shadow: {
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: t.scheme === 'dark' ? 0.4 : 0.12,
    shadowRadius: 16,
  },
}));
