/**
 * Icon — SF Symbols through expo-symbols.
 *
 * The set is deliberately curated: every name below exists in SF Symbols 3
 * or earlier, so it renders on the oldest iOS this Expo SDK supports. Using a
 * closed union also stops screens from reaching for emoji as system icons.
 *
 * If the native SymbolModule isn't linked (a JS update running on an older
 * binary), a same-size placeholder keeps layout intact and the owning control
 * still carries its own text / accessibility label.
 */
import React from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { SymbolViewProps, SymbolWeight } from 'expo-symbols';

export type IconName =
  | 'antenna.radiowaves.left.and.right'
  | 'camera.fill'
  | 'car.fill'
  | 'checkmark'
  | 'checkmark.circle.fill'
  | 'circle'
  | 'chevron.down'
  | 'chevron.left'
  | 'chevron.right'
  | 'circle.lefthalf.filled'
  | 'dot.radiowaves.left.and.right'
  | 'doc.text'
  | 'ellipsis'
  | 'envelope.fill'
  | 'exclamationmark.triangle.fill'
  | 'eye.fill'
  | 'eye.slash.fill'
  | 'flag.fill'
  | 'gearshape.fill'
  | 'hand.raised.fill'
  | 'house.fill'
  | 'briefcase.fill'
  | 'info.circle.fill'
  | 'location.fill'
  | 'location.north.fill'
  | 'location.slash.fill'
  | 'lock.fill'
  | 'lock.shield.fill'
  | 'magnifyingglass'
  | 'mappin.circle.fill'
  | 'mic.fill'
  | 'mic.slash.fill'
  | 'minus.circle.fill'
  | 'moon.fill'
  | 'nosign'
  | 'person.2.fill'
  | 'person.3.fill'
  | 'person.badge.plus'
  | 'person.crop.circle.fill'
  | 'person.fill'
  | 'photo.on.rectangle'
  | 'plus'
  | 'rectangle.portrait.and.arrow.right'
  | 'shield.lefthalf.filled'
  | 'slider.horizontal.3'
  | 'square.and.arrow.up'
  | 'star.fill'
  | 'stop.fill'
  | 'trash.fill'
  | 'waveform'
  | 'xmark';

/** Text stand-ins used only when SF Symbols can't render. */
const GLYPH_FALLBACK: Partial<Record<IconName, string>> = {
  'chevron.left': '‹',
  'chevron.right': '›',
  'chevron.down': '⌄',
  checkmark: '✓',
  xmark: '✕',
  plus: '+',
  ellipsis: '…',
};

type SymbolViewComponent = React.ComponentType<SymbolViewProps>;

let symbolView: SymbolViewComponent | null | undefined;

function getSymbolView(): SymbolViewComponent | null {
  if (symbolView !== undefined) return symbolView;
  symbolView = null;
  if (Platform.OS !== 'ios') return symbolView;
  if (requireOptionalNativeModule('SymbolModule') === null) return symbolView;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    symbolView = (require('expo-symbols') as typeof import('expo-symbols')).SymbolView;
  } catch {
    symbolView = null;
  }
  return symbolView;
}

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
  /** Only set when the icon is the sole content of a control. */
  accessibilityLabel?: string;
}

function IconInner({
  name,
  size = 20,
  color,
  weight = 'semibold',
  style,
  accessibilityLabel,
}: IconProps) {
  const SymbolView = getSymbolView();
  const a11y =
    accessibilityLabel !== undefined
      ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
      : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  if (SymbolView !== null) {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={color}
        weight={weight}
        resizeMode="scaleAspectFit"
        style={style}
        {...a11y}
      />
    );
  }

  const glyph = GLYPH_FALLBACK[name];
  return (
    <View
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      {...a11y}
    >
      {glyph !== undefined && (
        <Text
          allowFontScaling={false}
          style={{ color, fontSize: size, lineHeight: size * 1.1, fontWeight: '600' }}
        >
          {glyph}
        </Text>
      )}
    </View>
  );
}

export const Icon = React.memo(IconInner);
