import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppAuth as useAuth, useAppUser as useUser } from '@/lib/auth';
import { isSavedLocation, migrateProfile, withLocation } from '@/lib/geo';
import { isPhone } from '@/lib/phone';
import { initialState, isPlaceholderName, ROLE_LABEL, seedExamples, toConstruction } from '@/lib/demo';
import { uid, areaHa, addDays, isoDay } from '@/lib/util';
import { unavailableReason } from '@/lib/rental';
import { notify } from '@/lib/device';
import { useServerListings } from '@/lib/listings';
import { t } from '@/lib/i18n';
import type {
  AppState, Booking, BookingStatus, Field, Listing, LogEntry, Profile, Review, Role, SavedLocation, TermsSnapshot,
} from '@/lib/types';

/**
 * Demo listings are stored in English; their text is read through getters, so it always shows in the current
 * interface language (a language switch remounts the screens but not this provider). Never persisted.
 */
function localized(l: Listing): Listing {
  if (!l.demo) return l;
  const o = { ...l };
  Object.defineProperties(o, {
    title: { get: () => t(l.title), enumerable: true },
    description: { get: () => t(l.description), enumerable: true },
    reviews: { get: () => l.reviews.map((r) => (r.mine ? r : { ...r, text: t(r.text) })), enumerable: true },
  });
  return o;
}

// A new key for BuildGO: people coming from the farming version see the new introduction once.
const ONBOARD_KEY = 'buildgo:onboarded';
/** Device-level country chosen on the very first screen. Only a location, never profile data. */
const DEVICE_LOC_KEY = 'agrolink:device-location';
const keyFor = (scope: string) => `agrolink:v1:${scope}`;

interface Ctx {
  ready: boolean;
  scope: string;
  isGuest: boolean;
  onboarded: boolean | null;
  finishOnboarding: () => void;
  /** Location explicitly chosen on this device's first-launch screen (used to prefill sign-up). */
  deviceLocation: SavedLocation | null;
  /** null while loading; true when the country-first screen must be shown. */
  countryNeeded: boolean | null;
  chooseCountry: (loc: SavedLocation) => void;
  state: AppState;
  saveProfile: (p: Profile) => void;
  upsertField: (f: Omit<Field, 'id' | 'createdAt' | 'areaHa'> & { id?: string; areaHa?: number }) => string;
  deleteField: (id: string) => void;
  addLog: (l: Omit<LogEntry, 'id'>) => void;
  deleteLog: (id: string) => void;
  addListing: (l: Omit<Listing, 'id' | 'owner' | 'mine' | 'reviews' | 'demo' | 'createdAt' | 'distanceKm'>) => string;
  deleteListing: (id: string) => void;
  requestBooking: (listingId: string, start: string, end: string, note: string, terms?: TermsSnapshot) => { ok: boolean; error?: string };
  /** Moves a booking along the rental flow and records the step in its history. */
  setBookingStatus: (id: string, status: BookingStatus, patch?: Partial<Booking>) => void;
  /** Non-status changes: renter rating, dismissing a notice. */
  updateBooking: (id: string, patch: Partial<Booking>) => void;
  addReview: (listingId: string, rating: number, text: string) => void;
  sendMessage: (convId: string, text: string) => void;
  /** Saved (bookmarked) listings for quick access on the Rent tab. */
  toggleFavorite: (listingId: string) => void;
  markRead: (convId: string) => void;
  resetScope: () => void;
}

const AppDataContext = createContext<Ctx | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const scope = isLoaded && isSignedIn && userId ? `user:${userId}` : 'guest';
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const loadedScope = useRef<string | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<SavedLocation | null>(null);
  const [deviceLocLoaded, setDeviceLocLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARD_KEY).then((v) => setOnboarded(v === '1')).catch(() => setOnboarded(true));
    AsyncStorage.getItem(DEVICE_LOC_KEY)
      .then((raw) => {
        try { const v = raw ? JSON.parse(raw) : null; if (isSavedLocation(v)) setDeviceLocation(v); } catch { /* ignore */ }
      })
      .catch(() => {})
      .finally(() => setDeviceLocLoaded(true));
  }, []);

  useEffect(() => {
    let alive = true;
    setReady(false);
    loadedScope.current = null;
    AsyncStorage.getItem(keyFor(scope))
      .then((raw) => {
        if (!alive) return;
        let next = initialState();
        if (raw) {
          try { next = { ...next, domain: undefined, ...(JSON.parse(raw) as AppState) }; } catch { /* corrupted — start fresh */ }
        }
        next = seedExamples(toConstruction({ ...next, profile: migrateProfile({ ...initialState().profile, ...next.profile }) }));
        setState(next);
        loadedScope.current = scope;
        setReady(true);
      })
      .catch(() => { if (alive) { loadedScope.current = scope; setReady(true); } });
    return () => { alive = false; };
  }, [scope]);

  // Debounced persistence: rapid taps (privacy toggles, chips, chat) coalesce into one write.
  // A pending write for another scope is flushed immediately so switching accounts never drops data.
  const pending = useRef<{ key: string; state: AppState; timer: ReturnType<typeof setTimeout> } | null>(null);
  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    AsyncStorage.setItem(p.key, JSON.stringify(p.state)).catch(() => {
      notify(t('Could not save'), t('Device storage is full. Choose a smaller photo or export your data before closing the app.'), 'error');
    });
  }, []);
  useEffect(() => {
    if (loadedScope.current !== scope) return;
    const key = keyFor(scope);
    if (pending.current && pending.current.key !== key) flush();
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { key, state, timer: setTimeout(flush, 300) };
  }, [state, scope, flush]);
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => { if (s !== 'active') flush(); });
    return () => { sub.remove(); flush(); };
  }, [flush]);

  // Hydrate location chosen at sign-up (stored in the account's meta on the BuildGO server).
  // Only into the matching user's own scope, only once, and never over a location the user already chose.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || loadedScope.current !== scope || !user || scope !== `user:${user.id}`) return;
    if (hydratedFor.current === scope) return;
    hydratedFor.current = scope;
    const meta = user.meta as Record<string, unknown> | undefined;
    const loc = meta?.agrolinkLocation;
    const phone = meta?.agrolinkPhone;
    const name = meta?.agrolinkName || [user.firstName, user.lastName].filter(Boolean).join(' ');
    const role = meta?.agrolinkRole;
    setState((s) => {
      let profile = s.profile;
      if (typeof name === 'string' && name.trim() && (!profile.name || isPlaceholderName(profile.name))) profile = { ...profile, name: name.trim().slice(0, 80) };
      if (typeof role === 'string' && role in ROLE_LABEL && profile.role !== role) profile = { ...profile, role: role as Role };
      if (isSavedLocation(loc) && !profile.locationSet) profile = withLocation(profile, loc);
      if (isPhone(phone) && !profile.phone) profile = { ...profile, phone };
      return profile === s.profile ? s : { ...s, profile };
    });
  }, [ready, scope, user]);

  const userRef = useRef(user);
  userRef.current = user;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const me = state.profile.name || 'You';
  const meRef = useRef(me);
  meRef.current = me;
  // Moderated listings from the server are shown next to device and demo listings, but never
  // written to device storage (persistence above saves the raw `state`, not this view).
  const server = useServerListings(state.profile.center);
  const view = useMemo<AppState>(
    () => ({ ...state, listings: [...server.listings, ...state.listings.map(localized)] }),
    [state, server.listings]);
  const stateRef = useRef(view);
  stateRef.current = view;

  const finishOnboarding = useCallback(() => {
    setOnboarded(true);
    AsyncStorage.setItem(ONBOARD_KEY, '1').catch(() => {});
  }, []);

  const saveProfile = useCallback((p: Profile) => {
    setState((s) => ({ ...s, profile: p }));
    const u = userRef.current;
    if (u && scopeRef.current === `user:${u.id}`) {
      const meta: Record<string, unknown> = { ...(u.meta ?? {}), agrolinkPhone: p.phone ?? null, agrolinkName: p.name, agrolinkRole: p.role };
      if (p.locationSet && p.country) {
        meta.agrolinkLocation = { country: p.country, countryName: p.countryName ?? '', regionCode: p.regionCode ?? '', region: p.region } satisfies SavedLocation;
      }
      u.update({ meta }).catch(() => {});
    }
  }, []);

  const chooseCountry = useCallback((loc: SavedLocation) => {
    setDeviceLocation(loc);
    AsyncStorage.setItem(DEVICE_LOC_KEY, JSON.stringify(loc)).catch(() => {});
    saveProfile(withLocation(stateRef.current.profile, loc));
  }, [saveProfile]);

  const countryNeeded = !deviceLocLoaded || !ready ? null : !deviceLocation && !state.profile.locationSet;


  const upsertField: Ctx['upsertField'] = useCallback((f) => {
    const id = f.id ?? uid();
    const computed = f.boundary.length >= 3 ? Math.round(areaHa(f.boundary) * 10000) / 10000 : f.areaHa ?? 0;
    setState((s) => {
      const exists = s.fields.find((x) => x.id === id);
      const field: Field = {
        ...(exists ?? { createdAt: new Date().toISOString() }),
        ...f,
        id,
        areaHa: computed || f.areaHa || 0,
      } as Field;
      return { ...s, fields: exists ? s.fields.map((x) => (x.id === id ? field : x)) : [field, ...s.fields] };
    });
    return id;
  }, []);

  const deleteField = useCallback((id: string) =>
    setState((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== id), logs: s.logs.filter((l) => l.fieldId !== id) })), []);

  const addLog = useCallback((l: Omit<LogEntry, 'id'>) =>
    setState((s) => ({ ...s, logs: [{ ...l, id: uid() }, ...s.logs] })), []);
  const deleteLog = useCallback((id: string) => setState((s) => ({ ...s, logs: s.logs.filter((l) => l.id !== id) })), []);

  const addListing: Ctx['addListing'] = useCallback((l) => {
    const id = uid();
    const now = new Date();
    // Demo request inside the owner's availability window.
    let s1 = isoDay(addDays(now, 3));
    if (l.availableFrom && s1 < l.availableFrom) s1 = l.availableFrom;
    let s2 = isoDay(addDays(new Date(s1 + 'T12:00:00'), 1));
    if (l.availableTo && s2 > l.availableTo) s2 = s1;
    setState((s) => ({
      ...s,
      listings: [{ ...l, id, owner: meRef.current, mine: true, reviews: [], demo: false, distanceKm: 0, createdAt: now.toISOString() }, ...s.listings],
      // A labeled demo request so the owner accept / decline flow can be tried locally.
      bookings: [{
        id: uid(), listingId: id, requester: 'Tural Aliyev (demo)', mine: false, start: s1, end: s2, status: 'pending',
        note: 'Demo request — generated locally so you can try the whole rental flow.', createdAt: now.toISOString(), demo: true,
        history: [{ status: 'pending', at: now.toISOString() }],
      }, ...s.bookings],
    }));
    return id;
  }, []);
  const deleteListing = useCallback((id: string) =>
    setState((s) => ({
      ...s, listings: s.listings.filter((l) => l.id !== id), bookings: s.bookings.filter((b) => b.listingId !== id),
      favorites: (s.favorites ?? []).filter((x) => x !== id),
    })), []);

  const requestBooking: Ctx['requestBooking'] = useCallback((listingId, start, end, note, terms) => {
    const listing = stateRef.current.listings.find((l) => l.id === listingId);
    if (!listing) return { ok: false, error: 'This listing no longer exists.' };
    const why = unavailableReason(listing, stateRef.current.bookings, start, end);
    if (why) return { ok: false, error: why };
    const at = new Date().toISOString();
    const b: Booking = {
      id: uid(), listingId, requester: meRef.current, mine: true, start, end, status: 'pending', note,
      createdAt: at, demo: false, termsSnapshot: terms, history: [{ status: 'pending', at }],
    };
    setState((s) => ({ ...s, bookings: [b, ...s.bookings] }));
    return { ok: true };
  }, []);

  const setBookingStatus = useCallback((id: string, status: BookingStatus, patch?: Partial<Booking>) =>
    setState((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b.id === id
        ? { ...b, ...patch, status, history: [...(b.history ?? [{ status: b.status, at: b.createdAt }]), { status, at: new Date().toISOString() }] }
        : b)),
    })), []);
  const updateBooking = useCallback((id: string, patch: Partial<Booking>) =>
    setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) })), []);

  const addReview = useCallback((listingId: string, rating: number, text: string) => {
    const r: Review = { id: uid(), author: meRef.current, rating, text, at: new Date().toISOString(), mine: true };
    setState((s) => ({ ...s, listings: s.listings.map((l) => (l.id === listingId ? { ...l, reviews: [r, ...l.reviews] } : l)) }));
  }, []);

  const sendMessage = useCallback((convId: string, text: string) =>
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => c.id === convId
        ? { ...c, messages: [...c.messages, { id: uid(), from: 'me', text, at: new Date().toISOString() }] }
        : c),
    })), []);
  const toggleFavorite = useCallback((listingId: string) =>
    setState((s) => {
      const fav = s.favorites ?? [];
      return { ...s, favorites: fav.includes(listingId) ? fav.filter((x) => x !== listingId) : [listingId, ...fav] };
    }), []);
  const markRead = useCallback((convId: string) =>
    setState((s) => {
      const c = s.conversations.find((x) => x.id === convId);
      if (!c || c.unread === 0) return s;
      return { ...s, conversations: s.conversations.map((x) => (x.id === convId ? { ...x, unread: 0 } : x)) };
    }), []);

  const deviceLocRef = useRef(deviceLocation);
  deviceLocRef.current = deviceLocation;
  // Reset keeps only the device's chosen country, never any personal profile fields.
  const resetScope = useCallback(() => setState(() => {
    const s = seedExamples(initialState());
    const loc = deviceLocRef.current;
    return loc ? { ...s, profile: withLocation(s.profile, loc) } : s;
  }), []);

  const value = useMemo<Ctx>(() => ({
    ready, scope, isGuest: scope === 'guest', onboarded, finishOnboarding, deviceLocation, countryNeeded, chooseCountry, state: view,
    saveProfile, upsertField, deleteField, addLog, deleteLog,
    addListing, deleteListing, requestBooking, setBookingStatus, updateBooking, addReview, sendMessage, toggleFavorite, markRead, resetScope,
  }), [ready, scope, onboarded, finishOnboarding, deviceLocation, countryNeeded, chooseCountry, view, saveProfile, upsertField, deleteField, addLog, deleteLog,
    addListing, deleteListing, requestBooking, setBookingStatus, updateBooking, addReview, sendMessage, toggleFavorite, markRead, resetScope]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
