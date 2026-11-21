import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RU } from './i18n.ru';
import { AZ } from './i18n.az';

/**
 * Three interface languages. English strings are the keys; ru/az dictionaries translate them,
 * and anything missing falls back to English. `{name}` placeholders are filled from `vars`.
 *
 * The current language lives in a module variable so plain functions (lib/rental, lib/weather,
 * date formatting) can translate too. Changing language remounts the screens (see I18nProvider),
 * so nothing keeps a stale string.
 */
export type Lang = 'en' | 'ru' | 'az';

export const LANGS: { code: Lang; name: string; short: string }[] = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'az', name: 'Azərbaycanca', short: 'AZ' },
  { code: 'ru', name: 'Русский', short: 'RU' },
];

const DICT: Record<Lang, Record<string, string>> = { en: {}, ru: RU, az: AZ };
const LOCALE: Record<Lang, string> = { en: 'en-GB', ru: 'ru-RU', az: 'az-Latn-AZ' };
const KEY = 'agrohub:lang';

/** English until the person picks Azərbaycanca or Русский (the choice is saved on the device). */
let current: Lang = 'en';

/** Dev only: strings shown in ru/az that have no translation yet (inspect via globalThis.__i18nMissing). */
const missing = new Set<string>();
if (__DEV__) (globalThis as Record<string, unknown>).__i18nMissing = missing;

export function t(s: string, vars?: Record<string, string | number>): string {
  // Keep older translation keys readable while presenting the new public name.
  const hit = DICT[current][s] ?? DICT[current][s.replaceAll('BuildGO', 'AgroHub')];
  if (__DEV__ && current !== 'en' && hit === undefined) missing.add(s);
  let out = (hit ?? s).replaceAll('AgroHub', 'BuildGO');
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

/**
 * Counted phrase: tp(3, '{n} day', '{n} days'). The dictionary entry for "one|other" holds the
 * language's own forms separated by "|": Russian one|few|many, Azerbaijani a single form.
 */
export function tp(n: number, one: string, other: string): string {
  const forms = (DICT[current][`${one}|${other}`] ?? `${one}|${other}`).split('|');
  let i = 0;
  if (current === 'ru') {
    const m10 = n % 10, m100 = n % 100;
    i = m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2;
  } else if (current === 'en') {
    i = n === 1 ? 0 : 1;
  }
  return (forms[Math.min(i, forms.length - 1)] ?? one).split('{n}').join(String(n));
}

/** BCP-47 tag for dates and numbers in the current language. */
export const locale = () => LOCALE[current];
export const currentLang = () => current;

/*
 * Month and weekday names are kept here rather than taken from Intl: browsers and the Hermes engine
 * on phones often ship without Azerbaijani (and sometimes Russian) date data.
 */
const MONTH_IN_DATE: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
  az: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'],
};
const MONTH_ALONE: Record<Lang, string[]> = {
  en: MONTH_IN_DATE.en,
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  az: MONTH_IN_DATE.az,
};
const WEEKDAY: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  az: ['B.', 'B.e.', 'Ç.a.', 'Ç.', 'C.a.', 'C.', 'Ş.'],
};
const WEEKDAY_LONG: Record<Lang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  az: ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'],
};

/** "23 Oct", "23 окт.", "23 okt". */
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTH_IN_DATE[current][d.getMonth()]}`;
/** Month on its own, for headers: "Oct", "окт", "okt". */
export const monthShort = (d: Date) => MONTH_ALONE[current][d.getMonth()];
export const weekdayShort = (d: Date) => WEEKDAY[current][d.getDay()];
/** Spoken date for screen readers: "Friday, 23 Oct". */
export const fmtDateLong = (d: Date) => `${WEEKDAY_LONG[current][d.getDay()]}, ${fmtDate(d)}`;
/** 24-hour "07:05". */
export const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

interface Ctx { lang: Lang; setLang: (l: Lang) => void }
const I18nContext = createContext<Ctx>({ lang: current, setLang: () => {} });

/**
 * Loads the saved language before rendering, and remounts its children when the language changes,
 * so every screen, memoized value and date is rebuilt in the new language. App data lives above it.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'en' || v === 'ru' || v === 'az') current = v; })
      .catch(() => {})
      .finally(() => setLangState(current));
  }, []);

  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }, []);

  const value = useMemo(() => ({ lang: lang ?? current, setLang }), [lang, setLang]);
  if (!lang) return null;
  return <I18nContext.Provider value={value}><React.Fragment key={lang}>{children}</React.Fragment></I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
