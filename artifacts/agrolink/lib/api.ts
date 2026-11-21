import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

/**
 * Where the BuildGO server lives.
 * - Website served by the server itself: same origin, nothing to configure.
 * - Expo web dev server (port 8081): the API on port 8080 of the same host.
 * - APK: EXPO_PUBLIC_API_URL baked at build time, or an address typed on the sign-in screen.
 */
const SERVER_KEY = 'agrigo:server-url';
const TOKEN_KEY = 'agrigo.session';
const BAKED = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

let base = '';
let token: string | null = null;

export const normalizeServer = (s: string) => {
  const v = s.trim().replace(/\/+$/, '');
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
};

/**
 * Phones use the server address baked into the APK (or typed on the sign-in screen). The website always talks to
 * the server it was opened from, whatever address an APK build happened to have, so it never points at a stale IP.
 */
function defaultBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    return port === '8081' ? `${protocol}//${hostname}:8080` : '';
  }
  return BAKED;
}

export const apiBase = () => base;
export const isWebSameOrigin = () => Platform.OS === 'web' && !base;
export const getToken = () => token;

/** Absolute URL for a server path (the web build on the server's own origin uses relative URLs). */
export const apiUrl = (path: string) => `${base}${path}`;

export function wsUrl(): string {
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin.replace(/^http/, 'ws')}/api/ws`;
}

function apply(url: string) {
  base = url;
  setBaseUrl(url || null);
}

/** Loads the saved server address and session token. Called once before the app renders. */
export async function bootApi(): Promise<void> {
  setAuthTokenGetter(() => token);
  const saved = Platform.OS === 'web' ? null : await AsyncStorage.getItem(SERVER_KEY).catch(() => null);
  apply(saved || defaultBase());
  token = await readToken();
}

export async function setServerUrl(url: string): Promise<void> {
  const v = normalizeServer(url);
  apply(v || defaultBase());
  if (v) await AsyncStorage.setItem(SERVER_KEY, v).catch(() => {});
  else await AsyncStorage.removeItem(SERVER_KEY).catch(() => {});
}

/** The session token lives in the Keystore/Keychain on phones; browsers have only localStorage. */
async function readToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch { return null; }
}

export async function saveToken(next: string | null): Promise<void> {
  token = next;
  try {
    if (Platform.OS === 'web') {
      if (next) globalThis.localStorage?.setItem(TOKEN_KEY, next); else globalThis.localStorage?.removeItem(TOKEN_KEY);
    } else if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch { /* storage unavailable: the session lasts until the app closes */ }
}

/** Raw authorized fetch for endpoints outside the generated client (audio, profile meta). */
export function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers });
}

/** Turns an API failure into a sentence for the user (server errors are { error: "…" }). */
export function apiError(e: unknown, fallback = 'Could not connect to the server. Check your internet and try again.'): string {
  const err = e as { data?: { error?: string }; status?: number; message?: string };
  if (err?.data?.error) return err.data.error;
  if (err?.status === 429) return 'Too many attempts. Try again in a few minutes.';
  return fallback;
}
