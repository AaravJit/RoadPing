/**
 * GlassIconButton — round floating control over the map (recenter, profile,
 * close). Sized for use in a moving car: 56 pt by default.
 */
import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { DRIVE_TOUCH_TARGET } from '@/theme/spacing';
import { haptic } from './feedback';
import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './Icon';

export interface GlassIconButtonProps {
  icon?: IconName;
  /** Custom content (e.g. an avatar) instead of an icon. */
  children?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
  /** Draw the icon in the accent color (e.g. recenter while following). */
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassIconButton({
  icon,
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = DRIVE_TOUCH_TARGET,
  highlighted = false,
  style,
}: GlassIconButtonProps) {
  const { colors, accent } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }, style]}
    >
      <GlassSurface
        interactive
        radius={size / 2}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      >
        {children ?? (
          <View>
            {icon !== undefined && (
              <Icon
                name={icon}
                size={size * 0.38}
                color={highlighted ? accent.text : colors.textPrimary}
              />
            )}
          </View>
        )}
      </GlassSurface>
    </Pressable>
  );
}
