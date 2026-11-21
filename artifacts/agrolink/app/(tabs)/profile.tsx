import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppAuth as useAuth, useAppUser as useUser } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Avatar, Body, Button, Card, Chip, F, H2, Muted, Notice, Press, StatusBarScrim, TAB_SPACE, Tag, useTopInset, type IconName } from '@/components/ui';
import { ROLE_LABEL, shownName } from '@/lib/demo';
import { countryLabel, locationLabel } from '@/lib/geo';
import { confirm, shareText } from '@/lib/device';
import { groupThousands, isoDay } from '@/lib/util';
import { LANGS, t, useI18n } from '@/lib/i18n';
import { BrandLogo } from '@/components/BrandLogo';


function Row({ icon, label, value, onPress }: { icon: IconName; label: string; value?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Press onPress={onPress} style={[styles.row, { borderColor: c.border }]} accessibilityLabel={value ? `${label}, ${value}` : label}>
      <View style={[styles.rowIcon, { backgroundColor: c.muted }]}><Feather name={icon} size={18} color={c.forest} /></View>
      <Text style={[styles.rowLabel, { color: c.foreground }]}>{label}</Text>
      {value ? <Muted>{value}</Muted> : null}
      <Feather name="chevron-right" size={20} color={c.mutedForeground} />
    </Press>
  );
}

export default function ProfileTab() {
  const c = useColors();
  const top = useTopInset();
  const router = useRouter();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { state, isGuest, resetScope } = useAppData();
  const p = state.profile;
  const { lang, setLang } = useI18n();
  const myListings = state.listings.filter((l) => l.mine).length;
  const myFields = state.fields.filter((f) => !f.sample && !f.example).length;
  const myHa = state.fields.filter((f) => !f.sample && !f.example).reduce((a, f) => a + f.areaHa, 0);
  const diary = state.logs.length;
  const saved = (state.favorites ?? []).length;

  // Everything lives on this device, so give people a way to keep a copy.
  const exportData = () => {
    const { posts: _legacyPosts, ...rest } = state;
    const payload = { app: 'BuildGO', version: 1, exportedAt: new Date().toISOString(), ...rest };
    shareText(`buildgo-backup-${isoDay(new Date())}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  return (
    <View style={{ flex: 1 }}>
    <StatusBarScrim />
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 12, paddingBottom: TAB_SPACE, paddingHorizontal: 18, gap: 16 }}>
      <View style={[styles.card, { backgroundColor: c.forest, borderRadius: c.radius + 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={shownName(p.name)} size={64} tone={c.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.primaryForeground }]} numberOfLines={1}>{shownName(p.name)}</Text>
            <Text style={[styles.sub, { color: c.accent }]}>{ROLE_LABEL[p.role]}</Text>
            <Text style={[styles.sub, { color: c.onForestMuted }]}>{[p.village, locationLabel(p)].filter(Boolean).join(', ')}</Text>
            {p.phone ? <Text style={[styles.sub, { color: c.onForestMuted }]}>{p.phone}</Text> : null}
          </View>
          <Press onPress={() => router.push('/profile-edit')} style={[styles.edit, { backgroundColor: c.forestSoft }]} testID="edit-profile" accessibilityLabel={t('Edit profile')}>
            <Feather name="edit-2" size={20} color={c.accent} />
          </Press>
        </View>
        {p.crops.length ? (
          <View style={styles.crops}>{p.crops.map((x) => <Tag key={x} label={t(x)} color={c.forestSoft} fg={c.primaryForeground} />)}</View>
        ) : null}
        <View style={styles.stats}>
          {[[myFields, t('My sites')], [groupThousands(myHa * 10000), t('Area, m²')], [diary, t('Work log')], [myListings, t('Listings')]].map(([n, l]) => (
            <View key={l as string} style={{ flex: 1 }}>
              <Text style={[styles.statN, { color: c.accent }]}>{n}</Text>
              <Text style={[styles.statL, { color: c.onForestMuted }]}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name={isSignedIn ? 'shield' : 'user-x'} size={20} color={isSignedIn ? c.primary : c.clay} />
          <H2 style={{ flex: 1 }}>{isSignedIn ? t('Signed in') : t('Browsing as guest')}</H2>
        </View>
        {isSignedIn && user ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Body style={{ fontSize: 15, fontFamily: F.s }}>{user.fullName}</Body>
              <Muted>@{user.username}</Muted>
              {user.isAdmin ? <Tag label={t('Admin')} color={c.accent} fg={c.forest} /> : null}
            </View>
            <Muted>{t('Chats and contacts are saved on the BuildGO server and are the same on the phone and the website. Sites and the work log stay on this device.')}</Muted>
            {user.isAdmin ? <Button label={t('Admin panel')} icon="shield" variant="accent" onPress={() => router.push('/admin')} testID="open-admin" /> : null}
            <Button label={t('My documents and machines')} icon="credit-card" variant="secondary" onPress={() => router.push('/documents')} testID="open-documents" />
            <Button label={t('Sign out')} icon="log-out" variant="ghost" testID="sign-out"
              onPress={() => confirm(t('Sign out?'), t('Guest data on this phone will show again.'), () => { signOut().catch(() => {}); }, t('Sign out'))} />
          </>
        ) : (
          <>
            <Muted>{t('Create an account to chat with other builders. Guest data stays on this phone under the guest space.')}</Muted>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={t('Sign in')} icon="log-in" onPress={() => router.push('/sign-in')} style={{ flex: 1 }} testID="go-sign-in" />
              <Button label={t('Sign up')} variant="accent" onPress={() => router.push('/sign-up')} style={{ flex: 1 }} testID="go-sign-up" />
            </View>
          </>
        )}
      </Card>

      <Card style={{ padding: 16, gap: 12 }} testID="language">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="globe" size={20} color={c.primary} />
          <H2 style={{ flex: 1 }}>{t('Language')}</H2>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LANGS.map((l) => (
            <View key={l.code} testID={`lang-${l.code}`}>
              <Chip label={l.name} active={lang === l.code} onPress={() => { if (l.code !== lang) setLang(l.code); }} />
            </View>
          ))}
        </View>
      </Card>

      <Notice text={t('Sites and the work log live on this device. Rentals and example sites include sample content. Chats are live. Weather is live from Open-Meteo when online.')} />

      <Card>
        <Row icon="user" label={t('Profile, role and kinds of work')} onPress={() => router.push('/profile-edit')} />
        <Row icon="globe" label={t('Country and region')} value={countryLabel(p.country, p.countryName) || t('Not set')} onPress={() => router.push('/profile-edit')} />
        <Row icon="compass" label={t('Replay introduction')} onPress={() => router.push('/onboarding')} />
        <Row icon="file-text" label={t('Deal conditions')} value={t('Rent · Sale · Materials')} onPress={() => router.push('/conditions')} />
        <Row icon="truck" label={t('My equipment')} value={String(myListings)} onPress={() => router.navigate({ pathname: '/rent', params: { mode: 'mine' } })} />
        <Row icon="heart" label={t('Saved listings')} value={String(saved)} onPress={() => router.navigate({ pathname: '/rent', params: { mode: 'saved' } })} />
        <Row icon="download" label={t('Export my data')} value="JSON" onPress={exportData} />
        <Row icon="refresh-ccw" label={isGuest ? t('Reset guest data') : t('Reset account data')}
          onPress={() => confirm(t('Reset local data?'), t('Sites, work log and bookings in this space go back to the starting sample.'), resetScope, t('Reset'))} />
      </Card>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <BrandLogo width={126} height={38} />
        <Muted style={{ textAlign: 'center' }}>BuildGO 2.0.5 · {isSignedIn ? t('accounts on') : t('guest mode')} · {t('weather by Open-Meteo')}</Muted>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 16 },
  name: { fontFamily: F.b, fontSize: 22, letterSpacing: -0.4 },
  sub: { fontFamily: F.s, fontSize: 13, marginTop: 2 },
  edit: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  crops: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  statN: { fontFamily: F.b, fontSize: 22 },
  statL: { fontFamily: F.m, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60, borderBottomWidth: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: F.s, fontSize: 15 },
});
