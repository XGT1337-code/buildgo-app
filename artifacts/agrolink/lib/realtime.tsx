import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getGetAdminStatsQueryKey, getGetChatMessagesQueryKey, getGetMyLicenseQueryKey, getListAdminReviewsQueryKey, getListChatRequestsQueryKey,
  getListConversationsQueryKey, getListListingsQueryKey, getListMyVehiclesQueryKey,
  type ChatConversation, type ChatMessage,
} from '@workspace/api-client-react';
import { getToken, wsUrl } from './api';
import { useAppAuth, useAuthActions } from './auth';
import { notify } from './device';
import { t } from './i18n';
import { cmpStr } from './util';

/**
 * One WebSocket per signed-in device. Server events are written straight into the React Query
 * caches, so lists and open chats update in place with no polling and no refetch flicker.
 */

/** A message in the open chat: server copy, or a local one still sending / failed. */
export type LocalMessage = ChatMessage & { pending?: 'sending' | 'failed'; localUri?: string };

const convKey = getListConversationsQueryKey();
const msgKey = (id: string) => getGetChatMessagesQueryKey(id);

// ---------------------------------------------------------------- tiny external stores

type Listener = () => void;
function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => { value = next; subs.forEach((f) => f()); },
    sub: (f: Listener) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
/** conversationId → time the peer last sent a typing ping. */
const typing = store<Record<string, number>>({});
/** userId → online, from presence events (overrides what lists loaded earlier). */
const presence = store<Record<string, boolean>>({});
/** Connection state for the little "connecting…" hint. */
const status = store<'offline' | 'connecting' | 'online'>('offline');

export function useTyping(conversationId: string | undefined): boolean {
  const map = useSyncExternalStore(typing.sub, typing.get, typing.get);
  const at = conversationId ? map[conversationId] : undefined;
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!at) return;
    const left = at + 4000 - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(force, left + 20);
    return () => clearTimeout(timer);
  }, [at]);
  return !!at && Date.now() - at < 4000;
}

export function useOnline(userId: string | undefined, fallback: boolean): boolean {
  const map = useSyncExternalStore(presence.sub, presence.get, presence.get);
  return userId && userId in map ? map[userId] : fallback;
}

export const useConnection = () => useSyncExternalStore(status.sub, status.get, status.get);

// ---------------------------------------------------------------- cache writers

/** Adds or replaces a message (matching by id, or by clientId for our own optimistic copy). */
export function upsertMessage(cache: QueryClient, m: LocalMessage) {
  cache.setQueryData<LocalMessage[]>(msgKey(m.conversationId), (list) => {
    if (!list) return list;
    const i = list.findIndex((x) => x.id === m.id || (x.clientId === m.clientId && x.senderId === m.senderId));
    if (i >= 0) {
      const next = list.slice();
      // Keep the local recording URI so a just-sent voice note plays without a download.
      next[i] = { ...m, localUri: m.localUri ?? list[i].localUri };
      return next;
    }
    return [...list, m].sort((a, b) => cmpStr(a.at, b.at));
  });
}

function touchConversation(cache: QueryClient, m: ChatMessage, me: string, viewing: string | null) {
  let found = false;
  cache.setQueryData<ChatConversation[]>(convKey, (list) => {
    if (!list) return list;
    const next = list.map((c) => {
      if (c.id !== m.conversationId) return c;
      found = true;
      const fromPeer = m.senderId !== me;
      const sameAsLast = c.last?.id === m.id;
      return { ...c, last: m, updatedAt: m.at, unread: fromPeer && viewing !== c.id && !sameAsLast ? c.unread + 1 : c.unread };
    });
    return next.sort((a, b) => cmpStr(b.updatedAt, a.updatedAt));
  });
  if (!found) void cache.invalidateQueries({ queryKey: convKey });
}

// ---------------------------------------------------------------- provider

interface RealtimeCtx {
  sendTyping: (conversationId: string, peerId: string) => void;
  /** The chat currently on screen: its incoming messages do not count as unread. */
  setViewing: (conversationId: string | null) => void;
}
const Ctx = createContext<RealtimeCtx>({ sendTyping: () => {}, setViewing: () => {} });
export const useRealtime = () => useContext(Ctx);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId } = useAppAuth();
  const { expire } = useAuthActions();
  const cache = useQueryClient();
  const socket = useRef<WebSocket | null>(null);
  const viewing = useRef<string | null>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    if (!isSignedIn || !userId) { status.set('offline'); return; }
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handle = (e: { type: string; [k: string]: any }) => {
      switch (e.type) {
        case 'ready':
          retry = 0; status.set('online');
          // Catch up on anything missed while disconnected.
          void cache.invalidateQueries({ queryKey: convKey });
          void cache.invalidateQueries({ queryKey: getListChatRequestsQueryKey() });
          if (viewing.current) void cache.invalidateQueries({ queryKey: msgKey(viewing.current) });
          break;
        case 'message': {
          const m = e.message as ChatMessage;
          upsertMessage(cache, m);
          touchConversation(cache, m, userId, viewing.current);
          if (m.senderId !== userId) typing.set({ ...typing.get(), [m.conversationId]: 0 });
          break;
        }
        case 'conversation':
          cache.setQueryData<ChatConversation[]>(convKey, (list) => {
            const c = e.conversation as ChatConversation;
            if (!list) return list;
            return [c, ...list.filter((x) => x.id !== c.id)].sort((a, b) => cmpStr(b.updatedAt, a.updatedAt));
          });
          void cache.invalidateQueries({ queryKey: getListChatRequestsQueryKey() });
          void cache.invalidateQueries({ queryKey: ['people'] });
          break;
        case 'request':
        case 'request:gone':
          void cache.invalidateQueries({ queryKey: getListChatRequestsQueryKey() });
          void cache.invalidateQueries({ queryKey: ['people'] });
          break;
        case 'read':
          if (e.userId === userId) {
            cache.setQueryData<ChatConversation[]>(convKey, (list) => list?.map((c) => (c.id === e.conversationId ? { ...c, unread: 0 } : c)));
          } else {
            cache.setQueryData<ChatConversation[]>(convKey, (list) => list?.map((c) => (c.id === e.conversationId ? { ...c, peerReadAt: e.at } : c)));
          }
          break;
        case 'typing':
          typing.set({ ...typing.get(), [e.conversationId]: Date.now() });
          break;
        case 'presence':
          presence.set({ ...presence.get(), [e.userId]: !!e.online });
          break;
        case 'review': {
          // An admin decided on one of my listings, machines or licences.
          void cache.invalidateQueries({ queryKey: getListListingsQueryKey() });
          void cache.invalidateQueries({ queryKey: getListMyVehiclesQueryKey() });
          void cache.invalidateQueries({ queryKey: getGetMyLicenseQueryKey() });
          const what = e.kind === 'listing' ? t('Your listing') : e.kind === 'vehicle' ? t('Your machine') : t('Your driving licence');
          if (e.status === 'approved') notify(t('Approved'), t('{what} was checked and approved by the admin.', { what }), 'success');
          else notify(t('Not approved'), `${what}: ${e.note ?? ''}`, 'error');
          break;
        }
        case 'review:new':
          void cache.invalidateQueries({ queryKey: getListAdminReviewsQueryKey() });
          void cache.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
          break;
      }
    };

    const connect = () => {
      if (closed) return;
      status.set('connecting');
      const ws = new WebSocket(wsUrl());
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: getToken() }));
      ws.onmessage = (ev) => { try { handle(JSON.parse(String(ev.data))); } catch { /* ignore bad frame */ } };
      ws.onclose = (ev) => {
        if (socket.current === ws) socket.current = null;
        if (closed) return;
        status.set('offline');
        if (ev.code === 4001) { expire(); return; }
        // Back off 0.5s, 1s, 2s … up to 15s.
        timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** retry++));
      };
      ws.onerror = () => { /* onclose follows */ };
    };
    connect();

    // Phones suspend sockets in the background: reconnect right away on return.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !socket.current && !closed) { if (timer) clearTimeout(timer); retry = 0; connect(); }
    });
    return () => {
      closed = true; sub.remove();
      if (timer) clearTimeout(timer);
      socket.current?.close(); socket.current = null;
      status.set('offline');
    };
  }, [isSignedIn, userId, cache, expire]);

  const value = useMemo<RealtimeCtx>(() => ({
    sendTyping: (conversationId, peerId) => {
      const now = Date.now();
      if (now - lastTyping.current < 2500) return;
      lastTyping.current = now;
      const ws = socket.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'typing', conversationId, peerId }));
    },
    setViewing: (id) => {
      viewing.current = id;
      if (id) cache.setQueryData<ChatConversation[]>(convKey, (list) => list?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    },
  }), [cache]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
