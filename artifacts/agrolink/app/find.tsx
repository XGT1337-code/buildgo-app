import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Button, Chip, F, H2, Muted, Press } from '@/components/ui';
import { DateStrip } from '@/components/Rental';
import { CATEGORY_LABEL } from '@/lib/demo';
import { matchesSearch } from '@/lib/search';
import { CatIcon } from '@/components/CatIcon';
import { fmtRange, upcomingDays } from '@/lib/rental';
import type { Category } from '@/lib/types';
import { t, tp } from '@/lib/i18n';

/** Search step: category, district and dates → results on the Rent tab. */
export default function Find() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{ cat?: string; district?: string; start?: string; end?: string }>();
  const { state } = useAppData();
  const [cat, setCat] = useState<Category | ''>((p.cat as Category) ?? '');
  const [district, setDistrict] = useState(p.district ?? '');
  const [start, setStart] = useState<string | null>(p.start ?? null);
  const [end, setEnd] = useState<string | null>(p.end ?? null);
  const days = useMemo(() => upcomingDays(42), []);

  // Districts that actually have equipment, nearest first, plus the user's own village.
  const districts = useMemo(() => {
    const byDist = [...state.listings].sort((a, b) => a.distanceKm - b.distanceKm).map((l) => l.village).filter(Boolean);
    return Array.from(new Set([state.profile.village, ...byDist].filter(Boolean)));
  }, [state.listings, state.profile.village]);

  const q = { cat, district, start: start ?? '', end: end ?? start ?? '' };
  const count = state.listings.filter((l) => !l.mine && matchesSearch(l, state.bookings, q)).length;

  const show = () => {
    const params: Record<string, string> = {};
    if (cat) params.cat = cat;
    if (district) params.district = district;
    if (start) { params.start = start; params.end = end ?? start; }
    router.back();
    setTimeout(() => router.navigate({ pathname: '/rent', params }), 50);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 22, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10 }}>
          <H2>1 · {t('What do you need?')}</H2>
          <View style={styles.grid}>
            {(['', ...Object.keys(CATEGORY_LABEL)] as (Category | '')[]).map((k) => {
              const on = cat === k;
              return (
                <Press key={k || 'any'} onPress={() => setCat(k)} selected={on} testID={`find-cat-${k || 'any'}`}
                  style={[styles.tile, { backgroundColor: on ? c.forest : c.card, borderColor: on ? c.forest : c.border }]}>
                  {k ? <CatIcon cat={k} size={26} color={on ? c.accent : c.primary} /> : <Feather name="layers" size={22} color={on ? c.accent : c.primary} />}
                  <Text style={[styles.tileT, { color: on ? c.primaryForeground : c.foreground }]}>{k ? CATEGORY_LABEL[k] : t('Any')}</Text>
                </Press>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <H2>2 · {t('Where?')}</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label={t('Anywhere')} icon="globe" active={!district} onPress={() => setDistrict('')} />
            {districts.map((d) => <Chip key={d} label={d} icon="map-pin" active={district === d} onPress={() => setDistrict(d)} />)}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <H2 style={{ flex: 1 }}>3 · {t('When?')}</H2>
            {start ? <Press onPress={() => { setStart(null); setEnd(null); }}><Text style={[styles.clear, { color: c.primary }]}>{t('Any dates')}</Text></Press> : null}
          </View>
          <Muted>{start ? fmtRange(start, end ?? start) : t('Optional. Tap a start day, then an end day.')}</Muted>
          <DateStrip days={days} start={start} end={end} onChange={(a, b) => { setStart(a); setEnd(b); }} testID="find-dates" />
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14, backgroundColor: c.background, borderTopColor: c.border }]}>
        <Button label={count ? tp(count, 'Show {n} result', 'Show {n} results') : t('No matches yet, show anyway')} icon="search" onPress={show} testID="find-show" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', minHeight: 78, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tileT: { fontFamily: F.s, fontSize: 13 },
  clear: { fontFamily: F.s, fontSize: 14 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
