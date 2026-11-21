import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { CatIcon } from '@/components/CatIcon';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { initials } from '@/lib/util';
import { t } from '@/lib/i18n';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export const F = {
  r: 'Inter_400Regular',
  m: 'Inter_500Medium',
  s: 'Inter_600SemiBold',
  b: 'Inter_700Bold',
} as const;

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/** Top safe area. On web there is no status bar, so keep a small breathing gap instead. */
export function useTopInset() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
}

export const TAB_SPACE = 110;

/**
 * Edge-to-edge Android draws the status bar over the app: without a backdrop, scrolled content
 * shows through the clock and icons. A thin bar in the screen's own colour sits on top.
 */
export function StatusBarScrim({ tone }: { tone?: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web' || !insets.top) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: tone ?? c.background, zIndex: 50, elevation: 50 }} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that springs down slightly on touch. */
export function Press({
  onPress, style, children, disabled, testID, haptic = true, hitSlop, accessibilityLabel, selected,
}: {
  onPress?: () => void; style?: StyleProp<ViewStyle>; children: React.ReactNode; disabled?: boolean;
  testID?: string; haptic?: boolean; hitSlop?: number; accessibilityLabel?: string; selected?: boolean;
}) {
  const sc = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  // The style lives on the pressable itself so layout props (flex, margins, alignSelf) work in rows.
  return (
    <AnimatedPressable
      style={[style, a, disabled && { opacity: 0.45 }]}
      testID={testID}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected }}
      onPressIn={() => { sc.value = withSpring(0.96, { damping: 18, stiffness: 400 }); }}
      onPressOut={() => { sc.value = withSpring(1, { damping: 14, stiffness: 300 }); }}
      onPress={() => { if (haptic) tap(); onPress?.(); }}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Button({
  label, icon, onPress, variant = 'primary', loading, disabled, style, testID,
}: {
  label: string; icon?: IconName; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.secondary, ghost: 'transparent', danger: c.destructive, accent: c.accent }[variant];
  const fg = { primary: c.primaryForeground, secondary: c.secondaryForeground, ghost: c.primary, danger: c.destructiveForeground, accent: c.accentForeground }[variant];
  return (
    <Press testID={testID} onPress={onPress} disabled={disabled || loading}
      style={[s.btn, { backgroundColor: bg, borderRadius: c.radius, borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: c.border }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Feather name={icon} size={20} color={fg} /> : null}
          <Text style={[s.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Press>
  );
}

export function IconButton({
  icon, onPress, tone = 'card', size = 48, testID, color, label,
}: { icon: IconName; onPress: () => void; tone?: 'card' | 'primary' | 'forest' | 'accent' | 'clear'; size?: number; testID?: string; color?: string; label?: string }) {
  const c = useColors();
  const bg = { card: c.card, primary: c.primary, forest: c.forest, accent: c.accent, clear: 'transparent' }[tone];
  const fg = color ?? { card: c.foreground, primary: c.primaryForeground, forest: c.primaryForeground, accent: c.accentForeground, clear: c.foreground }[tone];
  return (
    <Press testID={testID} onPress={onPress} hitSlop={6} accessibilityLabel={label ?? icon.replace(/-/g, ' ')}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: tone === 'card' ? 1 : 0, borderColor: c.border }}>
      <Feather name={icon} size={Math.round(size * 0.42)} color={fg} />
    </Press>
  );
}

export function Chip({ label, active, onPress, icon, cat }: { label: string; active?: boolean; onPress: () => void; icon?: IconName; cat?: string }) {
  const c = useColors();
  return (
    <Press onPress={onPress} selected={active}
      style={[s.chip, { backgroundColor: active ? c.forest : c.card, borderColor: active ? c.forest : c.border }]}>
      {icon ? <Feather name={icon} size={16} color={active ? c.accent : c.mutedForeground} /> : null}
      {cat ? <CatIcon cat={cat} size={17} color={active ? c.accent : c.mutedForeground} /> : null}
      <Text style={[s.chipText, { color: active ? c.primaryForeground : c.foreground }]}>{label}</Text>
    </Press>
  );
}

export function DemoBadge({ label = t('DEMO DATA'), style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[s.badge, { backgroundColor: c.wheat }, style]}>
      <Feather name="info" size={11} color={c.forest} />
      <Text style={[s.badgeText, { color: c.forest }]}>{label}</Text>
    </View>
  );
}

export function Tag({ label, color, fg }: { label: string; color?: string; fg?: string }) {
  const c = useColors();
  return (
    <View style={[s.tag, { backgroundColor: color ?? c.muted }]}>
      <Text style={[s.tagText, { color: fg ?? c.foreground }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const c = useColors();
  const base = [{ backgroundColor: c.card, borderRadius: c.radius + 4, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const }, style];
  if (onPress) return <Press testID={testID} onPress={onPress} style={base}>{children}</Press>;
  return <View style={base} testID={testID}>{children}</View>;
}

export function Field({
  label, style, inputStyle, ...rest
}: TextInputProps & { label?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={[s.label, { color: c.mutedForeground }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.mutedForeground}
        {...rest}
        style={[s.input, { backgroundColor: c.card, borderColor: c.input, color: c.foreground, borderRadius: c.radius },
          rest.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }, inputStyle]}
      />
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[s.label, { color: c.mutedForeground }]}>{children}</Text>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ fontFamily: F.b, fontSize: 28, letterSpacing: -0.6, color: c.foreground }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ fontFamily: F.b, fontSize: 19, letterSpacing: -0.3, color: c.foreground }, style]}>{children}</Text>;
}
export function Body({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useColors();
  return <Text numberOfLines={numberOfLines} style={[{ fontFamily: F.r, fontSize: 15, lineHeight: 21, color: c.foreground }, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useColors();
  return <Text numberOfLines={numberOfLines} style={[{ fontFamily: F.m, fontSize: 13, color: c.mutedForeground }, style]}>{children}</Text>;
}

export function Avatar({ name, size = 44, tone }: { name: string; size?: number; tone?: string }) {
  const c = useColors();
  const palette = [c.primary, c.sky, c.clay, c.forestSoft, c.wheat];
  const bg = tone ?? palette[name.length % palette.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.b, fontSize: size * 0.38, color: c.primaryForeground }}>{initials(name) || '?'}</Text>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, { backgroundColor: c.muted }]}>
        <Feather name={icon} size={30} color={c.primary} />
      </View>
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      <Muted style={{ textAlign: 'center', fontSize: 14, lineHeight: 20 }}>{body}</Muted>
      {action}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={[s.seg, { backgroundColor: c.muted, borderRadius: c.radius }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press key={o.value} testID={`seg-${o.value}`} onPress={() => onChange(o.value)} selected={on}
            style={[s.segItem, { borderRadius: c.radius - 3, backgroundColor: on ? c.card : 'transparent' }, on && s.segOn]}>
            {o.icon ? <Feather name={o.icon} size={16} color={on ? c.primary : c.mutedForeground} /> : null}
            {/* Long translations (Сохранённые) shrink a little instead of breaking mid-word. */}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
              style={{ flexShrink: 1, fontFamily: on ? F.s : F.m, fontSize: 14, color: on ? c.foreground : c.mutedForeground }}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

export function Notice({ text, icon = 'info', tone = 'wheat' }: { text: string; icon?: IconName; tone?: 'wheat' | 'forest' }) {
  const c = useColors();
  const bg = tone === 'wheat' ? c.noticeBg : c.forest;
  const fg = tone === 'wheat' ? c.forest : c.primaryForeground;
  return (
    <View style={[s.notice, { backgroundColor: bg, borderRadius: c.radius }]}>
      <Feather name={icon} size={16} color={tone === 'wheat' ? c.clay : c.accent} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: fg }}>{text}</Text>
    </View>
  );
}

export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 10 : 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <FontAwesome name={n <= value ? 'star' : 'star-o'} size={size} color={n <= value ? c.wheat : c.mutedForeground} />;
        return onChange
          ? <Press key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>{icon}</Press>
          : <View key={n}>{icon}</View>;
      })}
    </View>
  );
}

export function Fab({ icon, label, onPress, testID }: { icon: IconName; label?: string; onPress: () => void; testID?: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const bottom = (Platform.OS === 'web' ? 84 : 60 + insets.bottom) + 16;
  return (
    <View style={{ position: 'absolute', right: 18, bottom }} pointerEvents="box-none">
      <Press testID={testID} onPress={onPress} accessibilityLabel={label}
        style={[s.fab, { backgroundColor: c.forest, paddingHorizontal: label ? 22 : 0, width: label ? undefined : 62 }]}>
        <Feather name={icon} size={24} color={c.accent} />
        {label ? <Text style={{ fontFamily: F.b, fontSize: 16, color: c.primaryForeground }}>{label}</Text> : null}
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnText: { fontFamily: F.b, fontSize: 15, letterSpacing: 0 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: F.s, fontSize: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, alignSelf: 'flex-start' },
  badgeText: { fontFamily: F.b, fontSize: 10, letterSpacing: 0.6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, alignSelf: 'flex-start' },
  tagText: { fontFamily: F.s, fontSize: 12 },
  label: { fontFamily: F.s, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' },
  input: { minHeight: 54, borderWidth: 1, paddingHorizontal: 16, fontFamily: F.m, fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 28, gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  seg: { flexDirection: 'row', padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segOn: { shadowColor: '#16181C', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'flex-start' },
  fab: { height: 62, borderRadius: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#16181C', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
