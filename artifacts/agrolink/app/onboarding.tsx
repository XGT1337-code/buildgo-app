import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Button, F, Press, StatusBarScrim, type IconName, useTopInset } from '@/components/ui';
import { ProfileForm } from '@/components/ProfileForm';
import { LocationPicker } from '@/components/LocationPicker';
import { dialCodeOf, profileLocation } from '@/lib/geo';
import type { SavedLocation } from '@/lib/types';
import { LANGS, t, useI18n } from '@/lib/i18n';
import { BrandLogo } from '@/components/BrandLogo';
import { useAppAuth, useAppUser, useAuthActions } from '@/lib/auth';

/** Signed out and back to the sign-in screen, to use another account on this device. */
function useSwitchAccount() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  return async () => { await signOut(); router.push('/sign-in?from=onboarding'); };
}

/**
 * Sign in / sign up at the top of every first-run step: on a new phone or computer, people with an account skip
 * the intro. Already signed in: who it is, and a way to switch to another account.
 */
function AuthLinks({ light }: { light?: boolean }) {
  const c = useColors();
  const router = useRouter();
  const { isSignedIn } = useAppAuth();
  const { user } = useAppUser();
  const switchAccount = useSwitchAccount();
  const fg = light ? c.forest : c.primaryForeground;
  if (isSignedIn && user) {
    return (
      <View style={[styles.account, light ? { backgroundColor: c.card, borderColor: c.border } : { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.25)' }]}
        testID="onb-account">
        <Feather name="user-check" size={18} color={light ? c.success : c.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.accountT, { color: fg }]} numberOfLines={1}>{user.fullName}</Text>
          <Text style={[styles.accountS, { color: light ? c.mutedForeground : '#C9CDD3' }]} numberOfLines={1}>{t('Signed in as @{name}', { name: user.username })}</Text>
        </View>
        <Press onPress={switchAccount} testID="onb-switch-account" accessibilityLabel={t('Switch account')}
          style={[styles.switchBtn, { borderColor: light ? c.border : 'rgba(255,255,255,0.35)' }]}>
          <Feather name="log-out" size={14} color={fg} />
          <Text style={[styles.switchT, { color: fg }]}>{t('Switch account')}</Text>
        </Press>
      </View>
    );
  }
  return (
    <View style={styles.authRow}>
      <Press onPress={() => router.push('/sign-in?from=onboarding')} testID="onb-sign-in" accessibilityLabel={t('Sign in')}
        style={[styles.authBtn, { backgroundColor: c.accent }]}>
        <Feather name="log-in" size={16} color={c.forest} />
        <Text style={[styles.authT, { color: c.forest }]}>{t('Sign in')}</Text>
      </Press>
      <Press onPress={() => router.push('/sign-up?from=onboarding')} testID="onb-sign-up" accessibilityLabel={t('Create an account')}
        style={[styles.authBtn, light
          ? { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }
          : { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1 }]}>
        <Feather name="user-plus" size={16} color={light ? c.forest : c.primaryForeground} />
        <Text style={[styles.authT, { color: light ? c.forest : c.primaryForeground }]}>{t('Create an account')}</Text>
      </Press>
    </View>
  );
}

/** EN · AZ · RU on every first-run screen, so the rest is readable from the start. */
function LangSwitch() {
  const c = useColors();
  const { lang, setLang } = useI18n();
  return (
    <View style={styles.langRow}>
      {LANGS.map((l) => (
        <Press key={l.code} onPress={() => { if (l.code !== lang) setLang(l.code); }} selected={lang === l.code} accessibilityLabel={l.name}
          style={[styles.lang, { backgroundColor: lang === l.code ? c.accent : 'rgba(255,255,255,0.12)' }]} testID={`onb-lang-${l.code}`}>
          <Text style={[styles.langT, { color: lang === l.code ? c.forest : c.primaryForeground }]}>{l.short}</Text>
        </Press>
      ))}
    </View>
  );
}

const STEPS: { img: number; icon: IconName; title: string; body: string }[] = [
  { img: require('@/assets/images/excavator.jpg'), icon: 'truck', title: 'From a drill to a KamAZ', body: 'Excavators, dump trucks, cranes, mixers and tools from people nearby. Or rent out your own.' },
  { img: require('@/assets/images/crane.jpg'), icon: 'shield', title: 'Checked machines and operators', body: 'An admin checks every machine against its documents, and every licence before someone drives.' },
  { img: require('@/assets/images/site.jpg'), icon: 'cloud-drizzle', title: 'Your sites and the weather', body: 'Work log for every site and a clear yes or no on concrete, crane lifts and work at height today.' },
];

export default function Onboarding() {
  const c = useColors();
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { finishOnboarding, countryNeeded, chooseCountry, onboarded, deviceLocation, state } = useAppData();
  // -1 is the country step. It comes before the intro, once per device, and also for older installs that never chose.
  const [i, setI] = useState(countryNeeded ? -1 : 0);
  const [loc, setLoc] = useState<SavedLocation | null>(() => deviceLocation ?? (state.profile.locationSet ? profileLocation(state.profile) : null));

  // Changing language remounts the navigator, which can leave a second onboarding screen underneath.
  // Close every modal at once so the user never lands on a stale copy (country not chosen yet).
  const closed = useRef(false);
  const done = () => {
    if (closed.current) return;
    closed.current = true;
    finishOnboarding(); if (router.canDismiss()) router.dismissAll(); else router.replace('/');
  };

  // Signed in (or registered) from here: the intro is not needed. Ask the country only if the account has none.
  const { isSignedIn } = useAppAuth();
  const switchAccount = useSwitchAccount();
  const signedInOnOpen = useRef(isSignedIn);
  // Signed out here ("Switch account"): the next sign-in counts as a sign-in from this screen.
  useEffect(() => { if (!isSignedIn) signedInOnOpen.current = false; }, [isSignedIn]);
  useEffect(() => {
    if (signedInOnOpen.current || !isSignedIn || countryNeeded === null) return;
    finishOnboarding();
    if (countryNeeded) setI(-1); else done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, countryNeeded]);

  if (i === -1) {
    const dial = dialCodeOf(loc?.country);
    return (
      <View style={{ flex: 1, backgroundColor: c.forest }} testID="country-first">
        <Image source={require('@/assets/images/site.jpg')} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" />
        <LinearGradient colors={['rgba(22,24,28,0.3)', c.forest]} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: top + 18, paddingBottom: insets.bottom + 24, justifyContent: 'space-between' }}>
          <View style={styles.langRow}>
            <BrandLogo width={148} height={44} onDark style={{ flex: 1 }} />
            <LangSwitch />
          </View>
          <View style={{ flex: 1, paddingTop: 14 }}><AuthLinks /></View>
          <Animated.View entering={FadeInDown.duration(420)} style={{ gap: 16 }}>
            <View style={[styles.icon, { backgroundColor: c.accent }]}><Feather name="globe" size={26} color={c.forest} /></View>
            <Text style={[styles.title, { color: c.primaryForeground }]}>{t('Where do you build?')}</Text>
            <Text style={[styles.body, { color: '#C9CDD3' }]}>{t('Your country sets the phone code, the regions you can pick and which sites count as local. Change it any time in Profile.')}</Text>
            <View style={[styles.pickCard, { backgroundColor: c.background, borderRadius: c.radius + 6 }]}>
              <LocationPicker value={loc} onChange={setLoc} countryOnly testID="first-country" />
              {loc ? (
                <View style={styles.dialRow}>
                  <Feather name="phone" size={14} color={c.primary} />
                  <Text style={[styles.dialT, { color: c.forest }]}>{t('Phone code')} {dial ? `+${dial}` : t('not listed')}</Text>
                </View>
              ) : null}
            </View>
            <Button label={t('Continue')} icon="arrow-right" variant="accent" disabled={!loc} testID="country-continue"
              onPress={() => { if (!loc) return; chooseCountry(loc); if (onboarded) done(); else setI(0); }} />
          </Animated.View>
        </View>
      </View>
    );
  }

  if (i === STEPS.length) {
    return (
      <View style={{ flex: 1 }}>
      <StatusBarScrim />
      <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={40}
        contentContainerStyle={{ padding: 20, paddingTop: top + 20, paddingBottom: insets.bottom + 40, gap: 18 }}>
        <AuthLinks light />
        <Text style={[styles.kick, { color: c.primary }]}>{t('LAST STEP')}</Text>
        <Text style={[styles.h, { color: c.foreground }]}>{t('About you and your work')}</Text>
        <View style={[styles.demo, { backgroundColor: isSignedIn ? c.successBg : c.noticeBg }]}>
          <Feather name={isSignedIn ? 'cloud' : 'smartphone'} size={18} color={isSignedIn ? c.success : c.clay} />
          <Text style={[styles.demoT, { color: c.forest }]}>{isSignedIn
            ? t('Chats, listings and documents are saved to your account. Sites and the work log stay on this device.')
            : t('Guest mode. Everything stays on this phone. Sign in above to use your account.')}</Text>
        </View>
        <ProfileForm cta={t('Start building')} onDone={done} />
      </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  const s = STEPS[i];
  return (
    <View style={{ flex: 1, backgroundColor: c.forest }}>
      <Animated.View key={i} entering={FadeIn.duration(400)} style={StyleSheet.absoluteFill}>
        <Image source={s.img} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
      <LinearGradient colors={['rgba(22,24,28,0.2)', 'rgba(22,24,28,0.65)', c.forest]} locations={[0, 0.5, 0.85]} style={StyleSheet.absoluteFill} />
      <View style={[styles.skipRow, { top: top + 10 }]}>
        <BrandLogo width={140} height={42} onDark style={{ flex: 1 }} />
        <LangSwitch />
      </View>
      <View style={[styles.actionRow, { top: top + 66 }]}>
        {!isSignedIn ? (
          <Press onPress={() => router.push('/sign-in?from=onboarding')} testID="onb-sign-in" accessibilityLabel={t('Sign in')}
            style={[styles.authBtn, { backgroundColor: c.accent }]}>
            <Feather name="log-in" size={16} color={c.forest} />
            <Text style={[styles.authT, { color: c.forest }]}>{t('Sign in')}</Text>
          </Press>
        ) : (
          <Press onPress={switchAccount} testID="onb-switch-account" accessibilityLabel={t('Switch account')}
            style={[styles.authBtn, { backgroundColor: c.accent }]}>
            <Feather name="repeat" size={16} color={c.forest} />
            <Text style={[styles.authT, { color: c.forest }]} numberOfLines={1}>{t('Switch account')}</Text>
          </Press>
        )}
        <Press onPress={() => setI(STEPS.length)} testID="onb-skip" accessibilityLabel={t('Skip')}
          style={[styles.authBtn, { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1 }]}>
          <Text style={[styles.authT, { color: c.primaryForeground }]}>{t('Skip')}</Text>
          <Feather name="chevrons-right" size={16} color={c.primaryForeground} />
        </Press>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View key={`t${i}`} entering={FadeInDown.duration(380)} style={{ gap: 12 }}>
          <View style={[styles.icon, { backgroundColor: c.accent }]}><Feather name={s.icon} size={26} color={c.forest} /></View>
          <Text style={[styles.title, { color: c.primaryForeground }]}>{t(s.title)}</Text>
          <Text style={[styles.body, { color: '#C9CDD3' }]}>{t(s.body)}</Text>
        </Animated.View>
        <View style={styles.dots}>
          {STEPS.map((_, k) => <View key={k} style={[styles.dot, { backgroundColor: k === i ? c.accent : 'rgba(255,255,255,0.3)', width: k === i ? 28 : 8 }]} />)}
        </View>
        <Button label={i === STEPS.length - 1 ? t('Set up my profile') : t('Next')} icon="arrow-right" variant="accent" onPress={() => setI(i + 1)} testID="onboard-next" />
        {!isSignedIn ? (
          <Press onPress={() => router.push('/sign-up?from=onboarding')} testID="onb-sign-up" style={styles.signupLink}>
            <Text style={[styles.signupT, { color: '#C9CDD3' }]}>{t('New to BuildGO?')} <Text style={{ color: c.accent, fontFamily: F.b }}>{t('Create an account')}</Text></Text>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authRow: { flexDirection: 'row', gap: 8 },
  authBtn: { flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  authT: { fontFamily: F.b, fontSize: 14 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  accountT: { fontFamily: F.b, fontSize: 15 },
  accountS: { fontFamily: F.m, fontSize: 12 },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, minHeight: 36 },
  switchT: { fontFamily: F.s, fontSize: 13 },
  actionRow: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', gap: 8 },
  signupLink: { alignItems: 'center', paddingVertical: 4, marginTop: -8 },
  signupT: { fontFamily: F.m, fontSize: 14 },
  skipRow: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lang: { minWidth: 40, height: 32, borderRadius: 16, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  langT: { fontFamily: F.b, fontSize: 12, letterSpacing: 0.6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, gap: 22 },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.b, fontSize: 34, letterSpacing: -1, lineHeight: 38 },
  body: { fontFamily: F.m, fontSize: 17, lineHeight: 24 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  pickCard: { padding: 16, gap: 12 },
  dialRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dialT: { fontFamily: F.s, fontSize: 13 },
  kick: { fontFamily: F.b, fontSize: 12, letterSpacing: 1.4 },
  h: { fontFamily: F.b, fontSize: 30, letterSpacing: -0.8 },
  demo: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, alignItems: 'center' },
  demoT: { flex: 1, fontFamily: F.m, fontSize: 13, lineHeight: 18 },
});
