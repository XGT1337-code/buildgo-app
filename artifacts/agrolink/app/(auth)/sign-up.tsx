import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, type TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { checkUsername } from '@workspace/api-client-react';
import { AuthInput, AuthShell, ErrorText, PasswordInput, passwordScore } from '@/components/AuthShell';
import { ServerSettings } from '@/components/ServerSettings';
import { Button, Chip, Label, Muted } from '@/components/ui';
import { LocationPicker } from '@/components/LocationPicker';
import { PhoneField } from '@/components/PhoneField';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { useAuthActions } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { dialCodeOf } from '@/lib/geo';
import { phoneError, toInternational } from '@/lib/phone';
import { ROLE_LABEL } from '@/lib/demo';
import { t } from '@/lib/i18n';
import type { Role, SavedLocation } from '@/lib/types';

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
const clean = (s: string) => s.trim().replace(/^@/, '').toLowerCase();

/** Live "is this username free?" with a short debounce. */
function useUsernameCheck(raw: string) {
  const [state, setState] = useState<{ v: string; ok: boolean | null; reason?: string }>({ v: '', ok: null });
  const u = clean(raw);
  useEffect(() => {
    if (!u) { setState({ v: '', ok: null }); return; }
    if (!USERNAME_RE.test(u)) { setState({ v: u, ok: false, reason: 'Use 3–24 Latin letters, numbers, dots or underscores.' }); return; }
    let alive = true;
    setState({ v: u, ok: null });
    const timer = setTimeout(() => {
      checkUsername({ username: u })
        .then((r) => { if (alive) setState({ v: u, ok: r.available, reason: r.reason }); })
        .catch(() => { if (alive) setState({ v: u, ok: null }); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [u]);
  return state;
}

export default function SignUp() {
  const c = useColors();
  const { signUp } = useAuthActions();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { deviceLocation } = useAppData();
  const [step, setStep] = useState<1 | 2>(1);
  const pwRef = React.useRef<TextInput>(null);
  const confirmRef = React.useRef<TextInput>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<Role>('contractor');
  const [loc, setLoc] = useState<SavedLocation | null>(deviceLocation);
  const [national, setNational] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const dial = dialCodeOf(loc?.country);
  const phoneMsg = national ? phoneError(national, dial, loc?.country) : null;
  const check = useUsernameCheck(username);

  const stepOneProblem = (): string | null => {
    if (!firstName.trim()) return 'Enter your first name.';
    if (!lastName.trim()) return 'Enter your last name.';
    if (phoneMsg) return phoneMsg;
    return null;
  };
  const stepTwoProblem = (): string | null => {
    if (check.ok === false) return check.reason ?? 'This username is already taken.';
    if (password.length < 8) return 'Password needs at least 8 characters.';
    if (passwordScore(password) < 2) return 'Choose a stronger password: mix letters, numbers and symbols.';
    if (password !== confirmPw) return 'Passwords do not match.';
    return null;
  };

  const next = () => {
    const p = stepOneProblem();
    setMsg(p ? t(p) : '');
    if (!p) setStep(2);
  };

  const submit = async () => {
    if (busy) return;
    const p = stepOneProblem() ?? stepTwoProblem();
    if (p) { setMsg(t(p)); return; }
    setBusy(true); setMsg('');
    try {
      const phone = national ? toInternational(national, dial, loc?.country) : null;
      await signUp({
        username: clean(username), firstName: firstName.trim(), lastName: lastName.trim(), password,
        meta: { agrolinkLocation: loc, agrolinkPhone: phone, agrolinkName: `${firstName.trim()} ${lastName.trim()}`, agrolinkRole: role },
      });
      if (from === 'onboarding' && router.canGoBack()) router.back(); else router.replace('/messages');
    } catch (e) { setMsg(t(apiError(e))); }
    finally { setBusy(false); }
  };

  const usernameRight = check.v && check.ok === null && USERNAME_RE.test(check.v)
    ? <ActivityIndicator size="small" color={c.mutedForeground} />
    : check.ok === true ? <Feather name="check-circle" size={18} color={c.primary} />
      : check.ok === false ? <Feather name="x-circle" size={18} color={c.destructive} /> : null;

  if (step === 1) {
    return (
      <AuthShell kicker={t('STEP 1 OF 2 · ABOUT YOU')} title={t('Create account')} step={[1, 2]}
        sub={t('Other builders and owners find you by first and last name, so use your real name.')}>
        <Animated.View key="s1" entering={FadeInRight.duration(260)} exiting={FadeOutLeft.duration(180)} style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AuthInput label={t('First name')} icon="user" value={firstName} onChangeText={setFirstName} placeholder="Leyla" autoComplete="given-name" testID="signup-first" />
            </View>
            <View style={{ flex: 1 }}>
              <AuthInput label={t('Last name')} icon="users" value={lastName} onChangeText={setLastName} placeholder="Mammadova" autoComplete="family-name" testID="signup-last" />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t('Role')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <Chip key={r} label={t(ROLE_LABEL[r])} active={role === r} onPress={() => setRole(r)} />)}
            </View>
          </View>
          <LocationPicker value={loc} onChange={setLoc} testID="signup-loc" />
          <PhoneField country={loc?.country} value={national} onChange={setNational} testID="signup-phone" />
          <ErrorText>{msg}</ErrorText>
          <Button label={t('Continue')} icon="arrow-right" onPress={next} disabled={!firstName.trim() || !lastName.trim()} testID="signup-next" />
        </Animated.View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Muted>{t('Already registered?')}</Muted>
          <Button label={t('Sign in instead')} variant="ghost" onPress={() => router.replace(from ? `/sign-in?from=${from}` : '/sign-in')} style={{ alignSelf: 'stretch' }} />
        </View>
        <ServerSettings />
      </AuthShell>
    );
  }

  return (
    <AuthShell kicker={t('STEP 2 OF 2 · YOUR LOGIN')} title={t('Username and password')} step={[2, 2]}
      sub={t('You sign in with these on the phone and on the website. Passwords are stored only as a secure hash.')}>
      <Animated.View key="s2" entering={FadeInRight.duration(260)} style={{ gap: 16 }}>
        <AuthInput label={t('Username')} icon="at-sign" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
          autoComplete="username-new" placeholder="leyla_farm" testID="signup-username" maxLength={25} right={usernameRight}
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => pwRef.current?.focus()}
          hint={check.ok === true ? t('Username is free') : check.ok === false ? t(check.reason ?? 'This username is already taken.') : t('3–24 Latin letters, numbers, dots or underscores.')}
          hintTone={check.ok === true ? 'ok' : check.ok === false ? 'bad' : 'muted'} />
        <PasswordInput label={t('Password')} value={password} onChangeText={setPassword} meter placeholder={t('At least 8 characters')}
          testID="signup-password" autoComplete="new-password" inputRef={pwRef} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
        <PasswordInput label={t('Confirm password')} value={confirmPw} onChangeText={setConfirmPw} placeholder={t('Type it again')}
          testID="signup-password-confirm" onSubmitEditing={submit} autoComplete="new-password" inputRef={confirmRef} returnKeyType="done" />
        {confirmPw && confirmPw !== password ? <ErrorText>{t('Passwords do not match.')}</ErrorText> : null}
        <ErrorText>{msg}</ErrorText>
        <Button label={t('Create account')} icon="check" onPress={submit} loading={busy}
          disabled={!username || !password || !confirmPw || check.ok === false} testID="signup-submit" />
        <Button label={t('Back')} variant="ghost" icon="arrow-left" onPress={() => { setMsg(''); setStep(1); }} disabled={busy} />
      </Animated.View>
    </AuthShell>
  );
}
