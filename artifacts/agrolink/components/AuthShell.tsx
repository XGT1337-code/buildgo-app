import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { F, IconButton, Label, Press, useTopInset, type IconName } from '@/components/ui';
import { BrandLogo } from '@/components/BrandLogo';
import { t } from '@/lib/i18n';

/** Soft glowing disc that drifts slowly behind the hero text. */
function Glow({ size, color, x, y, delay }: { size: number; color: string; x: number; y: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    // Big translucent layers repainting every frame cost real GPU time on mid-range Android phones,
    // which shows up as sluggish taps on the form below. Keep them still there.
    if (Platform.OS === 'android') return;
    const id = setTimeout(() => { p.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true); }, delay);
    return () => clearTimeout(id);
  }, [p, delay]);
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 1], [-14, 18]) }, { translateY: interpolate(p.value, [0, 1], [10, -12]) }, { scale: interpolate(p.value, [0, 1], [1, 1.12]) }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, a]} />;
}

export function AuthShell({ kicker, title, sub, children, step }: {
  kicker: string; title: string; sub: string; children: React.ReactNode;
  /** Optional progress for multi-step forms: [current, total]. */
  step?: [number, number];
}) {
  const c = useColors();
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={40}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <LinearGradient colors={[c.forest, c.forestSoft, '#2C3139']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.head, { paddingTop: top + 10 }]}>
        <Glow size={220} color="rgba(255,192,46,0.20)" x={-60} y={-40} delay={0} />
        <Glow size={160} color="rgba(47,127,216,0.18)" x={230} y={40} delay={900} />
        <Glow size={110} color="rgba(232,89,12,0.16)" x={140} y={150} delay={1800} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <BrandLogo width={150} height={44} onDark />
          <IconButton icon="x" tone="forest" label={t('Close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} testID="auth-close" />
        </View>
        <Animated.Text entering={FadeInDown.duration(450)} style={[styles.kick, { color: c.accent }]}>{kicker}</Animated.Text>
        <Animated.Text entering={FadeInDown.duration(450).delay(60)} style={[styles.title, { color: c.primaryForeground }]}>{title}</Animated.Text>
        <Animated.Text entering={FadeInDown.duration(450).delay(120)} style={[styles.sub, { color: c.onForestMuted }]}>{sub}</Animated.Text>
        {step ? <StepBar current={step[0]} total={step[1]} /> : null}
      </LinearGradient>
      <Animated.View entering={FadeInDown.duration(500).delay(150).springify().damping(18)}
        style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
        {children}
      </Animated.View>
    </KeyboardAwareScrollViewCompat>
  );
}

function StepBar({ current, total }: { current: number; total: number }) {
  const c = useColors();
  const w = useSharedValue(current / total);
  useEffect(() => { w.value = withSpring(current / total, { damping: 18 }); }, [current, total, w]);
  const a = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
      <Animated.View style={[styles.fill, { backgroundColor: c.accent }, a]} />
    </View>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  const c = useColors();
  if (!children) return null;
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[styles.err, { backgroundColor: '#FBE9E4' }]}>
      <Feather name="alert-circle" size={16} color={c.destructive} />
      <Text style={{ flex: 1, fontFamily: F.s, fontSize: 13, lineHeight: 18, color: c.destructive }}>{children}</Text>
    </Animated.View>
  );
}

/** Text input with a leading icon, animated focus ring and optional status on the right. */
export function AuthInput({ label, icon, right, hint, hintTone, ...rest }: TextInputProps & {
  label: string; icon: IconName; right?: React.ReactNode; hint?: string; hintTone?: 'ok' | 'bad' | 'muted'; ref?: React.Ref<TextInput>;
}) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  const f = useSharedValue(0);
  useEffect(() => { f.value = withTiming(focus ? 1 : 0, { duration: 160 }); }, [focus, f]);
  const ring = useAnimatedStyle(() => ({ borderColor: f.value > 0.5 ? c.primary : c.input, transform: [{ scale: 1 + f.value * 0.01 }] }));
  const hintColor = hintTone === 'ok' ? c.primary : hintTone === 'bad' ? c.destructive : c.mutedForeground;
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Animated.View style={[styles.inputWrap, { backgroundColor: focus ? c.card : c.background }, ring]}>
        <Feather name={icon} size={18} color={focus ? c.primary : c.mutedForeground} />
        <TextInput placeholderTextColor={c.mutedForeground} {...rest}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          style={[styles.input, { color: c.foreground }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {right}
      </Animated.View>
      {hint ? <Text style={{ fontFamily: F.m, fontSize: 12, color: hintColor }}>{hint}</Text> : null}
    </View>
  );
}

/** 0–4 from length and character variety; good enough to nudge people away from "12345678". */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 0.5;
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|qwerty)/i.test(pw)) s = 0.5;
  return Math.min(4, Math.round(s));
}

export function PasswordInput({ label, value, onChangeText, meter, testID, placeholder, onSubmitEditing, autoComplete, inputRef, returnKeyType }: {
  label: string; value: string; onChangeText: (v: string) => void; meter?: boolean; testID?: string; placeholder?: string;
  onSubmitEditing?: () => void; autoComplete?: TextInputProps['autoComplete'];
  inputRef?: React.Ref<TextInput>; returnKeyType?: TextInputProps['returnKeyType'];
}) {
  const c = useColors();
  const [show, setShow] = useState(false);
  const score = passwordScore(value);
  const tones = [c.destructive, c.destructive, c.wheat, c.primary, c.primary];
  const words = [t('Too short'), t('Weak'), t('Okay'), t('Strong'), t('Very strong')];
  return (
    <View style={{ gap: 8 }}>
      <AuthInput label={label} icon="lock" value={value} onChangeText={onChangeText} secureTextEntry={!show} autoCapitalize="none"
        autoCorrect={false} placeholder={placeholder} testID={testID} onSubmitEditing={onSubmitEditing} autoComplete={autoComplete}
        ref={inputRef} returnKeyType={returnKeyType} submitBehavior={returnKeyType === 'next' ? 'submit' : undefined}
        right={
          <Press onPress={() => setShow((s) => !s)} hitSlop={8} haptic={false} accessibilityLabel={show ? t('Hide password') : t('Show password')}>
            <Feather name={show ? 'eye-off' : 'eye'} size={18} color={c.mutedForeground} />
          </Press>
        } />
      {meter && value ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.seg, { backgroundColor: i < Math.max(1, score) ? tones[score] : c.muted }]} />
            ))}
          </View>
          <Text style={{ fontFamily: F.s, fontSize: 12, color: tones[score], minWidth: 76, textAlign: 'right' }}>
            {value.length < 8 ? words[0] : words[score]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 54, gap: 6, overflow: 'hidden' },
  kick: { fontFamily: F.b, fontSize: 12, letterSpacing: 1.4, marginTop: 18 },
  title: { fontFamily: F.b, fontSize: 32, letterSpacing: -0.8 },
  sub: { fontFamily: F.m, fontSize: 14, lineHeight: 20 },
  sheet: {
    marginHorizontal: 14, marginTop: -32, padding: 20, gap: 16, borderRadius: 26, borderWidth: 1,
    shadowColor: '#16181C', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  track: { height: 6, borderRadius: 3, marginTop: 14, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  err: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, alignItems: 'flex-start' },
  inputWrap: { minHeight: 54, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 50, fontFamily: F.m, fontSize: 16 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
});
