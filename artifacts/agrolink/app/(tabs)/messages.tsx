import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptChatRequest, cancelChatRequest, declineChatRequest, getListChatRequestsQueryKey, getListConversationsQueryKey,
  searchPeople, sendChatRequest, useListChatRequests, useListConversations,
  type ChatConversation, type ChatRequest, type PersonResult,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppAuth } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { useConnection, useTyping } from '@/lib/realtime';
import { fmtDuration } from '@/lib/voice';
import { Button, Card, Empty, F, H1, Muted, Press, Segmented, StatusBarScrim, TAB_SPACE, useTopInset } from '@/components/ui';
import { PresenceAvatar, TypingDots } from '@/components/Chat';
import { notify } from '@/lib/device';
import { timeAgo } from '@/lib/util';
import { t, tp } from '@/lib/i18n';

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

function useDebounced(v: string, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
}

export default function Messages() {
  const c = useColors();
  const top = useTopInset();
  const router = useRouter();
  const { isSignedIn } = useAppAuth();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');
  const query = useDebounced(q.trim());
  const searching = query.length >= 2;
  const conn = useConnection();

  const conversations = useListConversations({ query: { queryKey: getListConversationsQueryKey(), enabled: !!isSignedIn, staleTime: 30_000 } });
  const requests = useListChatRequests({ query: { queryKey: getListChatRequestsQueryKey(), enabled: !!isSignedIn, staleTime: 30_000 } });
  const people = useQuery({ queryKey: ['people', query], queryFn: () => searchPeople({ q: query }), enabled: !!isSignedIn && searching, staleTime: 10_000 });
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];

  if (!isSignedIn) return <GuestGate />;

  const header = (
    <View style={{ gap: 14, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <H1 style={{ flex: 1 }}>{t('Messages')}</H1>
        {conn !== 'online' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.conn, { backgroundColor: c.muted }]}>
            <ActivityIndicator size="small" color={c.mutedForeground} />
            <Muted>{t('Connecting…')}</Muted>
          </Animated.View>
        ) : null}
      </View>
      <View style={[styles.search, { backgroundColor: c.card, borderColor: q ? c.primary : c.border }]}>
        <Feather name="search" size={18} color={q ? c.primary : c.mutedForeground} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('Find people by first and last name')} placeholderTextColor={c.mutedForeground}
          autoCorrect={false} testID="people-search" returnKeyType="search"
          style={[styles.searchInput, { color: c.foreground }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {q ? <Press onPress={() => setQ('')} haptic={false} hitSlop={8} accessibilityLabel={t('Clear')}><Feather name="x-circle" size={18} color={c.mutedForeground} /></Press> : null}
      </View>
      {!searching ? (
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'chats', label: t('Chats'), icon: 'message-circle' },
          { value: 'requests', label: incoming.length ? `${t('Requests')} · ${incoming.length}` : t('Requests'), icon: 'user-plus' },
        ]} />
      ) : null}
    </View>
  );

  if (searching) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBarScrim />
        <FlatList
          data={people.data ?? []}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: top + 12, paddingBottom: TAB_SPACE, gap: 10 }}
          ListHeaderComponent={header}
          ListEmptyComponent={people.isFetching
            ? <ActivityIndicator style={{ marginTop: 30 }} color={c.primary} />
            : <Empty icon="search" title={t('Nobody found')} body={t('Check the spelling or try just the first name.')} />}
          renderItem={({ item, index }) => <PersonRow person={item} index={index} />}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBarScrim />
      {tab === 'chats' ? (
        <FlatList
          data={conversations.data ?? []}
          keyExtractor={(x) => x.id}
          refreshing={conversations.isRefetching}
          onRefresh={() => { void conversations.refetch(); }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: top + 12, paddingBottom: TAB_SPACE, gap: 10 }}
          ListHeaderComponent={<>
            {header}
            {incoming.length ? (
              <Press onPress={() => setTab('requests')} style={[styles.reqBanner, { backgroundColor: c.forest }]} testID="requests-banner">
                <Feather name="user-plus" size={18} color={c.accent} />
                <Text style={{ flex: 1, fontFamily: F.s, fontSize: 14, color: c.primaryForeground }}>
                  {tp(incoming.length, '{n} person wants to message you', '{n} people want to message you')}
                </Text>
                <Feather name="chevron-right" size={18} color={c.accent} />
              </Press>
            ) : null}
          </>}
          ListEmptyComponent={conversations.isLoading
            ? <ActivityIndicator style={{ marginTop: 30 }} color={c.primary} />
            : conversations.error
              ? <Empty icon="wifi-off" title={t('No connection')} body={t(apiError(conversations.error))}
                  action={<Button label={t('Retry')} onPress={() => { void conversations.refetch(); }} />} />
              : <Empty icon="message-circle" title={t('No chats yet')} body={t('Search for a person by name above and ask to chat. When they accept, the chat appears here.')} />}
          renderItem={({ item, index }) => <ConversationRow conv={item} index={index} onPress={() => router.push(`/chat/${item.id}`)} />}
        />
      ) : (
        <FlatList
          data={[...incoming.map((r) => ({ r, dir: 'in' as const })), ...outgoing.map((r) => ({ r, dir: 'out' as const }))]}
          keyExtractor={(x) => x.r.id}
          refreshing={requests.isRefetching}
          onRefresh={() => { void requests.refetch(); }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: top + 12, paddingBottom: TAB_SPACE, gap: 10 }}
          ListHeaderComponent={header}
          ListEmptyComponent={<Empty icon="user-plus" title={t('No requests')} body={t('Requests to chat with you, and the ones you sent, appear here.')} />}
          renderItem={({ item, index }) => <RequestRow req={item.r} dir={item.dir} index={index} />}
        />
      )}
    </View>
  );
}

function GuestGate() {
  const c = useColors();
  const top = useTopInset();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 12, paddingHorizontal: 18, gap: 16 }}>
      <H1>{t('Messages')}</H1>
      <Animated.View entering={FadeInDown.duration(400)}>
        <LinearGradient colors={[c.forest, c.forestSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gate}>
          <View style={[styles.gateIcon, { backgroundColor: 'rgba(255,192,46,0.20)' }]}><Feather name="message-circle" size={30} color={c.accent} /></View>
          <Text style={[styles.gateT, { color: c.primaryForeground }]}>{t('Chat with builders and machine owners near you')}</Text>
          <Text style={[styles.gateB, { color: c.onForestMuted }]}>
            {t('Find people by name, ask to chat, then send messages and voice notes. Works the same on the phone and on the website.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            <Button label={t('Sign in')} icon="log-in" variant="accent" onPress={() => router.push('/sign-in')} style={{ flex: 1 }} testID="msg-sign-in" />
            <Button label={t('Sign up')} onPress={() => router.push('/sign-up')} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function ConversationRow({ conv, index, onPress }: { conv: ChatConversation; index: number; onPress: () => void }) {
  const c = useColors();
  const typing = useTyping(conv.id);
  const last = conv.last;
  const mine = last && last.senderId !== conv.peer.id;
  const seen = mine && last && conv.peerReadAt >= last.at;
  const preview = !last ? t('Say hello 👋') : last.kind === 'voice' ? `🎤 ${t('Voice message')} · ${fmtDuration(last.durationMs ?? 0)}` : last.text;
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 8) * 40)} layout={LinearTransition.springify().damping(18)}>
      <Card onPress={onPress} style={styles.row} testID={`conv-${conv.id}`}>
        <PresenceAvatar id={conv.peer.id} name={fullName(conv.peer)} online={conv.peer.online} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.name, { color: c.foreground }]} numberOfLines={1}>{fullName(conv.peer)}</Text>
            <Muted style={{ marginLeft: 'auto' }}>{last ? timeAgo(last.at) : ''}</Muted>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {typing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <TypingDots color={c.primary} />
                <Text style={[styles.last, { color: c.primary, fontFamily: F.s }]}>{t('typing…')}</Text>
              </View>
            ) : (
              <>
                {mine ? <Feather name={seen ? 'check-circle' : 'check'} size={14} color={seen ? c.primary : c.mutedForeground} /> : null}
                <Text style={[styles.last, { color: conv.unread ? c.foreground : c.mutedForeground, fontFamily: conv.unread ? F.s : F.r, flex: 1 }]} numberOfLines={1}>
                  {preview}
                </Text>
              </>
            )}
            {conv.unread ? (
              <Animated.View entering={FadeIn} style={[styles.badge, { backgroundColor: c.primary }]}>
                <Text style={styles.badgeT}>{conv.unread > 99 ? '99+' : conv.unread}</Text>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function PersonRow({ person, index }: { person: PersonResult; index: number }) {
  const c = useColors();
  const router = useRouter();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = () => Promise.all([
    cache.invalidateQueries({ queryKey: ['people'] }),
    cache.invalidateQueries({ queryKey: getListChatRequestsQueryKey() }),
    cache.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
  ]);
  const act = async () => {
    if (busy) return;
    if (person.relation === 'connected' && person.conversationId) { router.push(`/chat/${person.conversationId}`); return; }
    setBusy(true);
    try {
      if (person.relation === 'none') {
        const r = await sendChatRequest({ userId: person.id });
        if (r.conversation) router.push(`/chat/${r.conversation.id}`);
        else notify(t('Request sent'), t('{name} can now accept your request to chat.', { name: person.firstName }), 'success');
      } else if (person.relation === 'incoming' && person.requestId) {
        const conv = await acceptChatRequest(person.requestId);
        router.push(`/chat/${conv.id}`);
      } else if (person.relation === 'requested' && person.requestId) {
        await cancelChatRequest(person.requestId);
      }
      await refresh();
    } catch (e) { notify(t('Could not send'), t(apiError(e)), 'error'); }
    finally { setBusy(false); }
  };
  const label = { none: t('Ask to chat'), requested: t('Cancel request'), incoming: t('Accept'), connected: t('Open chat') }[person.relation];
  const icon = ({ none: 'user-plus', requested: 'x', incoming: 'check', connected: 'message-circle' } as const)[person.relation];
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}>
      <Card style={styles.row} testID={`person-${person.username}`}>
        <PresenceAvatar id={person.id} name={fullName(person)} online={person.online} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: c.foreground }]} numberOfLines={1}>{fullName(person)}</Text>
          <Muted numberOfLines={1}>@{person.username}{person.relation === 'requested' ? ` · ${t('request sent')}` : person.relation === 'incoming' ? ` · ${t('wants to chat')}` : ''}</Muted>
        </View>
        <Press onPress={act} disabled={busy} testID={`person-action-${person.username}`}
          style={[styles.pill, { backgroundColor: person.relation === 'requested' ? c.muted : person.relation === 'connected' ? c.secondary : c.forest }]}>
          {busy ? <ActivityIndicator size="small" color={c.accent} /> : <Feather name={icon} size={15} color={person.relation === 'requested' || person.relation === 'connected' ? c.forest : c.accent} />}
          <Text style={[styles.pillT, { color: person.relation === 'requested' || person.relation === 'connected' ? c.forest : c.primaryForeground }]}>{label}</Text>
        </Press>
      </Card>
    </Animated.View>
  );
}

function RequestRow({ req, dir, index }: { req: ChatRequest; dir: 'in' | 'out'; index: number }) {
  const c = useColors();
  const router = useRouter();
  const cache = useQueryClient();
  const [busy, setBusy] = useState<'' | 'yes' | 'no'>('');
  const who = dir === 'in' ? req.from : req.to;
  const run = (kind: 'yes' | 'no', fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(kind);
    try { await fn(); await cache.invalidateQueries({ queryKey: getListChatRequestsQueryKey() }); }
    catch (e) { notify(t('Something went wrong'), t(apiError(e)), 'error'); }
    finally { setBusy(''); }
  };
  const when = useMemo(() => timeAgo(req.createdAt), [req.createdAt]);
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)} exiting={FadeOut.duration(150)} layout={LinearTransition}>
      <Card style={{ padding: 14, gap: 12 }} testID={`request-${who.username}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PresenceAvatar id={who.id} name={fullName(who)} online={who.online} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.name, { color: c.foreground }]} numberOfLines={1}>{fullName(who)}</Text>
            <Muted>{dir === 'in' ? t('wants to message you') : t('waiting for an answer')} · {when}</Muted>
          </View>
        </View>
        {dir === 'in' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('Decline')} variant="ghost" onPress={run('no', () => declineChatRequest(req.id))} loading={busy === 'no'} style={{ flex: 1, minHeight: 46 }} testID={`decline-${who.username}`} />
            <Button label={t('Accept')} icon="check" onPress={run('yes', async () => { const conv = await acceptChatRequest(req.id); router.push(`/chat/${conv.id}`); })}
              loading={busy === 'yes'} style={{ flex: 1, minHeight: 46 }} testID={`accept-${who.username}`} />
          </View>
        ) : (
          <Button label={t('Cancel request')} variant="ghost" onPress={run('no', () => cancelChatRequest(req.id))} loading={busy === 'no'} style={{ minHeight: 46 }} />
        )}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  conn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 26, borderWidth: 1.5, paddingHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 48, fontFamily: F.m, fontSize: 16 },
  reqBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 80 },
  name: { fontFamily: F.b, fontSize: 16, flexShrink: 1 },
  last: { fontSize: 14 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeT: { fontFamily: F.b, fontSize: 11, color: '#FFFFFF' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 38, borderRadius: 19 },
  pillT: { fontFamily: F.b, fontSize: 13 },
  gate: { borderRadius: 26, padding: 22, gap: 12, alignItems: 'flex-start' },
  gateIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  gateT: { fontFamily: F.b, fontSize: 22, letterSpacing: -0.4 },
  gateB: { fontFamily: F.m, fontSize: 14, lineHeight: 20, marginBottom: 6 },
});
