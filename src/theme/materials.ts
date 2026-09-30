/**
 * Material capability detection — the ONLY place RoadPing decides how a
 * floating surface is drawn. Components ask `useTheme().material` and render
 * through <GlassSurface>; nothing else checks for glass or blur support.
 *
 * Detection is capability-based, never by OS version string or device model:
 *
 *   1. Native Liquid Glass — the ExpoGlassEffect native module is linked into
 *      this binary, the UIGlassEffect API exists at runtime
 *      (isGlassEffectAPIAvailable) and the app is actually running with the
 *      Liquid Glass design (isLiquidGlassAvailable: iOS 26+ built with Xcode
 *      26, no UIDesignRequiresCompatibility opt-out).
 *   2. System blur material — the ExpoBlurView native module is linked
 *      (UIVisualEffectView system materials; every supported iOS).
 *   3. Solid semantic surface — anything else (e.g. a JS bundle running on an
 *      older binary that predates these modules). Never a crash.
 *
 * The user's Reduce Transparency setting is applied on top of this in
 * ThemeProvider, where it forces the opaque surface.
 */
import type React from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { GlassContainerProps, GlassViewProps } from 'expo-glass-effect';
import type { BlurViewProps } from 'expo-blur';

/** How floating surfaces render right now. */
export type MaterialMode =
  /** Native iOS Liquid Glass (UIGlassEffect). */
  | 'glass'
  /** Native iOS system material blur (UIBlurEffect). */
  | 'blur'
  /** Opaque, high-legibility surface (Reduce Transparency). */
  | 'opaque'
  /** Plain semantic surface when no native material exists. */
  | 'solid';

export interface GlassLib {
  GlassView: React.ComponentType<GlassViewProps>;
  GlassContainer: React.ComponentType<GlassContainerProps>;
}

export interface BlurLib {
  BlurView: React.ComponentType<BlurViewProps>;
}

let glassLib: GlassLib | null | undefined;
let blurLib: BlurLib | null | undefined;

function warn(what: string, err: unknown) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[RoadPing] ${what} unavailable, using fallback material`, err);
  }
}

/** Native Liquid Glass components, or null when this runtime can't use them. */
export function getGlassLib(): GlassLib | null {
  if (glassLib !== undefined) return glassLib;
  glassLib = null;
  if (Platform.OS !== 'ios') return glassLib;
  if (requireOptionalNativeModule('ExpoGlassEffect') === null) return glassLib;
  try {
    // Required lazily so an older binary without the module never evaluates it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-glass-effect') as typeof import('expo-glass-effect');
    if (mod.isGlassEffectAPIAvailable() && mod.isLiquidGlassAvailable()) {
      glassLib = { GlassView: mod.GlassView, GlassContainer: mod.GlassContainer };
    }
  } catch (err) {
    warn('Liquid Glass', err);
  }
  return glassLib;
}

/** Native system-material blur, or null when the module isn't linked. */
export function getBlurLib(): BlurLib | null {
  if (blurLib !== undefined) return blurLib;
  blurLib = null;
  if (Platform.OS !== 'ios') return blurLib;
  if (requireOptionalNativeModule('ExpoBlurView') === null) return blurLib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-blur') as typeof import('expo-blur');
    blurLib = { BlurView: mod.BlurView };
  } catch (err) {
    warn('System blur', err);
  }
  return blurLib;
}

/** Best material this binary + OS can draw, before user preferences. */
export function detectMaterialCapability(): Exclude<MaterialMode, 'opaque'> {
  if (getGlassLib() !== null) return 'glass';
  if (getBlurLib() !== null) return 'blur';
  return 'solid';
}

/** Apply the user's Reduce Transparency preference to the capability. */
export function resolveMaterialMode(
  capability: Exclude<MaterialMode, 'opaque'>,
  reduceTransparency: boolean,
): MaterialMode {
  return reduceTransparency ? 'opaque' : capability;
}
