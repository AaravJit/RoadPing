/**
 * Screen containers.
 *
 * ScreenScroll is the default for content screens: it lets iOS manage safe
 * areas and the native navigation bar (contentInsetAdjustmentBehavior), keeps
 * focused inputs above the keyboard (automaticallyAdjustKeyboardInsets), and
 * paints the semantic background — so no screen hand-rolls any of that.
 */
import React from 'react';
import { ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme/ThemeProvider';
import { SCREEN_INSET, Spacing } from '@/theme/spacing';

export interface ScreenScrollProps extends ScrollViewProps {
  /** Horizontal padding for free-form content (lists add their own inset). */
  inset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export function ScreenScroll({
  inset = false,
  contentStyle,
  children,
  ...rest
}: ScreenScrollProps) {
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, inset && styles.inset, contentStyle]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export interface ScreenProps {
  children: React.ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}

/** Fixed (non-scrolling) screen with safe-area padding. */
export function Screen({ children, edges = ['top', 'bottom'], style }: ScreenProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={[styles.root, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/** Plain background fill, for screens under a native header. */
export function ScreenBackground({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.root, style]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  inset: {
    paddingHorizontal: SCREEN_INSET,
  },
}));
