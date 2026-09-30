/**
 * Inset-grouped list primitives, modelled on iOS Settings.
 *
 *   <ListSection header="Drive" footer="…">
 *     <ListRow icon="car.fill" title="Vehicles" value="Civic" onPress={…} />
 *     <ListSwitchRow title="Do Not Disturb" value={…} onValueChange={…} />
 *   </ListSection>
 *
 * Rows get hairline separators inset past the icon, a 44 pt minimum height,
 * native-feeling chevrons, and correct VoiceOver roles/states.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, SCREEN_INSET, Spacing } from '@/theme/spacing';
import { AppText } from './AppText';
import { haptic } from './feedback';
import { Icon, type IconName } from './Icon';

const ICON_TILE = 30;

// ─── Section ──────────────────────────────────────────────────────────────────

export interface ListSectionProps {
  header?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ListSection({ header, footer, children, style }: ListSectionProps) {
  const styles = useStyles();
  const rows = React.Children.toArray(children).filter(React.isValidElement);

  return (
    <View style={[styles.section, style]}>
      {header !== undefined && (
        <AppText
          variant="footnote"
          color="secondary"
          weight="medium"
          style={styles.header}
          accessibilityRole="header"
        >
          {header}
        </AppText>
      )}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <React.Fragment key={row.key ?? i}>
            {i > 0 && <View style={styles.separator} />}
            {row}
          </React.Fragment>
        ))}
      </View>
      {footer !== undefined && (
        <AppText variant="footnote" color="secondary" style={styles.footer}>
          {footer}
        </AppText>
      )}
    </View>
  );
}

// ─── Icon tile ────────────────────────────────────────────────────────────────

export type IconTone = 'accent' | 'neutral' | 'live' | 'danger' | 'success' | 'warning';

function IconTile({ name, tone }: { name: IconName; tone: IconTone }) {
  const { colors, accent } = useTheme();
  const bg: Record<IconTone, string> = {
    accent: accent.fill,
    neutral: colors.textTertiary,
    live: colors.live,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  };
  const fg = tone === 'accent' ? accent.onFill : colors.textOnColor;
  return (
    <View
      style={{
        width: ICON_TILE,
        height: ICON_TILE,
        borderRadius: 8,
        borderCurve: 'continuous',
        backgroundColor: bg[tone],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={16} color={fg} />
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Trailing value text, e.g. the current selection. */
  value?: string;
  icon?: IconName;
  iconTone?: IconTone;
  /** Custom leading element (avatar, vehicle tile) instead of an icon tile. */
  leading?: React.ReactNode;
  /** Custom trailing element (button, badge). Replaces value + chevron. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Show a chevron (default: when pressable and not destructive). */
  chevron?: boolean;
  /** Checkmark for single-choice lists. */
  checked?: boolean;
  destructive?: boolean;
  /** Center the title (iOS style for standalone destructive actions). */
  centered?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconTone = 'neutral',
  leading,
  trailing,
  onPress,
  chevron,
  checked,
  destructive = false,
  centered = false,
  disabled = false,
  accessibilityHint,
  accessibilityLabel,
}: ListRowProps) {
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const showChevron = chevron ?? (onPress !== undefined && !destructive && checked === undefined);

  const content = (
    <>
      {leading ?? (icon !== undefined ? <IconTile name={icon} tone={iconTone} /> : null)}
      <View style={[styles.text, centered && styles.textCentered]}>
        <AppText
          variant="body"
          color={destructive ? 'danger' : 'primary'}
          align={centered ? 'center' : undefined}
        >
          {title}
        </AppText>
        {subtitle !== undefined && (
          <AppText variant="footnote" color="secondary">
            {subtitle}
          </AppText>
        )}
      </View>
      {trailing}
      {trailing === undefined && value !== undefined && (
        <AppText variant="body" color="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      )}
      {trailing === undefined && checked === true && (
        <Icon name="checkmark" size={17} color={accent.text} weight="bold" />
      )}
      {trailing === undefined && showChevron && (
        <Icon name="chevron.right" size={13} color={colors.textTertiary} weight="bold" />
      )}
    </>
  );

  if (onPress === undefined) {
    return (
      <View
        style={styles.row}
        // A custom trailing control (e.g. an Unblock button) must stay
        // reachable by VoiceOver, so only group plain informational rows.
        accessible={trailing === undefined}
        accessibilityLabel={
          trailing === undefined
            ? (accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', '))
            : undefined
        }
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.fill },
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint ?? subtitle}
      accessibilityState={{
        disabled,
        ...(checked !== undefined ? { selected: checked } : {}),
      }}
    >
      {content}
    </Pressable>
  );
}

// ─── Switch row ───────────────────────────────────────────────────────────────

export interface ListSwitchRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: IconTone;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function ListSwitchRow({
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  value,
  onValueChange,
  disabled = false,
}: ListSwitchRowProps) {
  const { accent } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {icon !== undefined && <IconTile name={icon} tone={iconTone} />}
      <View style={styles.text}>
        <AppText variant="body">{title}</AppText>
        {subtitle !== undefined && (
          <AppText variant="footnote" color="secondary">
            {subtitle}
          </AppText>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.selection();
          onValueChange(v);
        }}
        disabled={disabled}
        trackColor={{ true: accent.fill }}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  section: {
    marginHorizontal: SCREEN_INSET - Spacing.xs,
    gap: Spacing.xs + 2,
  },
  header: {
    paddingHorizontal: Spacing.md,
  },
  footer: {
    paddingHorizontal: Spacing.md,
  },
  group: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    ...(t.a11y.increaseContrast
      ? { borderWidth: 1, borderColor: t.colors.separatorStrong }
      : null),
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.separator,
    marginLeft: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
    minHeight: MIN_TOUCH_TARGET + 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  textCentered: {
    alignItems: 'center',
  },
  value: {
    flexShrink: 1,
    maxWidth: '55%',
    textAlign: 'right',
  },
  disabled: {
    opacity: 0.4,
  },
}));
