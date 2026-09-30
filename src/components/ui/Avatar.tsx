/**
 * Avatar — profile photo or initial, with an optional status ring.
 *
 *   ring="live"    red — this person is speaking right now
 *   ring="accent"  your accent — selected / you
 */
import React from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

export interface AvatarProps {
  name: string | null | undefined;
  uri?: string | null;
  size?: number;
  ring?: 'live' | 'accent';
  /** Use the accent tint for the initial background (the signed-in user). */
  self?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function initialFor(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : '?';
}

export function Avatar({ name, uri, size = 40, ring, self = false, style }: AvatarProps) {
  const { colors, accent } = useTheme();
  const ringWidth = size >= 64 ? 3 : 2;
  const ringColor = ring === 'live' ? colors.live : ring === 'accent' ? accent.fill : null;
  const inner = ringColor !== null ? size - ringWidth * 2 - 2 : size;

  const face =
    uri != null && uri.length > 0 ? (
      <Image
        source={{ uri }}
        style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        accessibilityIgnoresInvertColors
      />
    ) : (
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: self ? accent.muted : colors.surfaceSecondary,
        }}
      >
        <AppText
          allowFontScaling={false}
          weight="semibold"
          style={{
            fontSize: inner * 0.42,
            lineHeight: inner * 0.52,
            color: self ? accent.text : colors.textSecondary,
          }}
        >
          {initialFor(name)}
        </AppText>
      </View>
    );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ringColor !== null && { borderWidth: ringWidth, borderColor: ringColor },
        style,
      ]}
    >
      {face}
    </View>
  );
}
