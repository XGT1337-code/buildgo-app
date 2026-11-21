import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Button, Card, Chip, Press, DemoBadge, Empty, F, Fab, Field, H1, IconButton, Muted, Notice, Segmented, StatusBarScrim, TAB_SPACE, Tag, useTopInset } from '@/components/ui';
import { statusTone } from '@/components/Rental';
import { CATEGORY_LABEL } from '@/lib/demo';
import { imageSource } from '@/lib/util';
import { StatusPill } from '@/components/Verify';
import { matchesSearch, type EquipmentQuery } from '@/lib/search';
import { CatIcon } from '@/components/CatIcon';
import { fmtRange, quote } from '@/lib/rental';
import type { BookingStatus, Category } from '@/lib/types';
import { t, tp } from '@/lib/i18n';

const CATS: (Category | '')[] = ['', 'earthmoving', 'trucks', 'lifting', 'concrete', 'road', 'tools'];
const SHORT: Record<BookingStatus, string> = {
  pending: 'Requested', accepted: 'Confirmed', active: 'In use', returned: 'Returned', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled',
};

type Mode = 'browse' | 'saved' | 'requests' | 'mine';

/** Search results. Filters come from the Find screen (category, district, dates) and can be tweaked here. */
export default function Rent() {
  const c = useColors();
  const top = useTopInset();
  const router = useRouter();
  const params = useLocalSearchParams<{ cat?: string; district?: string; start?: string; end?: string; mode?: string }>();
  const { state, toggleFavorite } = useAppData();
  const favs = useMemo(() => new Set(state.favorites ?? []), [state.favorites]);
  // Latest own booking per listing, so cards show where that rental stands.
  const myStatus = useMemo(() => {
    const m = new Map<string, BookingStatus>();
    for (const b of state.bookings) if (b.mine && !m.has(b.listingId)) m.set(b.listingId, b.status);
    return m;
  }, [state.bookings]);

  const [query, setQuery] = useState<EquipmentQuery>({});
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('browse');
  const [sort, setSort] = useState<'near' | 'cheap'>('near');

  // A new search from Home or the Find screen replaces the filters.
  useEffect(() => {
    setQuery({ cat: params.cat, district: params.district, start: params.start, end: params.end });
    if (params.cat || params.district || params.start) setMode('browse');
    if (params.mode === 'mine' || params.mode === 'requests' || params.mode === 'saved') setMode(params.mode);
  }, [params.cat, params.district, params.start, params.end, params.mode]);

  const list = useMemo(() => {
    const ids = new Set(state.bookings.filter((b) => b.mine).map((b) => b.listingId));
    const l = state.listings.filter((x) => {
      if (mode === 'mine') return x.mine;
      if (mode === 'saved') return favs.has(x.id) && matchesSearch(x, state.bookings, { text });
      if (mode === 'requests') return ids.has(x.id) && matchesSearch(x, state.bookings, { text });
      return !x.mine && matchesSearch(x, state.bookings, { ...query, text });
    });
    return [...l].sort((a, b) => (sort === 'near' ? a.distanceKm - b.distanceKm : a.pricePerDay - b.pricePerDay));
  }, [state.listings, state.bookings, query, text, mode, sort, favs]);

  const pendingIncoming = state.bookings.filter((b) => !b.mine && b.status === 'pending' && state.listings.find((l) => l.id === b.listingId)?.mine).length;
  const hasQuery = !!(query.cat || query.district || query.start);
  const summary = [
    query.cat ? CATEGORY_LABEL[query.cat] : t('Any equipment'),
    query.district || t('anywhere'),
    query.start ? fmtRange(query.start, query.end || query.start) : t('any dates'),
  ].join(' · ');
  const editSearch = () => router.push({ pathname: '/find', params: Object.fromEntries(Object.entries(query).filter(([, v]) => !!v)) as Record<string, string> });

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBarScrim />
      <FlatList
        data={list}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: top + 12, paddingBottom: TAB_SPACE + 20, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconButton icon="arrow-left" label={t('Back to Home')} size={44} onPress={() => router.navigate('/')} testID="rent-back" />
              <H1 style={{ flex: 1 }}>{t('Equipment')}</H1>
              {pendingIncoming ? (
                <Press onPress={() => setMode('mine')}><Tag label={t('{n} to answer', { n: pendingIncoming })} color={c.clay} fg={c.card} /></Press>
              ) : null}
            </View>
            <Segmented value={mode} onChange={setMode} options={[
              { value: 'browse', label: t('Search') }, { value: 'saved', label: favs.size ? `${t('Saved')} ${favs.size}` : t('Saved') },
              { value: 'requests', label: t('Booked') }, { value: 'mine', label: t('My gear') },
            ]} />

            {mode === 'browse' ? (
              <>
                <View style={[styles.summaryWrap, { backgroundColor: c.forest, borderRadius: c.radius + 2 }]}>
                  <Press onPress={editSearch} testID="rent-edit-search" accessibilityLabel={t('Search: {summary}. Tap to change.', { summary })} style={styles.summary}>
                    <Feather name="search" size={20} color={c.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sumT, { color: c.primaryForeground }]} numberOfLines={1}>{summary}</Text>
                      <Text style={[styles.sumS, { color: c.onForestMuted }]}>{hasQuery ? t('Tap to change category, district or dates') : t('Choose category, district and dates')}</Text>
                    </View>
                    {hasQuery ? null : <Feather name="sliders" size={18} color={c.accent} />}
                  </Press>
                  {hasQuery ? (
                    <Press onPress={() => router.setParams({ cat: '', district: '', start: '', end: '' })} style={styles.clear} accessibilityLabel={t('Clear search')} testID="rent-clear">
                      <Feather name="x-circle" size={20} color={c.onForestMuted} />
                    </Press>
                  ) : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {CATS.map((k) => (
                    <Chip key={k || 'all'} label={k ? CATEGORY_LABEL[k] : t('All')} cat={k || undefined}
                      active={(query.cat ?? '') === k} onPress={() => setQuery((q) => ({ ...q, cat: k || undefined }))} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Field placeholder={t('Filter by name or place')} value={text} onChangeText={setText} testID="rent-search" />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Chip label={t('Nearest')} icon="navigation" active={sort === 'near'} onPress={() => setSort('near')} />
              <Chip label={t('Lowest price')} icon="trending-down" active={sort === 'cheap'} onPress={() => setSort('cheap')} />
              <Muted style={{ marginLeft: 'auto' }}>{tp(list.length, '{n} result', '{n} results')}</Muted>
            </View>
            {mode === 'browse' ? <Notice icon="shield" text={t('Listings marked Verified were checked by a BuildGO admin, machine documents included. DEMO listings are samples.')} /> : null}
            {mode === 'mine' ? (
              <Button label={t('Rent out your equipment')} icon="plus" variant="accent" onPress={() => router.push('/listing/new')} testID="rent-out" />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Empty icon={mode === 'mine' ? 'tool' : mode === 'saved' ? 'heart' : 'search'}
            title={t(mode === 'mine' ? 'Nothing listed yet' : mode === 'requests' ? 'No bookings yet' : mode === 'saved' ? 'Nothing saved yet' : 'No equipment matches')}
            body={t(mode === 'mine' ? 'Your idle excavator, truck or rotary hammer can earn money on other sites.'
              : mode === 'saved' ? 'Tap the heart on any listing to keep it here for later.'
              : hasQuery ? 'Nothing free for that category, district and dates. Try other dates or anywhere.' : 'Change filters or search another district.')}
            action={mode === 'browse' && hasQuery ? <Button label={t('Change search')} icon="sliders" variant="ghost" onPress={editSearch} style={{ marginTop: 8 }} /> : undefined} />
        }
        renderItem={({ item }) => {
          const avg = item.reviews.length ? item.reviews.reduce((a, r) => a + r.rating, 0) / item.reviews.length : 0;
          const fav = favs.has(item.id);
          const st = myStatus.get(item.id);
          const [stBg, stFg] = st ? statusTone(c)[st] : ['', ''];
          const qt = mode === 'browse' && query.start ? quote(item, query.start, query.end || query.start) : null;
          const incoming = item.mine ? state.bookings.filter((b) => b.listingId === item.id && !b.mine && b.status === 'pending').length : 0;
          return (
            <View>
              <Card onPress={() => router.push(qt ? { pathname: '/listing/[id]', params: { id: item.id, start: query.start!, end: query.end || query.start! } } : `/listing/${item.id}`)}
                style={styles.row} testID={`listing-${item.id}`}>
                <View style={[styles.thumb, { backgroundColor: c.forest }]}>
                  {item.photo ? <Image source={imageSource(item.photo)} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
                    <CatIcon cat={item.category} size={38} color={c.accent} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 4, paddingVertical: 12, paddingRight: 44 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {item.demo ? <DemoBadge label={t('DEMO')} /> : item.mine ? <Tag label={t('Yours')} color={c.accent} fg={c.forest} /> : null}
                    {item.server && (item.mine ? item.server.status !== 'approved' : item.server.vehicle?.status === 'approved')
                      ? <StatusPill status={item.mine ? item.server.status : 'approved'} /> : null}
                    <Tag label={CATEGORY_LABEL[item.category]} />
                    {st ? <Tag label={t(SHORT[st])} color={stBg} fg={stFg} /> : null}
                    {incoming ? <Tag label={t('{n} new', { n: incoming })} color={c.clay} fg={c.card} /> : null}
                  </View>
                  <Text style={[styles.title, { color: c.foreground }]} numberOfLines={2}>{item.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Muted numberOfLines={1} style={{ flexShrink: 1 }}>{item.village}{item.mine ? '' : ` · ${item.distanceKm} ${t('km')}`}</Muted>
                    {avg ? (
                      <View style={styles.rating} accessibilityLabel={t('Rated {n} of 5', { n: avg.toFixed(1) })}>
                        <FontAwesome name="star" size={12} color={c.wheat} />
                        <Text style={[styles.ratingT, { color: c.foreground }]}>{avg.toFixed(1)}</Text>
                        <Muted style={{ fontSize: 12 }}>({item.reviews.length})</Muted>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.price, { color: c.primary }]}>
                    {item.pricePerDay} AZN<Text style={styles.per}> / {t('day')}</Text>
                    {qt ? <Text style={[styles.per, { color: c.mutedForeground }]}>  ·  {t('{n} d', { n: qt.days })} = {qt.rent} AZN</Text> : null}
                  </Text>
                </View>
              </Card>
              {/* Sibling of the card (not inside it) so web never nests one button in another. */}
              {!item.mine ? (
                <Press onPress={() => toggleFavorite(item.id)} hitSlop={8} style={styles.heart} testID={`fav-${item.id}`}
                  accessibilityLabel={fav ? t('Remove from saved') : t('Save listing')} selected={fav}>
                  <FontAwesome name={fav ? 'heart' : 'heart-o'} size={18} color={fav ? c.clay : c.mutedForeground} />
                </Press>
              ) : null}
            </View>
          );
        }}
      />
      <Fab testID="new-listing" icon="plus" label={t('Rent out')} onPress={() => router.push('/listing/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryWrap: { flexDirection: 'row', alignItems: 'center' },
  summary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 12, paddingVertical: 14 },
  clear: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  sumT: { fontFamily: F.b, fontSize: 15 },
  sumS: { fontFamily: F.m, fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', gap: 14, minHeight: 128 },
  thumb: { width: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontFamily: F.b, fontSize: 16, lineHeight: 20 },
  price: { fontFamily: F.b, fontSize: 18 },
  per: { fontFamily: F.m, fontSize: 13 },
  heart: { position: 'absolute', top: 6, right: 6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingT: { fontFamily: F.b, fontSize: 12 },
});
