/**
 * RoadPingLogo — the official RoadPing logomark.
 *
 * Fuses the three brand ideas: a map-pin (location) + radar waves (live voice
 * broadcast to nearby drivers) + a perspective road converging at the pin.
 * Ported 1:1 from the brand design system (assets/roadping-mark.svg, 120×120
 * viewBox) so it renders crisply at any size — header glyph through hero.
 *
 * Colors come straight from the brand: #FF6B35 → #FFB347 gradient pin, amber
 * inner ring, orange outer ring + road. Single source of truth for the symbol.
 */
import React from 'react';
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

interface RoadPingLogoProps {
  /** Rendered width & height in px (square). Default 108. */
  size?: number;
  /** Hide the perspective road beneath the pin (e.g. tiny header glyph). */
  road?: boolean;
}

export function RoadPingLogo({ size = 108, road = true }: RoadPingLogoProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      accessibilityRole="image"
      accessibilityLabel="RoadPing logo"
    >
      <Defs>
        <LinearGradient
          id="rpPinGradient"
          x1="38"
          y1="20"
          x2="82"
          y2="90"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#FF6B35" />
          <Stop offset="1" stopColor="#FFB347" />
        </LinearGradient>
      </Defs>

      {/* Radar rings — open at the bottom, centered on the pin head */}
      <G fill="none" strokeLinecap="round">
        <Path
          d="M82.3 80.4 A41 41 0 1 0 37.7 80.4"
          stroke="#FF6B35"
          strokeWidth={3.4}
          opacity={0.4}
        />
        <Path
          d="M77.8 71.4 A31 31 0 1 0 42.2 71.4"
          stroke="#FFB347"
          strokeWidth={4}
          opacity={0.85}
        />
      </G>

      {/* Perspective road converging at the pin's vanishing point */}
      {road && (
        <G strokeLinecap="round" fill="none">
          <Path
            d="M31 113 L54.5 92.5"
            stroke="#FF6B35"
            strokeWidth={4.2}
            opacity={0.85}
          />
          <Path
            d="M89 113 L65.5 92.5"
            stroke="#FF6B35"
            strokeWidth={4.2}
            opacity={0.85}
          />
          <Path
            d="M60 113 L60 95"
            stroke="#FF6B35"
            strokeWidth={3.6}
            strokeDasharray={[3, 6]}
            opacity={0.95}
          />
        </G>
      )}

      {/* Map-pin with evenodd counter cut-out */}
      <Path
        d="M60 90 C49.5 74 38 65 38 46 A22 22 0 1 1 82 46 C82 65 70.5 74 60 90 Z M68 46 a8 8 0 1 0 -16 0 a8 8 0 1 0 16 0 Z"
        fill="url(#rpPinGradient)"
        fillRule="evenodd"
      />
    </Svg>
  );
}
