import type { Field, LngLat, Profile, SavedLocation } from './types';
import { parseDialCode } from './phone';
import { getCountryCallingCode, isSupportedCountry, type CountryCode } from 'libphonenumber-js/max';
import { currentLang, locale, t, type Lang } from './i18n';
import { cmpStr } from './util';

/**
 * Country and first-level region dataset from the `country-state-city` package
 * (ISO 3166 countries and subdivisions with approximate centroids).
 * Only the country and state JSON files are loaded; the 8 MB city file is never bundled.
 */
type RawCountry = { name: string; isoCode: string; phonecode?: string; latitude: string | null; longitude: string | null };
type RawState = { name: string; isoCode: string; countryCode: string; latitude: string | null; longitude: string | null };

export interface CountryOpt { code: string; name: string; center?: LngLat; dial: string }
export interface RegionOpt { code: string; name: string; center?: LngLat }

let _countries: CountryOpt[] | null = null;
let _countriesLang = '';
let _dn: { of: (code: string) => string | undefined } | null = null;
let _dnLang = '';

/**
 * Names for the app's region, used before Intl: many browsers and phones have no Azerbaijani
 * country names, and Hermes may have no Russian ones.
 */
const REGION_NAMES: Partial<Record<Lang, Record<string, string>>> = {
  az: {
    AZ: 'Azərbaycan', TR: 'Türkiyə', GE: 'Gürcüstan', RU: 'Rusiya', KZ: 'Qazaxıstan', IR: 'İran', UZ: 'Özbəkistan',
    TM: 'Türkmənistan', KG: 'Qırğızıstan', TJ: 'Tacikistan', UA: 'Ukrayna', BY: 'Belarus', MD: 'Moldova', AM: 'Ermənistan',
    DE: 'Almaniya', GB: 'Birləşmiş Krallıq', US: 'Amerika Birləşmiş Ştatları', FR: 'Fransa', IT: 'İtaliya', CN: 'Çin',
    IN: 'Hindistan', PK: 'Pakistan', AF: 'Əfqanıstan', IQ: 'İraq', SA: 'Səudiyyə Ərəbistanı', AE: 'Birləşmiş Ərəb Əmirlikləri', IL: 'İsrail',
  },
  ru: {
    AZ: 'Азербайджан', TR: 'Турция', GE: 'Грузия', RU: 'Россия', KZ: 'Казахстан', IR: 'Иран', UZ: 'Узбекистан',
    TM: 'Туркменистан', KG: 'Киргизия', TJ: 'Таджикистан', UA: 'Украина', BY: 'Беларусь', MD: 'Молдова', AM: 'Армения',
    DE: 'Германия', GB: 'Великобритания', US: 'США', FR: 'Франция', IT: 'Италия', CN: 'Китай',
    IN: 'Индия', PK: 'Пакистан', AF: 'Афганистан', IQ: 'Ирак', SA: 'Саудовская Аравия', AE: 'ОАЭ', IL: 'Израиль',
  },
};

/** Country name in the interface language: own list, then Intl.DisplayNames, then the English dataset name. */
export function countryLabel(code?: string, fallback?: string): string | undefined {
  if (!code) return fallback;
  const own = REGION_NAMES[currentLang()]?.[code];
  if (own) return own;
  try {
    if (_dnLang !== locale()) {
      _dnLang = locale();
      const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of: (c: string) => string | undefined } }).DisplayNames;
      _dn = DN ? new DN([locale()], { type: 'region' }) : null;
    }
    const n = _dn?.of(code);
    if (n && n !== code) return n;
  } catch { _dn = null; }
  return rawCountries().find((c) => c.isoCode === code)?.name ?? fallback ?? code;
}

let _raw: RawCountry[] | null = null;
function rawCountries(): RawCountry[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!_raw) _raw = require('country-state-city/lib/assets/country.json') as RawCountry[];
  return _raw;
}
let _regions: Map<string, RegionOpt[]> | null = null;
/** Countries whose region list has been sorted already (sorted on first use, one country at a time). */
const _sortedRegions = new Set<string>();
let _byCode: Map<string, RawCountry> | null = null;
const _country = new Map<string, CountryOpt>();

/**
 * Sort key for names: lower case only. localeCompare / Intl.Collator would give a slightly nicer order, but on
 * Android Hermes every comparison goes through Java, and sorting thousands of names that way froze startup
 * for seconds.
 */
const nameKey = (s: string) => s.toLowerCase();
const byName = (a: { name: string }, b: { name: string }) => cmpStr(nameKey(a.name), nameKey(b.name));

const ll = (lat: string | null, lng: string | null): LngLat | undefined => {
  const a = Number(lat); const o = Number(lng);
  return lat && lng && Number.isFinite(a) && Number.isFinite(o) ? [o, a] : undefined;
};

const toOpt = (c: RawCountry): CountryOpt =>
  ({ code: c.isoCode, name: countryLabel(c.isoCode, c.name) ?? c.name, center: ll(c.latitude, c.longitude), dial: parseDialCode(c.phonecode) });

/** All countries, sorted by name in the interface language. Only the country picker needs the whole list. */
export function listCountries(): CountryOpt[] {
  if (!_countries || _countriesLang !== locale()) {
    _countriesLang = locale();
    _countries = rawCountries().map(toOpt).sort(byName);
  }
  return _countries;
}

export function regionsOf(country: string): RegionOpt[] {
  if (!_regions) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('country-state-city/lib/assets/state.json') as RawState[];
    _regions = new Map();
    for (const s of raw) {
      const arr = _regions.get(s.countryCode) ?? [];
      arr.push({ code: s.isoCode, name: s.name, center: ll(s.latitude, s.longitude) });
      _regions.set(s.countryCode, arr);
    }
  }
  const list = _regions.get(country) ?? [];
  if (!_sortedRegions.has(country)) { list.sort(byName); _sortedRegions.add(country); }
  return list;
}

/** One country by code: a map lookup, no list building or sorting (it runs on every app start). */
export function findCountry(code?: string): CountryOpt | undefined {
  if (!code) return undefined;
  const key = `${locale()}:${code}`;
  const hit = _country.get(key);
  if (hit) return hit;
  if (!_byCode) _byCode = new Map(rawCountries().map((c) => [c.isoCode, c]));
  const raw = _byCode.get(code);
  if (!raw) return undefined;
  const opt = toOpt(raw);
  _country.set(key, opt);
  return opt;
}
export const findRegion = (country?: string, code?: string) => (country && code ? regionsOf(country).find((r) => r.code === code) : undefined);

/** Fallback: Ganja area, the app's original home. Only used when nothing else is known. */
export const FALLBACK_VIEW = { center: [46.361, 40.682] as LngLat, zoom: 7 };

/** Starting map view for a location. Region centroid at zoom 8, else country centroid at zoom 6. */
export function viewFor(loc: { country?: string; regionCode?: string }): { center: LngLat; zoom: number; label: string } {
  const r = findRegion(loc.country, loc.regionCode);
  const c = findCountry(loc.country);
  if (r?.center) return { center: r.center, zoom: 8, label: `${r.name}, ${c?.name ?? loc.country}` };
  if (c?.center) return { center: c.center, zoom: 6, label: c.name };
  return { ...FALLBACK_VIEW, label: t('Default area') };
}

export const dialCodeOf = (country?: string) => country && isSupportedCountry(country)
  ? getCountryCallingCode(country as CountryCode) : findCountry(country)?.dial ?? '';

/** Whole-world starting view for the fields map. */
export const WORLD_VIEW = { center: [15, 25] as LngLat, zoom: 2 };

/**
 * Apply a chosen location to a profile, deriving center/zoom from the dataset.
 * When the country (or a previously chosen region) changes, the free-text village is cleared
 * so a stale place name never sits under a new country. Pass keepVillage when the caller
 * already supplies a village the user typed for the new location.
 */
export function withLocation(p: Profile, loc: SavedLocation, keepVillage = false): Profile {
  const v = viewFor(loc);
  const moved = p.country !== loc.country || (!!p.regionCode && p.regionCode !== loc.regionCode);
  return {
    ...p, country: loc.country, countryName: loc.countryName, regionCode: loc.regionCode, region: loc.region,
    village: !keepVillage && moved ? '' : p.village, center: v.center, zoom: v.zoom, locationSet: true,
  };
}

export const profileLocation = (p: Profile): SavedLocation | null =>
  p.country ? { country: p.country, countryName: p.countryName ?? findCountry(p.country)?.name ?? '', regionCode: p.regionCode ?? '', region: p.regionCode ? p.region : '' } : null;

export type FieldScope = 'all' | 'country' | 'region';

/**
 * Local filter by the field's own recorded location codes. Fields without codes
 * (legacy or unknown) are excluded from local views rather than guessed.
 */
export function filterFields(fields: Field[], scope: FieldScope, loc: { country?: string; regionCode?: string }): Field[] {
  if (scope === 'all') return fields;
  if (!loc.country) return [];
  return fields.filter((f) => {
    if (f.country !== loc.country) return false;
    if (scope === 'country') return true;
    return !!loc.regionCode && f.regionCode === loc.regionCode;
  });
}

export function isSavedLocation(x: unknown): x is SavedLocation {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.country === 'string' && !!findCountry(o.country) && typeof o.regionCode === 'string' && typeof o.region === 'string'
    && typeof o.countryName === 'string';
}

/**
 * Legacy profiles only had free-text `region`. Keep the text, assume Azerbaijan
 * (the app's original market), and match a dataset region by name if possible.
 * Never marks the location as user-chosen.
 */
export function migrateProfile(p: Profile): Profile {
  if (p.country && findCountry(p.country)) {
    const v = viewFor(p);
    return { ...p, regionCode: p.regionCode ?? '', center: p.center ?? v.center, zoom: p.zoom ?? v.zoom };
  }
  const country = 'AZ';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const match = p.region ? regionsOf(country).find((r) => norm(r.name) === norm(p.region) || norm(r.name).startsWith(norm(p.region))) : undefined;
  const v = viewFor({ country, regionCode: match?.code });
  return { ...p, country, countryName: 'Azerbaijan', regionCode: match?.code ?? '', center: v.center, zoom: v.zoom, locationSet: false };
}

export const locationLabel = (p: Profile) => {
  const cn = countryLabel(p.country, p.countryName) ?? '';
  return [p.region, cn].filter(Boolean).join(', ');
};
