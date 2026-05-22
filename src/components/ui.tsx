import React from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  StyleSheet, ScrollView, TextInputProps, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme';

export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView style={s.screen}>
      {scroll ? (
        <ScrollView contentContainerStyle={[s.scrollBody, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.body, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.subtitle}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Field({
  label,
  ...props
}: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.textMute}
        style={s.input}
        {...props}
      />
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  const styleMap = {
    primary: { bg: colors.accent, fg: '#0a0a0a' },
    ghost: { bg: colors.surfaceFaint, fg: colors.text },
    danger: { bg: colors.dangerDim, fg: colors.danger },
  } as const;
  const c = styleMap[variant];
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={[s.btn, { backgroundColor: c.bg, opacity: isDisabled ? 0.5 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <Text style={[s.btnText, { color: c.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Notice({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }) {
  return (
    <View style={[s.notice, tone === 'danger' ? s.noticeDanger : s.noticeInfo]}>
      <Text style={[s.noticeText, { color: tone === 'danger' ? colors.danger : colors.textDim }]}>
        {text}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 22, paddingTop: 16 },
  scrollBody: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: colors.textDim, fontSize: 15, lineHeight: 21, marginBottom: 20 },
  label: { color: colors.textMute, fontSize: 12, letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.surface, color: colors.text, fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
  },
  btn: {
    height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    marginTop: 10,
  },
  btnText: { fontSize: 16, fontWeight: '600' },
  notice: { borderRadius: radius.md, padding: 12, marginBottom: 14, borderWidth: 1 },
  noticeDanger: { backgroundColor: colors.dangerDim, borderColor: 'rgba(255,61,46,0.5)' },
  noticeInfo: { backgroundColor: colors.surfaceFaint, borderColor: colors.line },
  noticeText: { fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
});
