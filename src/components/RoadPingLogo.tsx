/**
 * RoadPingLogo — the RoadPing mark: a map pin whose head holds a "ping"
 * (a ring and a dot). One flat brand color, so it reads the same on light and
 * dark backgrounds and at any size, from header glyph to hero.
 *
 * Geometry matches assets/brand/roadping-mark.svg (120×120 viewBox), which is
 * generated with every other brand asset by scripts/brand/generate.py.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { BRAND } from '@/theme/palette';

const MARK_PATH =
  'M60 104 L35.24 57.07 A28 28 0 1 1 84.76 57.07 Z ' +
  'M74 44 A14 14 0 1 0 46 44 A14 14 0 1 0 74 44 Z ' +
  'M67 44 A7 7 0 1 0 53 44 A7 7 0 1 0 67 44 Z';

interface RoadPingLogoProps {
  /** Rendered width & height in px (square). Default 108. */
  size?: number;
  /** Fill color. Defaults to brand orange. */
  color?: string;
}

export function RoadPingLogo({ size = 108, color = BRAND.orange }: RoadPingLogoProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      accessibilityRole="image"
      accessibilityLabel="RoadPing logo"
    >
      <Path d={MARK_PATH} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
