import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCatalogItem, checkCatalogName, decideReview, deleteCatalogItem, getGetAdminStatsQueryKey, getListAdminReviewsQueryKey, getListListingsQueryKey,
  searchCatalog as searchServerCatalog, useListAdminReviews, type CatalogCheck, type CatalogItem, type CatalogKind,
  type LicenseReview, type ServerListing, type VehicleReview,
} from '@workspace/api-client-react';
import { CATALOG_KINDS, EQUIPMENT_TYPES } from '@workspace/reference';
import { useColors } from '@/hooks/useColors';
import { Button, Card, Chip, Empty, F, Field, H2, Label, Muted, Press, Segmented } from '@/components/ui';
import { CheckList, PrivateImage, StatusPill } from '@/components/Verify';
import { apiError } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { notify } from '@/lib/device';
import { timeAgo } from '@/lib/util';
import { t, useI18n } from '@/lib/i18n';
import { CATEGORY_LABEL } from '@/lib/demo';

const who = (o: { firstName: string; lastName: string; username: string }) => `${o.firstName} ${o.lastName} · @${o.username}`;

// --------------------------------------------------------------------------- review queue

type Item =
  | { kind: 'listing'; at: string; v: ServerListing }
  | { kind: 'vehicle'; at: string; v: VehicleReview }
  | { kind: 'license'; at: string; v: LicenseReview };

export function ReviewQueue({ header }: { header: React.ReactElement }) {
  const c = useColors();
  const q = useListAdminReviews({ query: { queryKey: getListAdminReviewsQueryKey(), refetchInterval: 30_000 } });
  const items: Item[] = [
    ...(q.data?.vehicles ?? []).map((v) => ({ kind: 'vehicle' as const, at: v.createdAt, v })),
    ...(q.data?.licenses ?? []).map((v) => ({ kind: 'license' as const, at: v.createdAt, v })),
    ...(q.data?.listings ?? []).map((v) => ({ kind: 'listing' as const, at: v.createdAt, v })),
  ];
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={items}
      keyExtractor={(x) => `${x.kind}-${x.v.id}`}
      refreshing={q.isRefetching}
      onRefresh={() => { void q.refetch(); }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      ListHeaderComponent={header}
      ListEmptyComponent={q.isLoading ? <ActivityIndicator color={c.primary} />
        : <Empty icon="check-circle" title={t('Nothing to review')} body={t('New listings, machines and licences appear here in real time.')} />}
      renderItem={({ item }) => <ReviewCard item={item} />}
    />
  );
}

function ReviewCard({ item }: { item: Item }) {
  const c = useColors();
  const { lang } = useI18n();
  const cache = useQueryClient();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('');
  const [zoom, setZoom] = useState<string | null>(null);
  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !note.trim()) { notify(t('Write the reason'), t('The owner sees it and knows what to fix.'), 'error'); return; }
    setBusy(decision);
    try {
      await decideReview(item.kind, item.v.id, { decision, note: note.trim() || undefined });
      await Promise.all([
        cache.invalidateQueries({ queryKey: getListAdminReviewsQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }),
        cache.invalidateQueries({ queryKey: getListListingsQueryKey() }),
      ]);
      notify(decision === 'approve' ? t('Approved') : t('Rejected'), '', decision === 'approve' ? 'success' : 'info');
    } catch (e) { notify(decision === 'approve' ? t('Not approved yet') : t('Not rejected'), t(apiError(e)), 'error'); }
    finally { setBusy(''); }
  };

  const typeName = (id?: string | null) => {
    const x = EQUIPMENT_TYPES.find((e) => e.id === id);
    return x ? (lang === 'ru' ? x.ru : lang === 'en' ? x.en : x.az) : id ?? '';
  };

  let icon: React.ComponentProps<typeof Feather>['name'] = 'file';
  let title = '';
  let sub = '';
  let docs: string[] = [];
  let photo: string | null = null;
  if (item.kind === 'vehicle') {
    icon = 'truck'; title = `${item.v.brand} ${item.v.model}`;
    sub = [typeName(item.v.typeId), item.v.year, item.v.powerHp && `${item.v.powerHp} ${t('hp')}`].filter(Boolean).join(' · ');
    docs = item.v.docIds; photo = item.v.photoId ?? null;
  } else if (item.kind === 'license') {
    icon = 'credit-card'; title = `${t('Licence')} ${item.v.number}`;
    sub = `${item.v.categories.join(', ')} · ${t('valid until {date}', { date: item.v.expiresOn })}`;
    docs = [item.v.frontId, item.v.backId].filter((x): x is string => !!x);
  } else {
    icon = 'tag'; title = item.v.title;
    sub = `${CATEGORY_LABEL[item.v.category]} · ${item.v.pricePerDay} AZN/${t('day')} · ${item.v.village}`;
    photo = item.v.photoId ?? null;
  }
  const kindLabel = { listing: t('Listing'), vehicle: t('Machine'), license: t('Driving licence') }[item.kind];

  return (
    <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOut.duration(150)} layout={LinearTransition}>
      <Card style={{ padding: 14, gap: 12 }} testID={`review-${item.kind}-${item.v.id}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.kindIcon, { backgroundColor: c.muted }]}><Feather name={icon} size={18} color={c.forest} /></View>
          <View style={{ flex: 1 }}>
            <Muted style={{ fontSize: 11, letterSpacing: 0.6 }}>{kindLabel.toUpperCase()} · {timeAgo(item.at)}</Muted>
            <Text style={{ fontFamily: F.b, fontSize: 16, color: c.foreground }} numberOfLines={2}>{title}</Text>
          </View>
        </View>
        <Muted>{sub}</Muted>
        <Muted>{t('By')} {who(item.v.owner)}</Muted>
        {item.kind === 'vehicle' ? (
          <View style={[styles.ids, { backgroundColor: c.muted }]}>
            <Text style={[styles.idT, { color: c.foreground }]}>VIN {item.v.vin}</Text>
            {item.v.plate ? <Text style={[styles.idT, { color: c.foreground }]}>{t('Plate')} {item.v.plate}</Text> : null}
          </View>
        ) : null}
        {item.kind === 'listing' && item.v.vehicle ? (
          <View style={[styles.ids, { backgroundColor: c.muted }]}>
            <Text style={[styles.idT, { color: c.foreground }]}>{item.v.vehicle.brand} {item.v.vehicle.model} · {item.v.vehicle.plate ?? item.v.vehicle.vin}</Text>
            <StatusPill status={item.v.vehicle.status} />
          </View>
        ) : null}
        {item.kind === 'listing' && item.v.description ? <Text style={{ fontFamily: F.r, fontSize: 14, color: c.foreground }}>{item.v.description}</Text> : null}
        {docs.length || photo ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {docs.map((id) => (
              <Press key={id} onPress={() => setZoom(id)}><PrivateImage id={id} style={styles.doc} /></Press>
            ))}
            {photo ? <Image source={{ uri: mediaUrl(photo) }} style={styles.doc} contentFit="cover" /> : null}
          </ScrollView>
        ) : null}
        <View style={{ gap: 4 }}>
          <Label>{t('Automatic checks')}</Label>
          <CheckList checks={item.v.checks} compact />
        </View>
        <Field placeholder={t('Note for the owner (required to reject)')} value={note} onChangeText={setNote} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label={t('Reject')} icon="x" variant="ghost" onPress={() => decide('reject')} loading={busy === 'reject'} style={{ flex: 1, minHeight: 46 }} />
          <Button label={t('Approve')} icon="check" onPress={() => decide('approve')} loading={busy === 'approve'} style={{ flex: 1, minHeight: 46 }}
            testID={`approve-${item.kind}-${item.v.id}`} />
        </View>
      </Card>
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)} statusBarTranslucent>
        <Press onPress={() => setZoom(null)} haptic={false} style={styles.zoomBg}>
          {zoom ? <PrivateImage id={zoom} style={styles.zoomImg} fit="contain" /> : null}
        </Press>
      </Modal>
    </Animated.View>
  );
}

// --------------------------------------------------------------------------- catalog

const KIND_LABEL: Record<CatalogKind, string> = {
  work: 'Kinds of work', material: 'Materials', equipment: 'Machine types', brand: 'Brands', model: 'Models', place: 'Places',
};

export function CatalogAdmin({ header }: { header: React.ReactElement }) {
  const c = useColors();
  const { lang } = useI18n();
  const cache = useQueryClient();
  const [kind, setKind] = useState<CatalogKind>('equipment');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 220); return () => clearTimeout(id); }, [q]);
  const found = useQuery({
    queryKey: ['catalog', kind, debounced], enabled: debounced.length >= 1,
    queryFn: () => searchServerCatalog({ q: debounced, kind }),
  });
  const name = (x: CatalogItem) => (lang === 'ru' ? x.ru : lang === 'en' ? x.en : x.az);
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={debounced ? found.data ?? [] : []}
      keyExtractor={(x) => x.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          {header}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATALOG_KINDS.map((k) => <Chip key={k} label={t(KIND_LABEL[k])} active={kind === k} onPress={() => setKind(k)} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={[styles.search, { flex: 1, backgroundColor: c.card, borderColor: c.border }]}>
              <Feather name="search" size={18} color={c.mutedForeground} />
              <TextInput value={q} onChangeText={setQ} placeholder={t('Search in any language')} placeholderTextColor={c.mutedForeground} autoCorrect={false}
                style={[{ flex: 1, minHeight: 46, fontFamily: F.m, fontSize: 15, color: c.foreground }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                testID="catalog-search" />
            </View>
            <Press onPress={() => setAdding(true)} style={[styles.plus, { backgroundColor: c.forest }]} accessibilityLabel={t('Add to catalog')} testID="catalog-add">
              <Feather name="plus" size={22} color={c.accent} />
            </Press>
          </View>
          <Muted>{t('Built in: every city, village and district of Azerbaijan (OpenStreetMap), kinds of work, building materials, machine and tool types, brands and models.')}</Muted>
        </View>
      }
      ListEmptyComponent={debounced ? (found.isLoading ? <ActivityIndicator color={c.primary} /> : <Muted>{t('Nothing found. Tap + to add it.')}</Muted>) : null}
      renderItem={({ item }) => (
        <Card style={styles.catRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.s, fontSize: 15, color: c.foreground }}>{name(item)}</Text>
            <Muted style={{ fontSize: 12 }}>{[item.az !== name(item) ? item.az : null, item.ru !== name(item) ? item.ru : null, item.sub].filter(Boolean).join(' · ')}</Muted>
          </View>
          {item.source === 'admin' ? (
            <Press onPress={async () => { await deleteCatalogItem(item.id).catch(() => {}); void cache.invalidateQueries({ queryKey: ['catalog'] }); }}
              accessibilityLabel={t('Remove')} hitSlop={8}>
              <Feather name="trash-2" size={18} color={c.destructive} />
            </Press>
          ) : <Feather name="lock" size={14} color={c.mutedForeground} />}
        </Card>
      )}
      ListFooterComponent={<AddItemSheet visible={adding} kind={kind} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void cache.invalidateQueries({ queryKey: ['catalog'] }); }} />}
    />
  );
}

/** Name in three languages; every keystroke is checked against the catalog for duplicates and typos. */
function AddItemSheet({ visible, kind, onClose, onAdded }: { visible: boolean; kind: CatalogKind; onClose: () => void; onAdded: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [az, setAz] = useState('');
  const [ru, setRu] = useState('');
  const [en, setEn] = useState('');
  const [brand, setBrand] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [check, setCheck] = useState<CatalogCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (visible) { setAz(''); setRu(''); setEn(''); setBrand(''); setLat(''); setLng(''); setCheck(null); setMsg(''); } }, [visible, kind]);
  useEffect(() => {
    const name = az.trim();
    if (!name || (kind === 'model' && !brand.trim())) { setCheck(null); return; }
    setChecking(true);
    const id = setTimeout(() => {
      checkCatalogName({ kind, name, brand: brand.trim() || undefined }).then(setCheck).catch(() => setCheck(null)).finally(() => setChecking(false));
    }, 300);
    return () => clearTimeout(id);
  }, [az, brand, kind]);

  const add = async (force: boolean) => {
    setBusy(true); setMsg('');
    try {
      await addCatalogItem({
        kind, az: az.trim(), ru: ru.trim() || undefined, en: en.trim() || undefined, brand: brand.trim() || undefined, force,
        lat: lat ? Number(lat) : undefined, lng: lng ? Number(lng) : undefined,
      });
      notify(t('Added'), az.trim(), 'success');
      onAdded();
    } catch (e) { setMsg(t(apiError(e))); }
    finally { setBusy(false); }
  };
  const tone = !check ? c.mutedForeground : { exists: c.clay, similar: c.wheat, new: c.primary, invalid: c.destructive }[check.verdict];
  const icon = !check ? 'help-circle' : ({ exists: 'copy', similar: 'alert-triangle', new: 'check-circle', invalid: 'x-circle' } as const)[check.verdict];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, gap: 14, paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 18, paddingBottom: insets.bottom + 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <H2 style={{ flex: 1 }}>{t('Add to catalog')} · {t(KIND_LABEL[kind])}</H2>
          <Press onPress={onClose} style={[styles.close, { backgroundColor: c.muted }]}><Feather name="x" size={20} color={c.forest} /></Press>
        </View>
        {kind === 'model' ? <Field label={t('Brand')} value={brand} onChangeText={setBrand} placeholder="KamAZ" testID="cat-brand" /> : null}
        <Field label={t('Name in Azerbaijani')} value={az} onChangeText={setAz} placeholder={kind === 'model' ? '65801' : 'Qazobeton blok'} testID="cat-az" />
        <Field label={t('Name in Russian')} value={ru} onChangeText={setRu} placeholder="Газобетонный блок" />
        <Field label={t('Name in English')} value={en} onChangeText={setEn} placeholder="Aerated concrete block" />
        {kind === 'place' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label={t('Latitude')} value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="40.41" style={{ flex: 1 }} />
            <Field label={t('Longitude')} value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="49.87" style={{ flex: 1 }} />
          </View>
        ) : null}
        {az.trim() ? (
          <Card style={{ padding: 14, gap: 8, borderColor: tone }} testID="cat-verdict">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {checking ? <ActivityIndicator size="small" color={c.primary} /> : <Feather name={icon} size={18} color={tone} />}
              <Text style={{ flex: 1, fontFamily: F.s, fontSize: 14, color: c.foreground }}>{check ? t(check.message) : t('Checking…')}</Text>
            </View>
            {check?.matches.slice(0, 4).map((m) => (
              <Press key={m.id} onPress={() => { setAz(m.az); setRu(m.ru); setEn(m.en); }} haptic={false} style={styles.match}>
                <Feather name="corner-down-right" size={14} color={c.mutedForeground} />
                <Text style={{ flex: 1, fontFamily: F.m, fontSize: 13, color: c.foreground }}>{m.az} · {m.ru} · {m.en}</Text>
                <Muted style={{ fontSize: 11 }}>{Math.round((m.score ?? 0) * 100)}%</Muted>
              </Press>
            ))}
          </Card>
        ) : null}
        {msg ? <Text style={{ fontFamily: F.s, color: c.destructive }}>{msg}</Text> : null}
        {check?.verdict === 'similar' ? (
          <Button label={t('It is different, add anyway')} icon="plus" variant="ghost" onPress={() => add(true)} loading={busy} />
        ) : null}
        <Button label={t('Add')} icon="check" onPress={() => add(false)} loading={busy} disabled={!check || check.verdict !== 'new'} testID="cat-submit" />
        <Muted>{t('Exact duplicates and nonsense names are refused. Close matches need your confirmation, so typos do not end up in the catalog.')}</Muted>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kindIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ids: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  idT: { fontFamily: F.s, fontSize: 13, letterSpacing: 0.4 },
  doc: { width: 150, height: 100, borderRadius: 12 },
  zoomBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  zoomImg: { width: '100%', height: '85%' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14 },
  plus: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  match: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
