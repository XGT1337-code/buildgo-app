import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAdminUser, getGetAdminStatsQueryKey, listAdminUsers, updateAdminUser, useGetAdminStats, type AdminUser,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppUser } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { Card, Empty, F, Muted, Press, Segmented, Tag } from '@/components/ui';
import { CatalogAdmin, ReviewQueue } from '@/components/AdminTabs';
import { PresenceAvatar } from '@/components/Chat';
import { confirm, notify } from '@/lib/device';
import { timeAgo } from '@/lib/util';
import { t } from '@/lib/i18n';
import type { IconName } from '@/components/ui';

/**
 * Admin dashboard. Users: block/unblock, promote, delete (no access to chat contents).
 * Review: listings, machines and licences waiting for a decision. Catalog: reference data with plausibility checks.
 */
export default function Admin() {
  const c = useColors();
  const { user } = useAppUser();
  const cache = useQueryClient();
  const [tab, setTab] = useState<'users' | 'review' | 'catalog'>('review');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  const stats = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey(), enabled: !!user?.isAdmin, refetchInterval: 15_000 } });
  const users = useQuery({ queryKey: ['admin-users', debounced], queryFn: () => listAdminUsers(debounced ? { q: debounced } : undefined), enabled: !!user?.isAdmin && tab === 'users' });

  if (!user?.isAdmin) return <Empty icon="lock" title={t('Admins only')} body={t('Sign in with an administrator account to open this panel.')} />;

  const refresh = () => Promise.all([
    cache.invalidateQueries({ queryKey: ['admin-users'] }),
    cache.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }),
  ]);
  const s = stats.data;
  const tiles: [IconName, string, number | undefined, string][] = [
    ['users', t('Accounts'), s?.users, c.primary],
    ['activity', t('Online now'), s?.online, '#3CC46B'],
    ['clipboard', t('To review'), s?.pendingReviews, c.clay],
    ['truck', t('Published listings'), s?.listings, c.sky],
    ['message-circle', t('Chats'), s?.conversations, c.wheat],
    ['mic', t('Voice notes'), s?.voiceMessages, c.forestSoft],
  ];

  const header = (
    <View style={{ gap: 14, marginBottom: 6 }}>
      <LinearGradient colors={[c.forest, c.forestSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="shield" size={20} color={c.accent} />
          <Text style={[styles.heroT, { color: c.primaryForeground }]}>{t('Admin panel')}</Text>
        </View>
        <Text style={{ fontFamily: F.m, fontSize: 13, color: c.onForestMuted }}>
          {t('Signed in as @{u}. Private chats stay private: you manage accounts, not their messages.', { u: user.username })}
        </Text>
      </LinearGradient>
      <View style={styles.grid}>
        {tiles.map(([icon, label, n, tone], i) => (
          <Animated.View key={label} entering={FadeInDown.duration(300).delay(i * 40)} style={[styles.tile, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.tileIcon, { backgroundColor: `${tone}22` }]}><Feather name={icon} size={16} color={tone} /></View>
            <Text style={[styles.tileN, { color: c.foreground }]}>{n ?? '–'}</Text>
            <Muted>{label}</Muted>
          </Animated.View>
        ))}
      </View>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'review', label: s?.pendingReviews ? `${t('Moderation')} · ${s.pendingReviews}` : t('Moderation'), icon: 'clipboard' },
        { value: 'users', label: t('Users'), icon: 'users' },
        { value: 'catalog', label: t('Catalog'), icon: 'book' },
      ]} />
      {tab === 'users' ? (
        <>
          <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
            <Feather name="search" size={18} color={c.mutedForeground} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('Search accounts')} placeholderTextColor={c.mutedForeground} autoCorrect={false}
              style={[{ flex: 1, minHeight: 46, fontFamily: F.m, fontSize: 15, color: c.foreground }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
              testID="admin-search" />
          </View>
          {s ? <Muted>{t('{n} banned · {r} pending chat requests', { n: s.banned, r: s.pendingRequests })}</Muted> : null}
        </>
      ) : null}
    </View>
  );

  if (tab === 'review') return <ReviewQueue header={header} />;
  if (tab === 'catalog') return <CatalogAdmin header={header} />;
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={users.data ?? []}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      ListHeaderComponent={header}
      ListEmptyComponent={users.isLoading ? <ActivityIndicator color={c.primary} /> : <Empty icon="users" title={t('No accounts')} body={t('Nobody matches this search.')} />}
      renderItem={({ item }) => <UserRow u={item} self={item.id === user.id} onChanged={refresh} />}
    />
  );
}

function UserRow({ u, self, onChanged }: { u: AdminUser; self: boolean; onChanged: () => Promise<unknown> }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const name = `${u.firstName} ${u.lastName}`;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); await onChanged(); notify(done, name, 'success'); }
    catch (e) { notify(t('Something went wrong'), t(apiError(e)), 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOut.duration(150)} layout={LinearTransition}>
      <Card style={{ padding: 14, gap: 12, opacity: u.banned ? 0.75 : 1 }} testID={`admin-user-${u.username}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PresenceAvatar id={u.id} name={name} online={u.online} size={46} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: F.b, fontSize: 15, color: c.foreground }} numberOfLines={1}>{name}</Text>
              {u.role === 'admin' ? <Tag label={t('Admin')} color={c.accent} fg={c.forest} /> : null}
              {u.banned ? <Tag label={t('Blocked')} color="#FBE9E4" fg={c.destructive} /> : null}
            </View>
            <Muted numberOfLines={1}>@{u.username} · {t('joined {when}', { when: timeAgo(u.createdAt) })}</Muted>
          </View>
          {busy ? <ActivityIndicator color={c.primary} /> : null}
        </View>
        {!self ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action icon={u.banned ? 'unlock' : 'slash'} label={u.banned ? t('Unblock') : t('Block')} tone={u.banned ? c.primary : c.clay} disabled={busy}
              onPress={() => run(() => updateAdminUser(u.id, { banned: !u.banned }), u.banned ? t('Unblocked') : t('Blocked'))} />
            <Action icon="award" label={u.role === 'admin' ? t('Remove admin') : t('Make admin')} tone={c.sky} disabled={busy}
              onPress={() => confirm(u.role === 'admin' ? t('Remove admin rights?') : t('Make this person an admin?'), name,
                () => { void run(() => updateAdminUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }), t('Saved')); }, t('Confirm'), false)} />
            <Action icon="trash-2" label={t('Delete')} tone={c.destructive} disabled={busy}
              onPress={() => confirm(t('Delete this account?'), t('{name} and all their chats will be removed for good.', { name }),
                () => { void run(() => deleteAdminUser(u.id), t('Deleted')); }, t('Delete'))} />
          </View>
        ) : <Muted>{t('This is you')}</Muted>}
      </Card>
    </Animated.View>
  );
}

function Action({ icon, label, tone, onPress, disabled }: { icon: IconName; label: string; tone: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Press onPress={onPress} disabled={disabled} style={[styles.action, { backgroundColor: `${tone}18` }]}>
      <Feather name={icon} size={14} color={tone} />
      <Text style={{ fontFamily: F.s, fontSize: 12, color: tone }} numberOfLines={1}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, padding: 18, gap: 8 },
  heroT: { fontFamily: F.b, fontSize: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, borderRadius: 18, borderWidth: 1, padding: 12, gap: 4 },
  tileIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileN: { fontFamily: F.b, fontSize: 22 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 12, paddingHorizontal: 6 },
});
