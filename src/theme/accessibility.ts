/**
 * Live iOS accessibility preferences that change how RoadPing draws itself.
 *
 * Read once on mount and kept current through AccessibilityInfo change
 * events, so flipping a switch in iOS Settings updates the app immediately.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, type AccessibilityChangeEventName } from 'react-native';

export interface AccessibilityPreferences {
  /** Settings › Accessibility › Display & Text Size › Reduce Transparency. */
  reduceTransparency: boolean;
  /** Settings › Accessibility › Motion › Reduce Motion. */
  reduceMotion: boolean;
  /** Settings › Accessibility › Display & Text Size › Increase Contrast. */
  increaseContrast: boolean;
  /** Settings › Accessibility › Display & Text Size › Bold Text. */
  boldText: boolean;
  /** VoiceOver is running. */
  screenReader: boolean;
}

export const DEFAULT_A11Y: AccessibilityPreferences = {
  reduceTransparency: false,
  reduceMotion: false,
  increaseContrast: false,
  boldText: false,
  screenReader: false,
};

type Key = keyof AccessibilityPreferences;

const SOURCES: readonly {
  key: Key;
  event: AccessibilityChangeEventName;
  read: () => Promise<boolean>;
}[] = [
  {
    key: 'reduceTransparency',
    event: 'reduceTransparencyChanged',
    read: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  },
  {
    key: 'reduceMotion',
    event: 'reduceMotionChanged',
    read: () => AccessibilityInfo.isReduceMotionEnabled(),
  },
  {
    key: 'increaseContrast',
    event: 'darkerSystemColorsChanged',
    read: () => AccessibilityInfo.isDarkerSystemColorsEnabled(),
  },
  {
    key: 'boldText',
    event: 'boldTextChanged',
    read: () => AccessibilityInfo.isBoldTextEnabled(),
  },
  {
    key: 'screenReader',
    event: 'screenReaderChanged',
    read: () => AccessibilityInfo.isScreenReaderEnabled(),
  },
];

export function useAccessibilityPreferences(): AccessibilityPreferences {
  const [prefs, setPrefs] = useState<AccessibilityPreferences>(DEFAULT_A11Y);

  useEffect(() => {
    let active = true;
    const apply = (key: Key, value: boolean) => {
      if (!active) return;
      setPrefs((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
    };

    const subs = SOURCES.map(({ key, event, read }) => {
      read().then(
        (v) => apply(key, v),
        () => {
          // Unsupported on this OS version — keep the default.
        },
      );
      return AccessibilityInfo.addEventListener(event, (v: boolean) => apply(key, v));
    });

    return () => {
      active = false;
      subs.forEach((s) => s.remove());
    };
  }, []);

  return prefs;
}
