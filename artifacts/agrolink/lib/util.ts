import type { ImageSourcePropType } from 'react-native';
import type { LngLat } from './types';
import { fmtDate, t } from './i18n';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

const SITE = require('@/assets/images/site.jpg');
const SITE_EARTH = require('@/assets/images/site-earth.jpg');
const ASSETS: Record<string, ImageSourcePropType> = {
  'asset:site': SITE,
  'asset:site-earth': SITE_EARTH,
  'asset:excavator': require('@/assets/images/excavator.jpg'),
  'asset:truck': require('@/assets/images/truck.jpg'),
  'asset:crane': require('@/assets/images/crane.jpg'),
  'asset:mixer': require('@/assets/images/mixer.jpg'),
  'asset:roller': require('@/assets/images/roller.jpg'),
  'asset:tools': require('@/assets/images/tools.jpg'),
  // Pictures saved on devices before the app moved to construction.
  'asset:fields': SITE, 'asset:field-green': SITE, 'asset:field-wheat': SITE_EARTH, 'asset:tractor': SITE_EARTH, 'asset:soil': SITE_EARTH,
};
/** A site without its own photo gets an illustration matching its stage. */
export const fieldCover = (field: { photo?: string; crop?: string }) =>
  imageSource((field.photo !== 'asset:site' && field.photo) || (/earth|foundation|landscap/i.test(field.crop ?? '') ? 'asset:site-earth' : 'asset:site'));

/**
 * Plain string order. ISO dates and timestamps sort correctly with it, and it is far cheaper than
 * localeCompare, which on Android Hermes calls into Java for every comparison.
 */
export const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 12500 → "12 500" without Intl (number formatting through Intl is slow on Android Hermes). */
export const groupThousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Site area: stored in hectares, shown in square metres (1 ha = 10,000 m²). */
export const fmtArea = (ha: number) => `${groupThousands(ha * 10000)} ${t('m²')}`;

export function imageSource(src?: string): ImageSourcePropType | undefined {
  if (!src) return undefined;
  if (src.startsWith('asset:')) return ASSETS[src];
  return { uri: src };
}

export const DAY = 86400000;

export function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * DAY);
}

export function fmtDay(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return fmtDate(d);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t('now');
  if (s < 3600) return t('{n}m', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n}h', { n: Math.floor(s / 3600) });
  return t('{n}d', { n: Math.floor(s / 86400) });
}

/** "just now", "5m ago", "3d ago". */
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 60 ? t('just now') : t('{time} ago', { time: timeAgo(iso) });
}

/** Calendar-day distance in words: today, yesterday, 3 days ago, in 2 days. */
export function relDay(day: string) {
  const n = Math.round((new Date(isoDay(new Date()) + 'T12:00:00').getTime() - new Date(day.slice(0, 10) + 'T12:00:00').getTime()) / DAY);
  if (n === 0) return t('today');
  if (n === 1) return t('yesterday');
  if (n === -1) return t('tomorrow');
  return n > 0 ? t('{n} days ago', { n }) : t('in {n} days', { n: -n });
}

export function rangesOverlap(aS: string, aE: string, bS: string, bE: string) {
  return aS <= bE && bS <= aE;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Polygon area in hectares from lng/lat ring using a local equirectangular projection. */
export function areaHa(ring: LngLat[]) {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((a, p) => a + p[1], 0) / ring.length) * (Math.PI / 180);
  const R = 6371000;
  const pts = ring.map(([lng, lat]) => [
    R * (lng * Math.PI / 180) * Math.cos(lat0),
    R * (lat * Math.PI / 180),
  ]);
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2) / 10000;
}

export function centroid(ring: LngLat[]): LngLat | undefined {
  if (!ring.length) return undefined;
  return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
}

/** RFC 4180 CSV cell. */
export const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Project a set of rings into a w x h box. */
export function makeProjector(rings: LngLat[][], w: number, h: number, pad = 18) {
  const all = rings.flat();
  if (!all.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const lat0 = Math.cos(((all.reduce((a, p) => a + p[1], 0) / all.length) * Math.PI) / 180);
  for (const [lng, lat] of all) {
    const x = lng * lat0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
  }
  const sx = (w - pad * 2) / Math.max(maxX - minX, 1e-9);
  const sy = (h - pad * 2) / Math.max(maxY - minY, 1e-9);
  const s = Math.min(sx, sy);
  const ox = (w - (maxX - minX) * s) / 2;
  const oy = (h - (maxY - minY) * s) / 2;
  return (p: LngLat) => [ox + (p[0] * lat0 - minX) * s, h - (oy + (p[1] - minY) * s)] as const;
}

export function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
