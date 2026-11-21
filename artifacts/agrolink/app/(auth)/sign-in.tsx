import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthInput, AuthShell, ErrorText, PasswordInput } from '@/components/AuthShell';
import { ServerSettings } from '@/components/ServerSettings';
import { Button, Muted } from '@/components/ui';
import { useAuthActions } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { t } from '@/lib/i18n';

export default function SignIn() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !username.trim() || !password) return;
    setBusy(true); setMsg('');
    try {
      await signIn(username.trim(), password);
      // From the first-run screen: go back to it, it finishes itself for a signed-in account.
      if (from === 'onboarding' && router.canGoBack()) router.back(); else router.replace('/messages');
    } catch (e) { setMsg(t(apiError(e))); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell kicker={t('WELCOME BACK')} title={t('Sign in')} sub={t('Your chats and contacts are kept on the BuildGO server, the same on the phone app and the website.')}>
      <AuthInput label={t('Username')} icon="at-sign" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
        autoComplete="username" placeholder="username" testID="signin-username" returnKeyType="next" />
      <PasswordInput label={t('Password')} value={password} onChangeText={setPassword} placeholder={t('Password')} testID="signin-password"
        onSubmitEditing={submit} autoComplete="current-password" />
      <ErrorText>{msg}</ErrorText>
      <Button label={t('Sign in')} icon="log-in" onPress={submit} loading={busy} disabled={!username.trim() || !password} testID="signin-submit" />
      <View style={{ alignItems: 'center', gap: 8, marginTop: 2 }}>
        <Muted>{t('New to BuildGO?')}</Muted>
        <Button label={t('Create an account')} variant="ghost" icon="user-plus" onPress={() => router.replace(from ? `/sign-up?from=${from}` : '/sign-up')} style={{ alignSelf: 'stretch' }} testID="go-sign-up" />
      </View>
      <ServerSettings />
    </AuthShell>
  );
}
