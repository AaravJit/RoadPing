/**
 * AppCard — generic surface container.
 *
 * Optionally pressable (pass `onPress`). When not pressable, renders a View.
 * Supports three elevation levels and an optional highlight border.
 */
import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/theme/colors';
import { Radius, Spacing, MIN_TOUCH_TARGET } from '@/theme/spacing';

export type CardElevation = 'flat' | 'raised' | 'floating';

interface AppCardProps {
  children: React.ReactNode;
  elevation?: CardElevation;
  /** Adds a colored border to highlight the card (e.g. live driver) */
  highlight?: 'primary' | 'live' | 'success' | 'warning' | 'error';
  onPress?: () => void;
  style?: ViewStyle;
  /** Padding inside the card */
  padded?: boolean;
  accessibilityLabel?: string;
}

const HIGHLIGHT_COLOR: Record<NonNullable<AppCardProps['highlight']>, string> = {
  primary: Colors.primary,
  live: Colors.live,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
};

export function AppCard({
  children,
  elevation = 'raised',
  highlight,
  onPress,
  style,
  padded = true,
  accessibilityLabel,
}: AppCardProps) {
  const cardStyle: ViewStyle[] = [
    styles.base,
    styles[`elevation_${elevation}`],
    ...(padded ? [styles.padded] : []),
    ...(highlight != null
      ? [{ borderWidth: 1 as const, borderColor: HIGHLIGHT_COLOR[highlight] }]
      : []),
    ...(style != null ? [style] : []),
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={async () => {
          await Haptics.selectionAsync();
          onPress();
        }}
        activeOpacity={0.8}
        style={cardStyle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.md,
  },
  elevation_flat: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevation_raised: {
    backgroundColor: Colors.surface,
  },
  elevation_floating: {
    backgroundColor: Colors.surfaceElevated,
  },
});
