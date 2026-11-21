import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { DemoBadge, F, Muted } from '@/components/ui';
import { workAdvice, useForecast } from '@/lib/weather';
import { addDays, ago } from '@/lib/util';
import { t, weekdayShort } from '@/lib/i18n';
import type { LngLat } from '@/lib/types';

function SourceBadge({ source, fetchedAt }: { source: 'live' | 'cached' | 'demo'; fetchedAt?: string }) {
  const c = useColors();
  if (source === 'demo') return <DemoBadge label={t('DEMO WEATHER')} />;
  const live = source === 'live';
  return (
    <View style={[styles.src, { backgroundColor: live ? c.accent : c.wheat }]}>
      <View style={[styles.srcDot, { backgroundColor: live ? c.primary : c.clay }]} />
      <Text style={[styles.srcT, { color: c.forest }]}>{live ? t('LIVE') : `${t('SAVED')} ${fetchedAt ? ago(fetchedAt).toUpperCase() : ''}`}</Text>
    </View>
  );
}

/**
 * 7-day strip + today's site work advice. `dark` renders on the asphalt hero; otherwise on a light card.
 */
export function WeatherStrip({ point, place, dark = false }: { point?: LngLat; place: string; dark?: boolean }) {
  const c = useColors();
  const q = useForecast(point);
  const days = q.data?.days;
  const advice = workAdvice(days?.[0]);
  const sub = dark ? c.onForestMuted : c.mutedForeground;
  const tile = dark ? c.forestSoft : c.muted;
  const tileFg = dark ? c.primaryForeground : c.foreground;
  const adviceColor = { good: c.accent, caution: c.wheat, bad: '#F0A487' };
  const adviceLight = { good: c.success, caution: c.clay, bad: c.destructive };

  return (
    <View style={{ gap: 10 }} testID="weather">
      <View style={styles.head}>
        <Muted style={{ color: sub, flex: 1 }} numberOfLines={1}>{place} · {t('7 days')}</Muted>
        {q.data ? <SourceBadge source={q.data.source} fetchedAt={q.data.fetchedAt} /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
        {!days
          ? Array.from({ length: 7 }, (_, i) => <View key={i} style={[styles.wx, { backgroundColor: tile, opacity: 0.55, height: 104 }]} />)
          : days.map((d, i) => {
            const today = i === 0;
            // Labels are built here, in the current language, not taken from the cached forecast.
            const label = today ? t('Today') : weekdayShort(addDays(new Date(), i));
            return (
              <View key={i} style={[styles.wx, { backgroundColor: today ? c.accent : tile }]} accessibilityLabel={t('{day}: high {hi}, low {lo}, rain {rain} mm, wind {wind} km/h', { day: label, hi: d.hi, lo: d.lo, rain: d.rain, wind: d.wind })}>
                <Text style={[styles.wxDay, { color: today ? c.forest : sub }]}>{label}</Text>
                <Feather name={d.icon} size={22} color={today ? c.forest : tileFg} />
                <Text style={[styles.wxT, { color: today ? c.forest : tileFg }]}>{d.hi}°</Text>
                <Text style={[styles.wxL, { color: today ? c.forestSoft : sub }]}>{d.rain ? `${d.rain} ${t('mm')}` : `${d.lo}°`}</Text>
                {d.check && !d.check.agree ? <View style={[styles.differ, { backgroundColor: c.clay }]} /> : null}
              </View>
            );
          })}
      </ScrollView>
      <VerifyLine days={days} sources={q.data?.sources} dark={dark} />
      {advice ? (
        <View style={[styles.advice, { backgroundColor: dark ? 'rgba(255,255,255,0.07)' : c.card, borderColor: dark ? 'transparent' : c.border }]} testID="work-advice">
          <Feather name={advice.ok ? 'check-circle' : 'alert-circle'} size={16} color={dark ? adviceColor[advice.tone] : adviceLight[advice.tone]} />
          <Text style={[styles.adviceT, { color: dark ? c.primaryForeground : c.foreground }]}>{advice.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Checked with MET Norway" — or which days the two services disagree on, so nobody trusts one number blindly. */
function VerifyLine({ days, sources, dark }: { days?: { hi: number; lo: number; rain: number; check?: { hi: number; lo: number; rain: number; agree: boolean } }[]; sources?: string[]; dark: boolean }) {
  const c = useColors();
  if (!days || !sources || sources.length < 2) return null;
  const differ = days.map((d, i) => ({ d, i })).filter(({ d }) => d.check && !d.check.agree);
  const fg = dark ? c.onForestMuted : c.mutedForeground;
  const first = differ[0];
  const label = (i: number) => (i === 0 ? t('Today') : weekdayShort(addDays(new Date(), i)));
  return (
    <View style={styles.verify} testID="weather-verify">
      <Feather name={differ.length ? 'alert-triangle' : 'check-circle'} size={13} color={differ.length ? c.clay : dark ? c.accent : c.primary} />
      <Text style={[styles.verifyT, { color: fg }]} numberOfLines={2}>
        {differ.length
          ? t('Open-Meteo and MET Norway differ on {day}: {a}° vs {b}°, rain {ra} vs {rb} mm. Plan with a margin.', {
            day: label(first.i), a: first.d.hi, b: first.d.check!.hi, ra: first.d.rain, rb: first.d.check!.rain })
          : t('Checked against MET Norway: both forecasts agree this week.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  differ: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  verify: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifyT: { flex: 1, fontFamily: F.m, fontSize: 12, lineHeight: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  srcDot: { width: 6, height: 6, borderRadius: 3 },
  srcT: { fontFamily: F.b, fontSize: 10, letterSpacing: 0.8 },
  wx: { width: 66, paddingVertical: 10, borderRadius: 16, alignItems: 'center', gap: 4 },
  wxDay: { fontFamily: F.s, fontSize: 12 },
  wxT: { fontFamily: F.b, fontSize: 18 },
  wxL: { fontFamily: F.m, fontSize: 10 },
  advice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  adviceT: { flex: 1, fontFamily: F.s, fontSize: 13, lineHeight: 18 },
});
