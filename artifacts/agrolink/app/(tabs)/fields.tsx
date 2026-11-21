import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { WeatherStrip } from '@/components/Weather';
import { countryLabel, filterFields, locationLabel, viewFor, type FieldScope } from '@/lib/geo';
import {
  Body, Card, Chip, DemoBadge, Empty, F, Fab, Field, H2, IconButton, Muted, Press, Tag, StatusBarScrim, TAB_SPACE, useTopInset, Button,
} from '@/components/ui';
import { isPlaceholderName, LOG_LABEL, siteText } from '@/lib/demo';
import { fieldCover, fmtArea, relDay } from '@/lib/util';
import { t, t as translate, tp } from '@/lib/i18n';

function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening').toUpperCase();
}

export default function Fields() {
  const c = useColors();
  const top = useTopInset();
  const router = useRouter();
  const { state, isGuest } = useAppData();
  const [scope, setScope] = useState<FieldScope>('all');
  const [q, setQ] = useState('');
  const [showExamples, setShowExamples] = useState(true);

  const mine = useMemo(() => state.fields.filter((f) => !f.example && !f.sample), [state.fields]);
  const total = mine.reduce((a, f) => a + f.areaHa, 0);
  const exampleCount = state.fields.length - mine.length;

  const p = state.profile;
  const home = useMemo(() => {
    const v = viewFor(p);
    return { center: p.center ?? v.center, label: v.label };
  }, [p]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const tr = translate;
    return filterFields(state.fields, scope, p).filter((f) =>
      (showExamples || (!f.example && !f.sample))
      && (!q.trim() || [f.name, f.crop, tr(f.crop), f.village].some((x) => x.toLowerCase().includes(t))));
  }, [state.fields, scope, p, q, showExamples]);

  // Last work log activity per site, for the card footer.
  const lastLog = useMemo(() => {
    const m = new Map<string, { type: string; date: string; n: number }>();
    for (const l of state.logs) {
      const cur = m.get(l.fieldId);
      if (!cur) m.set(l.fieldId, { type: l.type, date: l.date, n: 1 });
      else m.set(l.fieldId, { ...(l.date > cur.date ? { type: l.type, date: l.date } : cur), n: cur.n + 1 });
    }
    return m;
  }, [state.logs]);

  const countryName = countryLabel(p.country, p.countryName) || t('your country');
  const scopeName = scope === 'region' ? (p.region || 'your region') : countryName;
  const filtered = shown.length === 0 && state.fields.length > 0;
  const firstName = isGuest && isPlaceholderName(p.name) ? t('Guest').toUpperCase() : p.name.split(' ')[0].toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBarScrim tone={c.forest} />
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_SPACE + 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { paddingTop: top + 14, backgroundColor: c.forest }]}>
          <View style={styles.heroRow}>
            <IconButton icon="arrow-left" label={t('Back to Home')} size={44} tone="forest" onPress={() => router.navigate('/')} testID="fields-back" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hello, { color: c.accent }]}>{greeting()}, {firstName}</Text>
              <Text style={[styles.title, { color: c.primaryForeground }]}>{t('Your sites')}</Text>
            </View>
            <View style={[styles.stat, { borderColor: c.forestSoft }]} accessibilityLabel={`${tp(mine.length, '{n} site', '{n} sites')} · ${fmtArea(total)}`}>
              <Text style={[styles.statNum, { color: c.accent }]}>{mine.length}</Text>
              <Text style={[styles.statUnit, { color: c.primaryForeground }]}>{tp(mine.length, '{n} site', '{n} sites').replace(/^\d+\s*/, '')} · {fmtArea(total)}</Text>
            </View>
          </View>
          <WeatherStrip dark point={home.center} place={p.village || locationLabel(p) || t('Your area')} />
        </View>

        <View style={{ paddingHorizontal: 18, paddingTop: 18, gap: 14 }}>
          {state.fields.length > 0 ? (
            <>
              <Field placeholder={t('Search by name, stage or place')} value={q} onChangeText={setQ} testID="fields-search"
                autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} testID="field-scope" keyboardShouldPersistTaps="handled">
                <Chip label={`${t('All')} · ${state.fields.length}`} active={scope === 'all'} onPress={() => setScope('all')} />
                <Chip label={`${countryName}`} active={scope === 'country'} onPress={() => setScope('country')} />
                {p.regionCode ? <Chip label={p.region || t('My region')} active={scope === 'region'} onPress={() => setScope('region')} /> : null}
                {exampleCount ? (
                  <Chip label={showExamples ? `${t('Examples')} · ${exampleCount}` : t('Examples hidden')} icon={showExamples ? 'eye' : 'eye-off'}
                    active={false} onPress={() => setShowExamples((v) => !v)} />
                ) : null}
              </ScrollView>
            </>
          ) : null}
          {filtered ? (
            <Card style={styles.selCard} testID="fields-local-empty">
              <Feather name={q ? 'search' : 'compass'} size={22} color={c.clay} />
              <View style={{ flex: 1, gap: 2 }}>
                <H2>{q ? t('Nothing matches “{q}”', { q: q.trim() }) : scope === 'all' ? t('Only examples here') : t('No sites in {place}', { place: scopeName })}</H2>
                <Muted>
                  {q ? t('Try a stage or place name.') : scope === 'all'
                    ? t('Examples are hidden. Show them again or add your own site.')
                    : t('Only sites saved with {place} as their location show here. Older sites and samples without a recorded location stay under All.', { place: scopeName })}
                </Muted>
              </View>
              <Button label={t('Reset')} variant="ghost" onPress={() => { setScope('all'); setQ(''); setShowExamples(true); }} testID="scope-all" />
            </Card>
          ) : null}

          {state.fields.length === 0 ? (
            <View testID="fields-list-empty">
              <Empty icon="map-pin" title={t('No sites yet')} body={t('Add your first site: its name, stage and size in square metres.')}
                action={<Button label={t('Add site')} icon="plus" onPress={() => router.push('/field/edit')} style={{ marginTop: 10, alignSelf: 'stretch' }} />} />
            </View>
          ) : filtered ? null : (
            <View style={{ gap: 14 }} testID="fields-list">
              {shown.map((f, i) => {
                const ll = lastLog.get(f.id);
                return (
                  <Animated.View key={f.id} entering={i < 8 ? FadeInDown.delay(i * 40).duration(260) : undefined}>
                    <Card testID={`field-${f.id}`} onPress={() => router.push(`/field/${f.id}`)}>
                      <View style={{ height: 128 }}>
                        <Image source={fieldCover(f)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                        <LinearGradient colors={['transparent', 'rgba(22,24,28,0.78)']} style={StyleSheet.absoluteFill} />
                        {f.sample ? <View style={styles.mapBadge}><DemoBadge label={t('SAMPLE SITE')} /></View> : null}
                        {f.example ? <View style={styles.mapBadge}><DemoBadge label={t('EXAMPLE · NOT OWNED')} /></View> : null}
                        <View style={styles.cardOver}>
                          <Text style={[styles.cardName, { color: c.primaryForeground }]} numberOfLines={1}>{siteText(f, f.name)}</Text>
                          <View style={[styles.area, { backgroundColor: c.accent }]}>
                            <Text style={[styles.areaText, { color: c.forest }]}>{fmtArea(f.areaHa)}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.cardBody}>
                        <Tag label={t(f.crop)} color={c.muted} />
                        <View style={{ flex: 1 }}>
                          <Body style={{ fontSize: 14 }} numberOfLines={1}>{f.village || '—'}</Body>
                          <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                            {ll ? `${LOG_LABEL[ll.type] ?? t('Note')} ${relDay(ll.date)} · ${tp(ll.n, '{n} log entry', '{n} log entries')}` : t('No work log entries yet')}
                          </Muted>
                        </View>
                        <Feather name="chevron-right" size={20} color={c.mutedForeground} />
                      </View>
                    </Card>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {state.fields.length > 0 ? (
            <Press onPress={() => router.push('/find')} style={[styles.promo, { backgroundColor: c.secondary, borderRadius: c.radius + 4 }]}>
              <View style={[styles.promoIcon, { backgroundColor: c.forest }]}><Feather name="truck" size={20} color={c.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.b, fontSize: 15, color: c.foreground }}>{t('Need a machine this week?')}</Text>
                <Muted>{t('Browse idle equipment nearby')}</Muted>
              </View>
              <Feather name="chevron-right" size={22} color={c.forest} />
            </Press>
          ) : null}
        </View>
      </ScrollView>
      <Fab testID="add-field" icon="plus" label={t('Add site')} onPress={() => router.push('/field/edit')} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  hello: { fontFamily: F.b, fontSize: 12, letterSpacing: 1.4 },
  title: { fontFamily: F.b, fontSize: 32, letterSpacing: -1, marginTop: 2 },
  stat: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  statNum: { fontFamily: F.b, fontSize: 24, letterSpacing: -0.5 },
  statUnit: { fontFamily: F.m, fontSize: 11 },
  mapBadge: { position: 'absolute', top: 10, left: 10 },
  selCard: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  cardOver: { position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardName: { flex: 1, fontFamily: F.b, fontSize: 21, letterSpacing: -0.4 },
  area: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  areaText: { fontFamily: F.b, fontSize: 14 },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 64 },
  promoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
