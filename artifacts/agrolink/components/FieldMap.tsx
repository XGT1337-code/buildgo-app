import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { F, Press } from '@/components/ui';
import { MapFrame, type MapFrameHandle } from '@/components/MapFrame';
import { buildMapHtml, type MapFieldData } from '@/lib/mapHtml';
import { fmtArea, makeProjector } from '@/lib/util';
import type { Field, LngLat } from '@/lib/types';
import { t } from '@/lib/i18n';

const toData = (fields: Field[]): MapFieldData[] => fields.map((f) => ({
  id: f.id, name: f.name, crop: t(f.crop), ha: f.areaHa, soil: t(f.soil), privacy: f.privacy, sample: !!f.sample, b: f.boundary, p: f.point, area: fmtArea(f.areaHa),
}));

type Status = 'loading' | 'ready' | 'error';

export interface GeoMapProps {
  fields: Field[];
  center: LngLat;
  zoom: number;
  height?: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  /** Fit to fields once on first load instead of starting at center. */
  fitOnLoad?: boolean;
  /** Show Fit / Recenter buttons. */
  controls?: boolean;
  interactive?: boolean;
  /** Called when "Fit sites" finds nothing with a boundary. */
  onNoFields?: () => void;
  testID?: string;
  rounded?: boolean;
  /** When set (view mode), `center`/`zoom` act as the World view and this is the "My area" view. */
  area?: { center: LngLat; zoom: number };
  /** Keep the map alive while hidden; when it shows again Leaflet re-measures instead of reloading. */
  visible?: boolean;
}

/**
 * Real geographic basemap (OpenStreetMap tiles via Leaflet) on native and web.
 * Fields are drawn exactly where their saved boundaries are; nothing is moved or invented.
 */
export function GeoMap({
  fields, center, zoom, height = 340, selectedId, onSelect, onOpen, fitOnLoad = false, controls = true, interactive = true,
  onNoFields, testID = 'geo-map', rounded = true, area, visible = true,
}: GeoMapProps) {
  const c = useColors();
  const frame = useRef<MapFrameHandle>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [errMsg, setErrMsg] = useState('');
  const ch = useMemo(() => `m${Math.random().toString(36).slice(2, 9)}${attempt}`, [attempt]);

  // Latest props in refs, so the html is built once per attempt and later changes go over messages.
  const live = useRef({ fields, selectedId, center, zoom, onSelect, onOpen, onNoFields });
  live.current = { fields, selectedId, center, zoom, onSelect, onOpen, onNoFields };

  const html = useMemo(() => buildMapHtml({
    ch, center: live.current.center, zoom: live.current.zoom, fields: toData(live.current.fields), sel: live.current.selectedId,
    fit: fitOnLoad, interactive,
    lbl: { stage: t('Stage'), area: t('Area'), ground: t('Ground'), open: t('Open site'), sample: t('SAMPLE SITE') },
  }), [ch, fitOnLoad, interactive]);

  useEffect(() => {
    setStatus('loading');
    const timer = setTimeout(() => {
      setStatus((s) => {
        if (s === 'loading') { setErrMsg(t('The map is taking too long. Check your connection.')); return 'error'; }
        return s;
      });
    }, 20000);
    return () => clearTimeout(timer);
  }, [ch]);

  const onMessage = useCallback((raw: string) => {
    let m: { type?: string; id?: string; p?: LngLat; ch?: string; reason?: string };
    try { m = JSON.parse(raw); } catch { return; }
    if (m.ch !== ch && m.ch !== '*') return;
    const L = live.current;
    switch (m.type) {
      case 'ready': setStatus('ready'); break;
      case 'error':
        setErrMsg(m.reason === 'tiles' ? t('Map tiles could not load. You may be offline.') : t('The map could not load. You may be offline.'));
        setStatus('error');
        break;
      case 'select': if (m.id) L.onSelect?.(m.id); break;
      case 'open': if (m.id) L.onOpen?.(m.id); break;
      case 'nofields': L.onNoFields?.(); break;
    }
  }, [ch]);

  const fieldsKey = useMemo(() => JSON.stringify(toData(fields)) + (selectedId ?? ''), [fields, selectedId]);
  useEffect(() => {
    if (status !== 'ready') return;
    frame.current?.send({ cmd: 'fields', fields: toData(live.current.fields), sel: live.current.selectedId });
  }, [fieldsKey, status]);

  const viewKey = `${center[0].toFixed(5)},${center[1].toFixed(5)},${zoom}`;
  const firstView = useRef(true);
  useEffect(() => {
    if (status !== 'ready') return;
    if (firstView.current) { firstView.current = false; return; }
    frame.current?.send({ cmd: 'view', center: live.current.center, zoom: live.current.zoom });
  }, [viewKey, status]);

  useEffect(() => {
    if (visible && status === 'ready') frame.current?.send({ cmd: 'resize' });
  }, [visible, status]);

  const hasShapes = fields.some((f) => f.boundary.length >= 3);

  return (
    <View testID={testID} style={[styles.wrap, { height, backgroundColor: c.mapBg, borderRadius: rounded ? c.radius + 4 : 0, borderColor: c.border }]}>
      <MapFrame key={ch} ref={frame} html={html} onMessage={onMessage} testID={`${testID}-frame`} />
      {status === 'loading' ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(231,229,222,0.92)' }]}>
          <ActivityIndicator color={c.forest} />
          <Text style={[styles.ovT, { color: c.forest }]}>{t('Loading map')}</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.secondary, padding: 20 }]} testID={`${testID}-error`}>
          <Feather name="wifi-off" size={26} color={c.clay} />
          <Text style={[styles.ovT, { color: c.foreground, textAlign: 'center' }]}>{errMsg || t('The map could not load.')}</Text>
          <Text style={[styles.ovS, { color: c.mutedForeground }]}>{t('Your sites are safe and still listed.')}</Text>
          <Press onPress={() => { firstView.current = true; setAttempt((a) => a + 1); }} style={[styles.retry, { backgroundColor: c.forest }]} testID={`${testID}-retry`}>
            <Feather name="refresh-cw" size={16} color={c.accent} />
            <Text style={[styles.retryT, { color: c.primaryForeground }]}>{t('Try again')}</Text>
          </Press>
        </View>
      ) : null}
      {controls && status === 'ready' ? (
        <View style={styles.ctrls}>
          {area ? (
            <>
              <Press onPress={() => frame.current?.send({ cmd: 'view', center: live.current.center, zoom: live.current.zoom })}
                style={[styles.ctrl, { backgroundColor: c.card, borderColor: c.border }]} testID="map-world">
                <Feather name="globe" size={18} color={c.forest} />
                <Text style={[styles.ctrlT, { color: c.forest }]}>{t('World')}</Text>
              </Press>
              <Press onPress={() => frame.current?.send({ cmd: 'view', center: area.center, zoom: area.zoom })}
                style={[styles.ctrl, { backgroundColor: c.card, borderColor: c.border }]} testID="map-my-area">
                <Feather name="map-pin" size={18} color={c.forest} />
                <Text style={[styles.ctrlT, { color: c.forest }]}>{t('My area')}</Text>
              </Press>
            </>
          ) : null}
          <Press onPress={() => frame.current?.send({ cmd: 'fit' })} disabled={!hasShapes}
            style={[styles.ctrl, { backgroundColor: c.card, borderColor: c.border, opacity: hasShapes ? 1 : 0.5 }]} testID="map-fit">
            <Feather name="maximize" size={18} color={c.forest} />
            <Text style={[styles.ctrlT, { color: c.forest }]}>{t('Fit sites')}</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

/** Small outline of a boundary for list thumbnails. Shape only, not a map. */
export function FieldShape({ field, height = 120 }: { field: Field; height?: number }) {
  const c = useColors();
  const [w, setW] = useState(0);
  const ok = field.boundary.length >= 3;
  const proj = w && ok ? makeProjector([field.boundary], w, height, 22) : null;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' }}>
      {proj ? (
        <Svg width={w} height={height}>
          <Polygon points={field.boundary.map((p) => proj(p).join(',')).join(' ')} fill={c.primary} fillOpacity={0.55} stroke={c.forest} strokeWidth={2} />
        </Svg>
      ) : !ok ? <Feather name="map" size={34} color={c.mutedForeground} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderWidth: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  ovT: { fontFamily: F.s, fontSize: 14 },
  ovS: { fontFamily: F.m, fontSize: 12 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, minHeight: 44, borderRadius: 22, marginTop: 6 },
  retryT: { fontFamily: F.b, fontSize: 14 },
  ctrls: { position: 'absolute', right: 10, top: 10, gap: 8, alignItems: 'flex-end' },
  ctrl: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, minWidth: 40, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  ctrlT: { fontFamily: F.s, fontSize: 13 },
});
