import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn, FadeInDown, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState,
} from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import {
  getChatMessages, getGetChatMessagesQueryKey, getListConversationsQueryKey, markConversationRead, sendChatMessage,
  useListConversations, type ChatConversation,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppAuth } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { upsertMessage, useOnline, useRealtime, useTyping, type LocalMessage } from '@/lib/realtime';
import { MAX_VOICE_MS, VOICE_PRESET, fmtDuration, readRecording } from '@/lib/voice';
import { Button, Empty, F, Press, tap } from '@/components/ui';
import { PresenceAvatar, TypingDots, VoiceBubble } from '@/components/Chat';
import { notify } from '@/lib/device';
import { cmpStr, fmtDay, isoDay, timeAgo } from '@/lib/util';
import { fmtTime, t } from '@/lib/i18n';

const PAGE = 60;
const dayOf = (iso: string) => isoDay(new Date(iso));
const dayLabel = (iso: string) => {
  const d = dayOf(iso);
  if (d === isoDay(new Date())) return t('Today');
  if (d === isoDay(new Date(Date.now() - 86_400_000))) return t('Yesterday');
  return fmtDay(d);
};
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

export default function Chat() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const headerH = Platform.OS === 'web' ? 0 : insets.top + (Platform.OS === 'ios' ? 44 : 56);
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSignedIn, userId } = useAppAuth();
  const cache = useQueryClient();
  const { sendTyping, setViewing } = useRealtime();
  const key = getGetChatMessagesQueryKey(id);

  const conversations = useListConversations({ query: { queryKey: getListConversationsQueryKey(), enabled: !!isSignedIn, staleTime: 30_000 } });
  const conv = conversations.data?.find((x) => x.id === id);
  // Live updates come over the socket, so the history is loaded once and then kept in the cache.
  const messages = useQuery<LocalMessage[]>({ queryKey: key, queryFn: () => getChatMessages(id), enabled: !!isSignedIn && !!id, staleTime: Infinity });
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const mountedAt = useRef(new Date().toISOString());
  const typing = useTyping(id);
  const online = useOnline(conv?.peer.id, conv?.peer.online ?? false);

  // While this chat is on screen: incoming messages are read immediately.
  useFocusEffect(useCallback(() => { setViewing(id); return () => setViewing(null); }, [id, setViewing]));
  const lastPeerAt = useMemo(() => [...(messages.data ?? [])].reverse().find((m) => m.senderId !== userId)?.at, [messages.data, userId]);
  useEffect(() => {
    if (!lastPeerAt || !isSignedIn) return;
    const timer = setTimeout(() => { markConversationRead(id).catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [lastPeerAt, id, isSignedIn]);

  React.useLayoutEffect(() => {
    nav.setOptions({
      headerTitle: () => conv ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PresenceAvatar id={conv.peer.id} name={fullName(conv.peer)} online={conv.peer.online} size={36} />
          <View>
            <Text style={{ fontFamily: F.b, fontSize: 16, color: c.foreground }} numberOfLines={1}>{fullName(conv.peer)}</Text>
            {typing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><TypingDots color={c.primary} /><Text style={[styles.sub, { color: c.primary }]}>{t('typing…')}</Text></View>
            ) : (
              <Text style={[styles.sub, { color: online ? c.primary : c.mutedForeground }]}>
                {online ? t('online') : conv.peer.lastSeenAt ? t('last seen {when}', { when: timeAgo(conv.peer.lastSeenAt) }) : `@${conv.peer.username}`}
              </Text>
            )}
          </View>
        </View>
      ) : <Text style={{ fontFamily: F.b, fontSize: 16, color: c.foreground }}>{t('Chat')}</Text>,
    });
  }, [nav, conv, typing, online, c]);

  const all = messages.data ?? [];
  const data = useMemo(() => [...all].reverse(), [all]);

  const deliver = useCallback(async (local: LocalMessage, body: Parameters<typeof sendChatMessage>[1]) => {
    upsertMessage(cache, { ...local, pending: 'sending' });
    try {
      const saved = await sendChatMessage(id, body);
      upsertMessage(cache, { ...saved, localUri: local.localUri });
      cache.setQueryData<ChatConversation[]>(getListConversationsQueryKey(), (list) => list
        ?.map((x) => (x.id === id ? { ...x, last: saved, updatedAt: saved.at } : x))
        .sort((a, b) => cmpStr(b.updatedAt, a.updatedAt)));
    } catch (e) {
      upsertMessage(cache, { ...local, pending: 'failed' });
      notify(t('Not sent'), t(apiError(e)), 'error');
    }
  }, [cache, id]);
  const retries = useRef(new Map<string, Parameters<typeof sendChatMessage>[1]>());

  const sendText = () => {
    const body = text.trim();
    if (!body || !userId) return;
    tap();
    const clientId = randomUUID();
    const local: LocalMessage = { id: `local-${clientId}`, clientId, conversationId: id, senderId: userId, kind: 'text', text: body, at: new Date().toISOString() };
    const req = { clientId, text: body };
    retries.current.set(clientId, req);
    setText('');
    void deliver(local, req);
  };
  const sendVoice = async (uri: string, durationMs: number) => {
    if (!userId) return;
    const clientId = randomUUID();
    const local: LocalMessage = { id: `local-${clientId}`, clientId, conversationId: id, senderId: userId, kind: 'voice', text: '', durationMs, at: new Date().toISOString(), localUri: uri };
    upsertMessage(cache, { ...local, pending: 'sending' });
    try {
      const { data: b64, mime } = await readRecording(uri);
      const req = { clientId, voice: { data: b64, mime, durationMs: Math.round(durationMs) } };
      retries.current.set(clientId, req);
      await deliver(local, req);
    } catch { upsertMessage(cache, { ...local, pending: 'failed' }); }
  };
  const retry = (m: LocalMessage) => {
    const req = retries.current.get(m.clientId);
    if (req) void deliver(m, req);
  };

  const loadOlder = async () => {
    if (!all[0] || loadingOlder || !hasOlder || all.length < PAGE) return;
    setLoadingOlder(true);
    try {
      const page = await getChatMessages(id, { before: all[0].at });
      cache.setQueryData<LocalMessage[]>(key, (list) => [...page.filter((p) => !list?.some((m) => m.id === p.id)), ...(list ?? [])]);
      setHasOlder(page.length === PAGE);
    } catch { /* keep what we have; scrolling up again retries */ }
    finally { setLoadingOlder(false); }
  };

  if (!isSignedIn) return <Empty icon="lock" title={t('Sign in')} body={t('Sign in to find people and send messages.')} />;
  if (conversations.isSuccess && !conv) return <Empty icon="message-circle" title={t('Chat not found')} body={t('This chat is no longer available.')} />;

  const peerReadAt = conv?.peerReadAt ?? '';
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerH} style={{ flex: 1, backgroundColor: c.background }}>
      {messages.error ? (
        <View style={{ padding: 12, gap: 8 }}>
          <Text style={{ fontFamily: F.m, color: c.destructive }}>{t(apiError(messages.error))}</Text>
          <Button label={t('Retry')} variant="ghost" onPress={() => { void messages.refetch(); }} />
        </View>
      ) : null}
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => m.clientId}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14 }}
        initialNumToRender={24}
        maxToRenderPerBatch={16}
        windowSize={15}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={messages.isLoading
          ? <ActivityIndicator color={c.primary} style={{ marginTop: 40 }} />
          : (
            <View style={[styles.hello, { transform: [{ scaleY: -1 }] }]}>
              <Text style={{ fontSize: 40 }}>👋</Text>
              <Text style={{ fontFamily: F.s, fontSize: 15, color: c.mutedForeground, textAlign: 'center' }}>
                {t('You are connected. Say hello or send a voice message.')}
              </Text>
            </View>
          )}
        ListFooterComponent={loadingOlder ? <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} /> : null}
        renderItem={({ item, index }) => {
          const older = data[index + 1];
          const newer = data[index - 1];
          return (
            <Bubble m={item} mine={item.senderId === userId} read={!!peerReadAt && peerReadAt >= item.at}
              newDay={!older || dayOf(older.at) !== dayOf(item.at)}
              tail={!newer || newer.senderId !== item.senderId || dayOf(newer.at) !== dayOf(item.at)}
              fresh={item.at > mountedAt.current} onRetry={retry} />
          );
        }}
      />
      <Composer text={text} setText={(v) => { setText(v); if (v && conv) sendTyping(id, conv.peer.id); }} onSend={sendText} onVoice={sendVoice} bottom={insets.bottom} />
    </KeyboardAvoidingView>
  );
}

const Bubble = memo(function Bubble({ m, mine, read, newDay, tail, fresh, onRetry }: {
  m: LocalMessage; mine: boolean; read: boolean; newDay: boolean; tail: boolean; fresh: boolean; onRetry: (m: LocalMessage) => void;
}) {
  const c = useColors();
  const bubble = (
    <View style={[styles.msg, mine
      ? { backgroundColor: c.forest, borderBottomRightRadius: tail ? 6 : 20 }
      : { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: tail ? 6 : 20 },
    m.pending === 'failed' && { opacity: 0.7 }]}>
      {m.kind === 'voice'
        ? <VoiceBubble id={m.clientId} audioId={m.audioId} localUri={m.localUri} durationMs={m.durationMs ?? 0} mine={mine} />
        : <Text style={[styles.msgT, { color: mine ? c.primaryForeground : c.foreground }]} selectable>{m.text}</Text>}
      <View style={styles.meta}>
        <Text style={[styles.time, { color: mine ? c.onForestMuted : c.mutedForeground }]}>{fmtTime(new Date(m.at))}</Text>
        {mine ? <Ticks state={m.pending ?? (read ? 'read' : 'sent')} /> : null}
      </View>
    </View>
  );
  return (
    <View style={{ marginTop: tail ? 8 : 2 }}>
      {newDay ? (
        <View style={[styles.day, { backgroundColor: c.muted }]}><Text style={[styles.dayT, { color: c.mutedForeground }]}>{dayLabel(m.at)}</Text></View>
      ) : null}
      <Animated.View entering={fresh ? (mine ? ZoomIn.springify().damping(16).stiffness(220) : FadeInDown.springify().damping(18)) : undefined}
        style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {m.pending === 'failed'
          ? <Press onPress={() => onRetry(m)} accessibilityLabel={t('Tap to resend')} style={{ alignItems: 'flex-end', gap: 4 }}>
              {bubble}
              <Text style={{ fontFamily: F.s, fontSize: 11, color: c.destructive }}>{t('Not sent · tap to retry')}</Text>
            </Press>
          : bubble}
      </Animated.View>
    </View>
  );
});

function Ticks({ state }: { state: 'sending' | 'failed' | 'sent' | 'read' }) {
  const c = useColors();
  if (state === 'sending') return <Feather name="clock" size={12} color={c.onForestMuted} />;
  if (state === 'failed') return <Feather name="alert-circle" size={13} color="#FFB4A3" />;
  const color = state === 'read' ? c.accent : c.onForestMuted;
  return (
    <View style={{ flexDirection: 'row', width: state === 'read' ? 18 : 13 }}>
      <Feather name="check" size={13} color={color} />
      {state === 'read' ? <Feather name="check" size={13} color={color} style={{ marginLeft: -8 }} /> : null}
    </View>
  );
}

/**
 * Live recording bar. It exists only while recording, so the native recorder and its 90 ms status
 * polling never run while the user is just reading or typing.
 */
function Recorder({ bottom, onDone }: { bottom: number; onDone: (result: { uri: string; ms: number } | null) => void }) {
  const c = useColors();
  const recorder = useAudioRecorder(Platform.OS === 'web' ? VOICE_PRESET : { ...RecordingPresets.HIGH_QUALITY, ...VOICE_PRESET });
  const rec = useAudioRecorderState(recorder, 90);
  const [levels, setLevels] = useState<number[]>([]);
  const started = useRef(false);
  const finished = useRef(false);
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));

  useEffect(() => {
    (async () => {
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
        started.current = true;
        tap();
        pulse.value = withRepeat(withTiming(1.35, { duration: 700 }), -1, true);
      } catch {
        notify(t('Could not record'), t('The microphone is busy or not available.'), 'error');
        onDone(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!started.current) return;
    const db = rec.metering ?? -60;
    setLevels((l) => [...l.slice(-31), Math.max(0.08, Math.min(1, (db + 60) / 60))]);
    if (rec.durationMillis >= MAX_VOICE_MS) void finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.durationMillis]);

  const finish = async (send: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const ms = rec.durationMillis;
    pulse.value = withSpring(1);
    try {
      if (started.current) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (send && recorder.uri && ms >= 500) { tap(); onDone({ uri: recorder.uri, ms }); return; }
      if (send) notify(t('Too short'), t('Hold on a little longer to record a voice message.'), 'info');
    } catch { /* recorder already stopped */ }
    onDone(null);
  };

  return (
    <Animated.View entering={FadeIn.duration(150)} style={[styles.bar, { paddingBottom: bottom + 10, borderTopColor: c.border, backgroundColor: c.card }]}>
      <Press onPress={() => finish(false)} style={[styles.round, { backgroundColor: c.muted }]} accessibilityLabel={t('Delete recording')} testID="voice-cancel">
        <Feather name="trash-2" size={20} color={c.destructive} />
      </Press>
      <View style={[styles.recBox, { backgroundColor: c.background, borderColor: c.input }]}>
        <Animated.View style={[styles.recDot, pulseStyle]} />
        <Text style={[styles.recT, { color: c.foreground }]}>{fmtDuration(rec.durationMillis)}</Text>
        <View style={styles.levels}>
          {levels.map((l, i) => <View key={i} style={{ width: 3, height: `${l * 100}%`, borderRadius: 2, backgroundColor: c.primary }} />)}
        </View>
      </View>
      <Press onPress={() => finish(true)} style={[styles.round, { backgroundColor: c.forest }]} accessibilityLabel={t('Send voice message')} testID="voice-send">
        <Feather name="send" size={20} color={c.accent} />
      </Press>
    </Animated.View>
  );
}

/** Text box; with nothing typed, the button records a voice note (tap to start, tap send to finish). */
function Composer({ text, setText, onSend, onVoice, bottom }: {
  text: string; setText: (v: string) => void; onSend: () => void; onVoice: (uri: string, ms: number) => void; bottom: number;
}) {
  const c = useColors();
  const [recording, setRecording] = useState(false);
  const hasText = text.trim().length > 0;

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { notify(t('Microphone is off'), t('Allow microphone access to record voice messages.'), 'error'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setRecording(true);
    } catch { notify(t('Could not record'), t('The microphone is busy or not available.'), 'error'); }
  };

  if (recording) {
    return <Recorder bottom={bottom} onDone={(r) => { setRecording(false); if (r) onVoice(r.uri, r.ms); }} />;
  }

  return (
    <View style={[styles.bar, { paddingBottom: bottom + 10, borderTopColor: c.border, backgroundColor: c.card }]}>
      <TextInput value={text} onChangeText={setText} placeholder={t('Write a message')} placeholderTextColor={c.mutedForeground}
        multiline maxLength={4000} testID="chat-input" blurOnSubmit={false}
        onKeyPress={(e) => {
          // Enter sends on the website; Shift+Enter makes a new line.
          const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
          if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) { (e as unknown as { preventDefault: () => void }).preventDefault(); onSend(); }
        }}
        style={[styles.input, { backgroundColor: c.background, borderColor: c.input, color: c.foreground }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      {hasText ? (
        <Animated.View key="send" entering={ZoomIn.duration(160)} exiting={FadeOut.duration(80)}>
          <Press onPress={onSend} style={[styles.round, { backgroundColor: c.forest }]} accessibilityLabel={t('Send message')} testID="chat-send">
            <Feather name="send" size={20} color={c.accent} />
          </Press>
        </Animated.View>
      ) : (
        <Animated.View key="mic" entering={ZoomIn.duration(160)} exiting={FadeOut.duration(80)}>
          <Press onPress={start} style={[styles.round, { backgroundColor: c.primary }]} accessibilityLabel={t('Record voice message')} testID="voice-start">
            <Feather name="mic" size={20} color="#FFFFFF" />
          </Press>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: F.m, fontSize: 12 },
  hello: { alignItems: 'center', gap: 10, paddingVertical: 60, paddingHorizontal: 40 },
  msg: { maxWidth: '82%', paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, borderRadius: 20, gap: 3 },
  msgT: { fontFamily: F.r, fontSize: 16, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  time: { fontFamily: F.m, fontSize: 11 },
  day: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, marginVertical: 10 },
  dayT: { fontFamily: F.s, fontSize: 12 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1.5, borderRadius: 24, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 12, fontFamily: F.m, fontSize: 16 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  recBox: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E0483B' },
  recT: { fontFamily: F.b, fontSize: 15, minWidth: 40 },
  levels: { flex: 1, height: 26, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden', justifyContent: 'flex-end' },
});
