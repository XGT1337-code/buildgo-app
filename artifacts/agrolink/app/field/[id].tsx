import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { GeoMap } from '@/components/FieldMap';
import { WeatherStrip } from '@/components/Weather';
import { viewFor } from '@/lib/geo';
import { Body, Button, Card, Chip, DemoBadge, Empty, F, H2, IconButton, Muted, Press, Segmented, useTopInset } from '@/components/ui';
import { LOG_ICON, LOG_LABEL, siteText } from '@/lib/demo';
import { confirm, mapsUrl, notify, shareText } from '@/lib/device';
import { centroid, cmpStr, csvCell, fmtArea, fmtDay, imageSource, fieldCover } from '@/lib/util';
import type { LogType } from '@/lib/types';
import { t } from '@/lib/i18n';

export default function FieldDetail() {
  const c = useColors();
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, deleteField, deleteLog } = useAppData();
  const field = state.fields.find((f) => f.id === id);
  const logs = useMemo(() => state.logs.filter((l) => l.fieldId === id).sort((a, b) => cmpStr(b.date, a.date)), [state.logs, id]);
  const [logFilter, setLogFilter] = useState<LogType | 'all'>('all');
  const [showMap, setShowMap] = useState(false);
  const shownLogs = logFilter === 'all' ? logs : logs.filter((l) => l.type === logFilter);
  const logTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.type))), [logs]);

  if (!field) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 20, paddingHorizontal: 18 }}>
        <Empty icon="alert-circle" title={t('Site not found')} body={t('It may have been deleted.')}
          action={<Button label={t('Back to sites')} onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 10 }} />} />
      </View>
    );
  }

  const outlined = field.boundary.length >= 3;
  const center = centroid(field.boundary) ?? field.point;
  const year = new Date().getFullYear().toString();
  const season = logs.filter((l) => l.date.startsWith(year));
  const lastOf = (t: LogType) => logs.find((l) => l.type === t)?.date;

  const directions = () => {
    if (!center) return;
    Linking.openURL(mapsUrl(center, field.name)).catch(() => notify(t('No maps app'), t('Could not open a maps app on this device.'), 'error'));
  };

  const exportDiary = () => {
    const rows = [['date', 'type', 'note', 'site', 'stage', 'area_m2'].join(',')]
      .concat([...logs].reverse().map((l) => [l.date, LOG_LABEL[l.type] ?? l.type, l.note, field.name, t(field.crop), String(Math.round(field.areaHa * 10000))].map(csvCell).join(',')));
    const safe = field.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'site';
    shareText(`${safe}-work-log.csv`, rows.join('\n'), 'text/csv');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 280 }}>
          <Image source={fieldCover(field)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <LinearGradient colors={['rgba(22,24,28,0.55)', 'transparent', 'rgba(22,24,28,0.85)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.topBar, { top: top + 6 }]}>
            <IconButton icon="arrow-left" label={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/fields'))} testID="back" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {center ? <IconButton icon="navigation" label={t('Directions to site')} onPress={directions} testID="field-directions" /> : null}
              <IconButton icon="edit-2" label={t('Edit site')} onPress={() => router.push({ pathname: '/field/edit', params: { id: field.id } })} testID="edit-field" />
              <IconButton icon="trash-2" label={t('Delete site')} color={c.destructive} testID="delete-field"
                onPress={() => confirm(t('Delete site?'), t('{name} and its work log will be removed from this device.', { name: field.name }), () => { deleteField(field.id); router.back(); }, t('Delete'))} />
            </View>
          </View>
          <View style={styles.heroText}>
            {field.sample ? <DemoBadge label={t('EXAMPLE SITE, NOT YOURS')} style={{ alignSelf: 'flex-start' }} /> : null}
            {field.example ? <DemoBadge label={t('EXAMPLE · NOT YOURS')} style={{ alignSelf: 'flex-start' }} /> : null}
            <Text style={[styles.name, { color: c.primaryForeground }]}>{siteText(field, field.name)}</Text>
            <Text style={[styles.meta, { color: c.accent }]}>{t(field.crop)} · {fmtArea(field.areaHa)} · {field.village}</Text>
          </View>
        </View>

        <View style={{ padding: 18, gap: 18 }}>
          <View style={styles.facts}>
            {[[t('Ground'), t(field.soil), 'layers'], [t('Power on site'), t(field.irrigation), 'zap'], [t('Area'), fmtArea(field.areaHa), 'maximize']].map(([k, v, ic]) => (
              <View key={k} style={[styles.fact, { backgroundColor: c.card, borderColor: c.border }]}>
                <Feather name={ic as 'layers'} size={18} color={c.primary} />
                <Text style={[styles.factV, { color: c.foreground }]} numberOfLines={1}>{v}</Text>
                <Muted>{k}</Muted>
              </View>
            ))}
          </View>

          {outlined || field.point ? <Card style={{ padding: 12, gap: 10 }}>
            <Button label={t(outlined ? (showMap ? 'Hide boundary map' : 'Show boundary map') : (showMap ? 'Hide map' : 'Show on map'))} icon="map" variant="ghost" onPress={() => setShowMap((v) => !v)} />
            {showMap ? <GeoMap fields={[field]} height={220} rounded controls={outlined} interactive fitOnLoad={outlined}
              testID="field-detail-map" center={center ?? viewFor(state.profile).center} zoom={outlined ? 15 : 13} /> : null}
          </Card> : null}
          {center ? (
            <Card style={{ padding: 16 }}>
              <WeatherStrip point={center} place={siteText(field, field.name)} />
            </Card>
          ) : null}


          {field.notes ? <Card style={{ padding: 14 }}><Body>{siteText(field, field.notes)}</Body></Card> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <H2 style={{ flex: 1 }}>{t('Work log')}</H2>
            {logs.length ? (
              <Press onPress={exportDiary} style={[styles.export, { borderColor: c.border, backgroundColor: c.card }]} testID="export-diary" accessibilityLabel={t('Export work log as CSV')}>
                <Feather name="download" size={15} color={c.forest} />
                <Text style={[styles.exportT, { color: c.forest }]}>CSV</Text>
              </Press>
            ) : null}
          </View>
          {logs.length ? (
            <View style={styles.season}>
              {[
                [String(season.length), t('entries in {year}', { year })],
                [lastOf('delivery') ? fmtDay(lastOf('delivery')!) : '—', t('last delivery')],
                [lastOf('concrete') ? fmtDay(lastOf('concrete')!) : '—', t('last pour')],
              ].map(([v, k]) => (
                <View key={k} style={[styles.seasonBox, { backgroundColor: c.secondary }]}>
                  <Text style={[styles.seasonV, { color: c.forest }]} numberOfLines={1}>{v}</Text>
                  <Muted style={{ fontSize: 11 }}>{k}</Muted>
                </View>
              ))}
            </View>
          ) : null}
          {logTypes.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label={`${t('All')} · ${logs.length}`} active={logFilter === 'all'} onPress={() => setLogFilter('all')} />
              {logTypes.map((lt) => (
                <Chip key={lt} label={LOG_LABEL[lt] ?? t('Note')} icon={(LOG_ICON[lt] ?? 'edit-3') as 'feather'} active={logFilter === lt} onPress={() => setLogFilter(lt)} />
              ))}
            </ScrollView>
          ) : null}
          {logs.length === 0 ? (
            <Empty icon="book-open" title={t('Work log is empty')} body={t('Log deliveries, earthworks, pours, machines and inspections. Add a photo for the record.')} />
          ) : shownLogs.map((l, i) => (
            <View key={l.id} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.dot, { backgroundColor: c.forest }]}><Feather name={(LOG_ICON[l.type] ?? 'edit-3') as 'feather'} size={16} color={c.accent} /></View>
                {i < shownLogs.length - 1 ? <View style={[styles.line, { backgroundColor: c.border }]} /> : null}
              </View>
              <Card style={{ flex: 1, padding: 14, gap: 8, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.logT, { color: c.foreground }]}>{LOG_LABEL[l.type] ?? t('Note')}</Text>
                  <Muted style={{ marginLeft: 8 }}>{fmtDay(l.date)}</Muted>
                  <Press style={{ marginLeft: 'auto', padding: 6 }} hitSlop={8} accessibilityLabel={t('Delete log entry')}
                    onPress={() => confirm(t('Delete entry?'), t('This log entry will be removed.'), () => deleteLog(l.id), t('Delete'))}>
                    <Feather name="x" size={18} color={c.mutedForeground} />
                  </Press>
                </View>
                {l.note ? <Body style={{ fontSize: 14 }}>{siteText(field, l.note)}</Body> : null}
                {l.photo ? <Image source={imageSource(l.photo)} style={{ height: 160, borderRadius: c.radius }} contentFit="cover" /> : null}
              </Card>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14, backgroundColor: c.background, borderTopColor: c.border }]}>
        <Button label={t('Add log entry')} icon="plus" onPress={() => router.push({ pathname: '/log/new', params: { fieldId: field.id } })} testID="add-log" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  name: { fontFamily: F.b, fontSize: 30, letterSpacing: -0.8 },
  meta: { fontFamily: F.s, fontSize: 14, marginTop: 4 },
  facts: { flexDirection: 'row', gap: 10 },
  fact: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 4 },
  factV: { fontFamily: F.b, fontSize: 15 },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1 },
  logT: { fontFamily: F.b, fontSize: 15 },
  export: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, minHeight: 36 },
  exportT: { fontFamily: F.b, fontSize: 13 },
  season: { flexDirection: 'row', gap: 8 },
  seasonBox: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  seasonV: { fontFamily: F.b, fontSize: 17 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
