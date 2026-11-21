import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Button, F, Muted, Press } from '@/components/ui';
import { AuthInput } from '@/components/AuthShell';
import { apiBase, apiUrl, setServerUrl } from '@/lib/api';
import { t } from '@/lib/i18n';

/**
 * The phone app talks to the BuildGO server over the network. The address is baked into the APK,
 * but can be changed here (for example the PC's Wi-Fi address, or a hosted server).
 */
export function ServerSettings() {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(apiBase());
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  if (Platform.OS === 'web') return null;
  const check = async () => {
    setState('checking');
    await setServerUrl(url);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(apiUrl('/api/healthz'), { signal: ctl.signal });
      clearTimeout(timer);
      setState(r.ok ? 'ok' : 'bad');
    } catch { setState('bad'); }
  };
  return (
    <View style={{ gap: 10 }}>
      <Press onPress={() => setOpen((o) => !o)} haptic={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', padding: 6 }}>
        <Feather name="server" size={14} color={c.mutedForeground} />
        <Muted>{t('Server')}: {apiBase().replace(/^https?:\/\//, '') || t('not set')}</Muted>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={14} color={c.mutedForeground} />
      </Press>
      {open ? (
        <Animated.View entering={FadeInDown.duration(200)} style={{ gap: 10 }}>
          <AuthInput label={t('Server address')} icon="globe" value={url} onChangeText={(v) => { setUrl(v); setState('idle'); }}
            placeholder="http://192.168.1.10:8080" autoCapitalize="none" autoCorrect={false} keyboardType="url" testID="server-url"
            hint={state === 'ok' ? t('Connected') : state === 'bad' ? t('No answer from this address') : undefined}
            hintTone={state === 'ok' ? 'ok' : 'bad'} />
          <Button label={t('Save and check')} icon="wifi" variant="secondary" onPress={check} loading={state === 'checking'} />
          <Text style={{ fontFamily: F.r, fontSize: 12, color: c.mutedForeground, lineHeight: 17 }}>
            {t('Use the address of the computer running the BuildGO server, or your hosted server URL.')}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
