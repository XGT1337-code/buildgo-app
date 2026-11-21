import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { demoWeather, type WeatherDay } from './demo';
import { addDays } from './util';
import type { LngLat } from './types';
import { t, weekdayShort } from './i18n';
import { getWeather } from '@workspace/api-client-react';

/**
 * Live 7-day forecast. First choice: the BuildGO server, which cross-checks Open-Meteo against
 * MET Norway (two independent forecast services). If the server is unreachable, Open-Meteo is
 * asked directly; then the last good forecast on the device; then clearly labeled demo data.
 */
export interface Forecast {
  days: WeatherDay[];
  /** 'live' = fresh from the service, 'cached' = last good copy on this device, 'demo' = simulated. */
  source: 'live' | 'cached' | 'demo';
  fetchedAt?: string;
  /** Services the numbers come from, e.g. ["Open-Meteo", "MET Norway"]. */
  sources?: string[];
  /** Current temperature from each service. */
  now?: { openMeteo?: number | null; metNo?: number | null };
}

const CACHE_KEY = (k: string) => `agrolink:wx:${k}`;

function iconFor(code: number, windKmh: number): WeatherDay['icon'] {
  if (code >= 95) return 'cloud-lightning';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'cloud-snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'cloud-rain';
  if (windKmh >= 35) return 'wind';
  if (code >= 2) return 'cloud';
  return 'sun';
}

async function fetchVerified([lng, lat]: LngLat): Promise<Pick<Forecast, 'days' | 'sources' | 'now'>> {
  const r = await getWeather({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });
  const days = r.days.map((d, i) => {
    const wind = Math.round(d.openMeteo.wind ?? 0);
    return {
      day: i === 0 ? t('Today') : weekdayShort(new Date(`${d.date}T12:00:00`)),
      hi: Math.round(d.openMeteo.hi), lo: Math.round(d.openMeteo.lo), rain: Math.round(d.openMeteo.rain * 10) / 10, wind,
      icon: iconFor(d.openMeteo.code ?? 0, wind),
      check: d.metNo ? { hi: Math.round(d.metNo.hi), lo: Math.round(d.metNo.lo), rain: Math.round(d.metNo.rain * 10) / 10, agree: d.agree } : undefined,
    } satisfies WeatherDay;
  });
  return { days, sources: r.sources, now: { openMeteo: r.now.openMeteo, metNo: r.now.metNo } };
}

async function fetchForecast([lng, lat]: LngLat, signal?: AbortSignal): Promise<WeatherDay[]> {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
    + '&timezone=auto&forecast_days=7';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  signal?.addEventListener('abort', () => ctl.abort());
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const d = j.daily;
    return (d.time as string[]).map((iso, i) => {
      const date = new Date(`${iso}T12:00:00`);
      const wind = Math.round(d.wind_speed_10m_max[i] ?? 0);
      return {
        day: i === 0 ? t('Today') : weekdayShort(date),
        hi: Math.round(d.temperature_2m_max[i]),
        lo: Math.round(d.temperature_2m_min[i]),
        rain: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
        wind,
        icon: iconFor(d.weather_code[i] ?? 0, wind),
      };
    });
  } finally {
    clearTimeout(timer);
  }
}

export function useForecast(point: LngLat | undefined) {
  const key = point ? `${point[1].toFixed(2)},${point[0].toFixed(2)}` : 'none';
  return useQuery<Forecast>({
    queryKey: ['weather', key],
    enabled: !!point,
    staleTime: 30 * 60_000,
    gcTime: 6 * 3600_000,
    retry: 0,
    queryFn: async ({ signal }) => {
      try {
        const verified = await fetchVerified(point!).catch(() => null);
        const f: Forecast = verified
          ? { ...verified, source: 'live', fetchedAt: new Date().toISOString() }
          : { days: await fetchForecast(point!, signal), sources: ['Open-Meteo'], source: 'live', fetchedAt: new Date().toISOString() };
        AsyncStorage.setItem(CACHE_KEY(key), JSON.stringify(f)).catch(() => {});
        return f;
      } catch {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY(key));
          const cached = raw ? (JSON.parse(raw) as Forecast) : null;
          // A cached forecast older than 3 days says nothing about this week.
          if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < 3 * 86400_000) {
            const shift = Math.floor((Date.now() - new Date(cached.fetchedAt).getTime()) / 86400_000);
            const days = cached.days.slice(shift).map((d, i) => ({
              ...d, day: i === 0 ? t('Today') : weekdayShort(addDays(new Date(), i)),
            }));
            if (days.length) return { ...cached, days, source: 'cached' };
          }
        } catch { /* ignore broken cache */ }
        return { days: demoWeather(), source: 'demo' };
      }
    },
  });
}

/**
 * Plain-language advice for site work today, from common rules of thumb: cranes and aerial platforms usually
 * stop above about 15 m/s (54 km/h) of wind, fresh concrete needs protection from heavy rain, frost and heat.
 * The machine's own manual and the site manager always have the last word.
 */
export function workAdvice(d: WeatherDay | undefined): { ok: boolean; tone: 'good' | 'caution' | 'bad'; text: string } | null {
  if (!d) return null;
  const ms = Math.round(d.wind / 3.6);
  if (d.icon === 'cloud-lightning') return { ok: false, tone: 'bad', text: t('Thunderstorms: stop crane lifts and work at height.') };
  if (d.wind >= 54) return { ok: false, tone: 'bad', text: t('Wind up to {kmh} km/h ({ms} m/s): crane lifts and aerial platforms stop.', { kmh: d.wind, ms }) };
  if (d.rain >= 10) return { ok: false, tone: 'bad', text: t('Heavy rain ({mm} mm): postpone concrete pours and earthworks.', { mm: d.rain }) };
  if (d.wind >= 36) return { ok: false, tone: 'caution', text: t('Gusts to {kmh} km/h ({ms} m/s): check the crane and platform wind limits before lifting.', { kmh: d.wind, ms }) };
  if (d.lo <= 2) return { ok: true, tone: 'caution', text: t('Frost possible (down to {deg}°): heat or cover fresh concrete.', { deg: d.lo }) };
  if (d.rain >= 2) return { ok: true, tone: 'caution', text: t('Rain expected ({mm} mm): cover fresh concrete and materials.', { mm: d.rain }) };
  if (d.hi >= 35) return { ok: true, tone: 'caution', text: t('Very hot ({deg}°): pour concrete early, keep it wet, more breaks for the crew.', { deg: d.hi }) };
  return { ok: true, tone: 'good', text: t('Good day for site work: wind {kmh} km/h, little rain.', { kmh: d.wind }) };
}
