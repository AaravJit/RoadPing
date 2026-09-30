/**
 * Sheet — the one bottom-sheet presentation in the app (nearby drivers,
 * driver detail, range, report, pickers).
 *
 * • Slides up over a scrim; drag the grabber down or tap the scrim to close.
 * • A visible Close button and the VoiceOver escape gesture also close it.
 * • `material="glass"` for sheets that float over the live map;
 *   `material="surface"` (default) for forms and long lists.
 * • Reduce Motion: cross-fade instead of slide.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius, Spacing } from '@/theme/spacing';
import { AppText } from './AppText';
import { GlassSurface } from './GlassSurface';
import { Icon } from './Icon';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Short line under the title. */
  subtitle?: string;
  material?: 'glass' | 'surface';
  /** Fraction of the window height the sheet may take (default 0.85). */
  maxHeight?: number;
  children: React.ReactNode;
}

const DISMISS_DISTANCE = 90;

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  material = 'surface',
  maxHeight = 0.85,
  children,
}: SheetProps) {
  const { a11y, colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Keep the Modal mounted through the exit animation.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: a11y.reduceMotion ? 180 : 320,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: a11y.reduceMotion ? 150 : 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > 1.1) {
          onCloseRef.current();
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  const translateY = a11y.reduceMotion
    ? drag
    : Animated.add(
        drag,
        progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] }),
      );

  const body = (
    <>
      <View {...pan.panHandlers} style={styles.grabberArea}>
        <View style={styles.grabber} />
      </View>
      {(title !== undefined || subtitle !== undefined) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title !== undefined && (
              <AppText variant="title3" weight="bold" accessibilityRole="header">
                {title}
              </AppText>
            )}
            {subtitle !== undefined && (
              <AppText variant="footnote" color="secondary">
                {subtitle}
              </AppText>
            )}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="xmark" size={13} color={colors.textSecondary} weight="bold" />
          </Pressable>
        </View>
      )}
      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.md }]}>
        {children}
      </View>
    </>
  );

  const sheetStyle = [styles.sheet, { maxHeight: height * maxHeight }];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            transform: [{ translateY }],
            opacity: a11y.reduceMotion ? progress : 1,
          }}
        >
          {material === 'glass' ? (
            <GlassSurface radius={Radius.xl} style={sheetStyle}>
              {body}
            </GlassSurface>
          ) : (
            <View style={[sheetStyle, styles.surface]}>{body}</View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  scrim: {
    backgroundColor: t.colors.scrim,
  },
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
  },
  surface: {
    backgroundColor: t.colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderCurve: 'continuous',
  },
  grabberArea: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.separatorStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
    paddingHorizontal: Spacing.md20,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.fill,
    // 30 pt visual, 46 pt with hitSlop.
    marginRight: -Spacing.xxs,
  },
  content: {
    flexShrink: 1,
  },
}));
