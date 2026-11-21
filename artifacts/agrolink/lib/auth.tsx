import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { getMe, login, logout, register, type Me, type RegisterInput } from '@workspace/api-client-react';
import { authFetch, bootApi, getToken, saveToken } from './api';

/**
 * BuildGO accounts on our own server: username + password, scrypt-hashed server-side, opaque
 * session token kept in SecureStore (phone) or localStorage (browser). Guests can still use
 * everything that lives on the device; chats need an account.
 */

export interface AppUser extends Me {
  fullName: string;
  isAdmin: boolean;
  /** Saves profile extras (role, location, phone, display name) to the account. */
  update: (patch: { meta: Record<string, unknown> }) => Promise<void>;
}

interface AuthCtx {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  user: AppUser | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Server rejected the token (expired, banned, deleted): drop to guest mode. */
  expire: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/** The last account seen, so the app opens at once with it while the server confirms the session. Not secret. */
const ME_KEY = 'buildgo:me';
const readCachedMe = async (): Promise<Me | null> => {
  try { const v = JSON.parse((await AsyncStorage.getItem(ME_KEY)) ?? 'null'); return v && typeof v.id === 'string' ? v : null; } catch { return null; }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setLoaded] = useState(false);
  const [me, setMeState] = useState<Me | null>(null);
  const cache = useQueryClient();
  // A different account must never see the previous one's chats: drop cached server data on switch.
  const setMe = useCallback((next: Me | null) => {
    setMeState((prev) => { if (prev?.id !== next?.id) cache.clear(); return next; });
  }, [cache]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await bootApi();
      // No saved session: a guest, nothing to ask the server.
      if (!getToken()) { if (alive) setLoaded(true); return; }
      // Open right away with the last known account; a slow or unreachable server must not hold the start screen.
      const cached = await readCachedMe();
      if (cached && alive) { setMe(cached); setLoaded(true); }
      try { const m = await getMe(); if (alive) setMe(m); }
      catch (e) {
        // 401 means the saved session is gone; offline keeps the token (and the cached account) for later.
        if ((e as { status?: number }).status === 401) { await saveToken(null); if (alive) setMe(null); }
      }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [setMe]);

  // Keep the cached account in step with the session (signed in, profile edited, signed out, expired).
  useEffect(() => {
    if (!isLoaded) return;
    (me ? AsyncStorage.setItem(ME_KEY, JSON.stringify(me)) : AsyncStorage.removeItem(ME_KEY)).catch(() => {});
  }, [me, isLoaded]);

  const signIn = useCallback(async (username: string, password: string) => {
    const s = await login({ username, password });
    await saveToken(s.token);
    setMe(s.user);
  }, [setMe]);
  const signUp = useCallback(async (input: RegisterInput) => {
    const s = await register(input);
    await saveToken(s.token);
    setMe(s.user);
  }, [setMe]);
  const signOut = useCallback(async () => {
    await logout().catch(() => {});
    await saveToken(null);
    setMe(null);
  }, [setMe]);
  const expire = useCallback(() => { void saveToken(null); setMe(null); }, [setMe]);

  const user = useMemo<AppUser | null>(() => me && {
    ...me,
    fullName: `${me.firstName} ${me.lastName}`.trim(),
    isAdmin: me.role === 'admin',
    update: async ({ meta }) => {
      const r = await authFetch('/api/auth/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ meta }) });
      if (r.ok) setMe(await r.json());
    },
  }, [me, setMe]);

  const value = useMemo<AuthCtx>(() => ({
    isLoaded, isSignedIn: !!me, userId: me?.id ?? null, user, signIn, signUp, signOut, expire,
  }), [isLoaded, me, user, signIn, signUp, signOut, expire]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useCtx(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}

export const useAuthActions = useCtx;

export function useAppAuth() {
  const { isLoaded, isSignedIn, userId, signOut } = useCtx();
  return { isLoaded, isSignedIn, userId, signOut };
}

export function useAppUser() {
  const { isLoaded, isSignedIn, user } = useCtx();
  return { isLoaded, isSignedIn, user };
}
