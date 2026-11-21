import React, { useEffect, useMemo, useRef } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Card, F, H2, Muted, Press, StatusBarScrim, TAB_SPACE, useTopInset, type IconName } from '@/components/ui';
import { CATEGORY_LABEL, isPlaceholderName, shownName } from '@/lib/demo';
import { CatIcon } from '@/components/CatIcon';
import { rentalTasks } from '@/lib/rental';
import type { Category } from '@/lib/types';
import { t, tp } from '@/lib/i18n';

const HOW: { icon: IconName; label: string }[] = [
  { icon: 'search', label: 'Find' },
  { icon: 'send', label: 'Request' },
  { icon: 'check', label: 'Confirmed' },
  { icon: 'tool', label: 'Use' },
  { icon: 'corner-down-left', label: 'Return' },
  { icon: 'star', label: 'Review' },
];

function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
}

function Action({ icon, title, sub, onPress, tone, testID }: { icon: IconName; title: string; sub: string; onPress: () => void; tone: 'accent' | 'card'; testID: string }) {
  const c = useColors();
  const accent = tone === 'accent';
  return (
    <Press onPress={onPress} testID={testID} accessibilityLabel={`${title}. ${sub}`}
      style={[styles.action, { backgroundColor: accent ? c.accent : c.forestSoft }]}>
      {/* A soft tint of the card's own colour, the same treatment on both cards (no solid black block). */}
      <View style={[styles.actionIcon, { backgroundColor: accent ? 'rgba(22,24,28,0.10)' : 'rgba(255,192,46,0.16)' }]}>
        <Feather name={icon} size={22} color={accent ? c.forest : c.accent} />
      </View>
      <Text style={[styles.actionT, { color: accent ? c.forest : c.primaryForeground }]}>{title}</Text>
      <Text style={[styles.actionS, { color: accent ? c.forestSoft : c.onForestMuted }]}>{sub}</Text>
      <Feather name="arrow-right" size={18} color={accent ? c.forest : c.accent} style={styles.actionArrow} />
    </Press>
  );
}

/** Home: the two ways in (find equipment / rent out your own) and everything waiting in your rentals. */
export default function Home() {
  const c = useColors();
  const top = useTopInset();
  const router = useRouter();
  const { state, onboarded, countryNeeded, isGuest } = useAppData();
  const p = state.profile;

  const pushedIntro = useRef(false);
  useEffect(() => {
    if (pushedIntro.current || onboarded === null || countryNeeded === null) return;
    if (onboarded === false || countryNeeded) { pushedIntro.current = true; router.push('/onboarding'); }
  }, [onboarded, countryNeeded, router]);

  const tasks = useMemo(() => rentalTasks(state.listings, state.bookings), [state.listings, state.bookings]);
  const myGear = state.listings.filter((l) => l.mine).length;
  const myFields = state.fields.filter((f) => !f.example && !f.sample);
  const nearby = state.listings.filter((l) => !l.mine).length;
  const name = isGuest && isPlaceholderName(p.name) ? '' : `, ${shownName(p.name).split(' ')[0]}`;
  const toneOf = { you: { bg: c.accent, fg: c.forest }, wait: { bg: c.muted, fg: c.mutedForeground }, alert: { bg: '#F6DCD3', fg: c.destructive } };

  return (
    <View style={{ flex: 1 }}>
    <StatusBarScrim tone={c.forest} />
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: TAB_SPACE + 10 }} showsVerticalScrollIndicator={false}>
      <ImageBackground
        source={require('../../assets/images/site.jpg')}
        resizeMode="cover"
        imageStyle={styles.heroImage}
        style={[styles.hero, { paddingTop: top + 14 }]}
      >
        <View style={[styles.heroShade, { backgroundColor: c.forest }]} />
        <View style={styles.brandRow}>
          <BrandLogo width={142} height={42} onDark />
          {tasks.some((x) => x.kind !== 'wait') ? (
            <View style={[styles.bell, { backgroundColor: c.clay }]}>
              <Feather name="bell" size={12} color={c.card} />
              <Text style={[styles.bellT, { color: c.card }]}>{tasks.filter((x) => x.kind !== 'wait').length}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.hello, { color: c.accent }]}>{greeting()}{name}</Text>
        <Text style={[styles.title, { color: c.primaryForeground }]}>{t('What do you need today?')}</Text>
        <View style={styles.actions}>
          <Action icon="search" title={t('Find equipment')} sub={tp(nearby, '{n} machine nearby', '{n} machines nearby')} tone="accent" testID="home-find" onPress={() => router.push('/find')} />
          <Action icon="plus-circle" title={t('Rent out yours')} sub={myGear ? t('{n} listed', { n: myGear }) : t('Earn from idle gear')} tone="card" testID="home-rent-out" onPress={() => router.push('/listing/new')} />
        </View>
      </ImageBackground>

      <View style={{ paddingHorizontal: 18, paddingTop: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <H2 style={{ flex: 1 }}>{t('Your rentals')}</H2>
          {tasks.length ? <Muted>{tasks.length}</Muted> : null}
        </View>
        {tasks.length === 0 ? (
          <Card style={{ padding: 16, gap: 12 }} testID="home-no-rentals">
            <Muted>{t('No rentals in progress. This is how one goes:')}</Muted>
            <View style={styles.how}>
              {HOW.map((h, i) => (
                <View key={h.label} style={styles.howStep}>
                  <View style={[styles.howDot, { backgroundColor: i === 0 ? c.accent : c.muted }]}><Feather name={h.icon} size={14} color={c.forest} /></View>
                  <Text style={[styles.howT, { color: c.mutedForeground }]} numberOfLines={1}>{t(h.label)}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : tasks.slice(0, 8).map((t) => {
          const tone = toneOf[t.kind];
          return (
            <Card key={t.id} onPress={() => router.push(`/listing/${t.listingId}`)} style={styles.task} testID={`task-${t.id}`}>
              <View style={[styles.taskIcon, { backgroundColor: tone.bg }]}><Feather name={t.icon} size={18} color={tone.fg} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.taskT, { color: c.foreground }]} numberOfLines={1}>{t.title}</Text>
                <Muted numberOfLines={1}>{t.sub}</Muted>
              </View>
              {t.kind === 'you' ? <View style={[styles.youDot, { backgroundColor: c.clay }]} /> : null}
              <Feather name="chevron-right" size={20} color={c.mutedForeground} />
            </Card>
          );
        })}

        <H2 style={{ marginTop: 6 }}>{t('Browse by category')}</H2>
        <View style={styles.cats}>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => (
            <Press key={k} onPress={() => router.navigate({ pathname: '/rent', params: { cat: k } })} testID={`home-cat-${k}`}
              style={[styles.cat, { backgroundColor: c.card, borderColor: c.border }]}>
              <CatIcon cat={k} size={24} color={c.primary} />
              <Text style={[styles.catT, { color: c.foreground }]}>{CATEGORY_LABEL[k]}</Text>
            </Press>
          ))}
        </View>

        <Press onPress={() => router.navigate('/fields')} style={[styles.fields, { backgroundColor: c.secondary, borderRadius: c.radius + 4 }]} testID="home-fields">
          <View style={[styles.taskIcon, { backgroundColor: c.forest }]}><Feather name="map-pin" size={18} color={c.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.b, fontSize: 15, color: c.foreground }}>{t('Your sites')}</Text>
            <Muted>{myFields.length ? `${tp(myFields.length, '{n} site', '{n} sites')} · ${t('work log and weather')}` : t('Add your sites, keep a work log, check if the weather allows work')}</Muted>
          </View>
          <Feather name="chevron-right" size={22} color={c.forest} />
        </Press>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, gap: 6, overflow: 'hidden' },
  heroImage: { borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroShade: { ...StyleSheet.absoluteFill, opacity: 0.76 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bell: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  bellT: { fontFamily: F.b, fontSize: 12 },
  hello: { fontFamily: F.b, fontSize: 13, letterSpacing: 0.2 },
  title: { fontFamily: F.b, fontSize: 28, letterSpacing: -0.8, lineHeight: 32 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, borderRadius: 20, padding: 14, gap: 4, minHeight: 138 },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionT: { fontFamily: F.b, fontSize: 17, letterSpacing: -0.3 },
  actionS: { fontFamily: F.m, fontSize: 12 },
  actionArrow: { position: 'absolute', top: 14, right: 14 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  taskIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  taskT: { fontFamily: F.b, fontSize: 15 },
  youDot: { width: 8, height: 8, borderRadius: 4 },
  how: { flexDirection: 'row' },
  howStep: { flex: 1, alignItems: 'center', gap: 4 },
  howDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  howT: { fontFamily: F.m, fontSize: 10.5 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { width: '31%', flexGrow: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 6 },
  catT: { fontFamily: F.s, fontSize: 13 },
  fields: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 6 },
});
