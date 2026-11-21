import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { searchCatalog, type CatalogKind } from '@workspace/reference';
import { useColors } from '@/hooks/useColors';
import { F, Label, Muted, Press, type IconName } from '@/components/ui';
import { pickPhoto } from '@/lib/device';
import { privateImage } from '@/lib/media';
import { useI18n, t } from '@/lib/i18n';

export type Level = 'ok' | 'warn' | 'error';
export interface CheckRow { field: string; level: Level; message: string; tpl?: string; vars?: Record<string, unknown> }

/** Catalog subtitles join parts like "kənd · Goranboy": translate each part, keep names as they are. */
const tParts = (s: string) => s.split(' · ').map((x) => t(x)).join(' · ');
const tVars = (v?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v ?? {}).map(([k, x]) => [k, typeof x === 'string' ? tParts(x) : x])) as Record<string, string | number>;

const ICON: Record<Level, IconName> = { ok: 'check-circle', warn: 'alert-triangle', error: 'x-circle' };

/** Automatic check results, colour-coded. */
export function CheckList({ checks, compact }: { checks: CheckRow[]; compact?: boolean }) {
  const c = useColors();
  const tone: Record<Level, string> = { ok: c.success, warn: c.clay, error: c.destructive };
  if (!checks.length) return null;
  return (
    <View style={{ gap: compact ? 4 : 6 }}>
      {checks.map((k, i) => (
        <Animated.View key={`${k.field}-${i}`} entering={FadeIn.duration(180)} style={styles.check}>
          <Feather name={ICON[k.level]} size={15} color={tone[k.level]} style={{ marginTop: 2 }} />
          <Text style={[styles.checkT, { color: k.level === 'ok' ? c.foreground : tone[k.level], fontSize: compact ? 12 : 13 }]}>{k.tpl ? t(k.tpl, tVars(k.vars)) : t(k.message)}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

export function StatusPill({ status, style }: { status: 'pending' | 'approved' | 'rejected'; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const map = {
    pending: { bg: c.noticeBg, fg: c.clay, icon: 'clock' as IconName, label: t('On review') },
    approved: { bg: c.successBg, fg: c.success, icon: 'check-circle' as IconName, label: t('Verified') },
    rejected: { bg: '#FBE9E4', fg: c.destructive, icon: 'x-circle' as IconName, label: t('Rejected') },
  }[status];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }, style]}>
      <Feather name={map.icon} size={12} color={map.fg} />
      <Text style={[styles.pillT, { color: map.fg }]}>{map.label}</Text>
    </View>
  );
}

/** Tap to add a photo of a document or machine. */
export function PhotoSlot({ label, uri, onChange, icon = 'camera', testID }: {
  label: string; uri?: string; onChange: (uri: string | undefined) => void; icon?: IconName; testID?: string;
}) {
  const c = useColors();
  const pick = async (source: 'library' | 'camera') => { const u = await pickPhoto(source); if (u) onChange(u); };
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text numberOfLines={1} style={[styles.slotLabel, { color: c.mutedForeground }]}>{label}</Text>
      <Press onPress={() => pick(Platform.OS === 'web' ? 'library' : 'camera')} testID={testID}
        style={[styles.slot, { borderColor: uri ? c.primary : c.input, backgroundColor: c.muted }]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Feather name={icon} size={22} color={c.primary} />
            <Muted style={{ fontSize: 12 }}>{Platform.OS === 'web' ? t('Choose photo') : t('Take photo')}</Muted>
          </View>
        )}
      </Press>
      {Platform.OS !== 'web' ? (
        <Press onPress={() => pick('library')} haptic={false}><Muted style={{ fontSize: 12, color: c.primary }}>{t('or choose from gallery')}</Muted></Press>
      ) : null}
    </View>
  );
}

/** A private (owner + admin only) image from the server. `contain` shows the whole picture (documents under review). */
export function PrivateImage({ id, style, fit = 'cover' }: { id: string; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain' }) {
  const c = useColors();
  const [src, setSrc] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { privateImage(id).then(setSrc).catch(() => setFailed(true)); }, [id]);
  return (
    <View style={[{ backgroundColor: fit === 'contain' ? 'transparent' : c.muted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit={fit} /> : failed ? <Feather name="image" size={22} color={c.mutedForeground} /> : <ActivityIndicator color={c.primary} />}
    </View>
  );
}

/**
 * Text field with suggestions from the built-in reference catalog (and any extra options).
 * Suggestions are matched across Azerbaijani, Russian and English, with typos tolerated.
 */
export function CatalogInput({ label, kind, value, onChange, placeholder, brand, icon = 'search', testID, options }: {
  label: string; kind: CatalogKind; value: string; onChange: (v: string, picked?: { az: string; sub?: string; point?: [number, number] }) => void;
  placeholder?: string; brand?: string; icon?: IconName; testID?: string; options?: string[];
}) {
  const c = useColors();
  const { lang } = useI18n();
  const [focus, setFocus] = useState(false);
  const [typed, setTyped] = useState(false);
  const matches = useMemo(() => {
    if (!typed || value.trim().length < 2) {
      return focus && options?.length && !value.trim()
        ? options.slice(0, 8).map((o) => ({ key: o, title: o, sub: '', az: o, point: undefined as [number, number] | undefined }))
        : [];
    }
    return searchCatalog(value, { kind, brand, limit: 6 }).map(({ item }) => ({
      key: item.id, title: lang === 'ru' ? item.ru : lang === 'en' ? item.en : item.az, sub: item.sub ?? '', az: item.az, point: item.point,
    }));
  }, [value, kind, brand, lang, focus, typed, options]);
  const exact = matches.some((m) => m.title.toLowerCase() === value.trim().toLowerCase() || m.az.toLowerCase() === value.trim().toLowerCase());
  return (
    <View style={{ gap: 6, zIndex: focus ? 10 : 0 }}>
      <Label>{label}</Label>
      <View style={[styles.input, { borderColor: focus ? c.primary : c.input, backgroundColor: c.card }]}>
        <Feather name={icon} size={17} color={focus ? c.primary : c.mutedForeground} />
        <TextInput value={value} placeholder={placeholder} placeholderTextColor={c.mutedForeground} testID={testID} autoCorrect={false}
          onChangeText={(v) => { setTyped(true); onChange(v); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 180)}
          style={[{ flex: 1, minHeight: 50, fontFamily: F.m, fontSize: 16, color: c.foreground }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      </View>
      {focus && matches.length && !exact ? (
        <Animated.View entering={FadeInDown.duration(140)} style={[styles.menu, { backgroundColor: c.card, borderColor: c.border }]}>
          {matches.map((m) => (
            <Press key={m.key} haptic={false} onPress={() => { setTyped(false); onChange(m.az, { az: m.az, sub: m.sub, point: m.point }); }}
              style={[styles.opt, { borderColor: c.border }]}>
              <Text style={{ fontFamily: F.s, fontSize: 15, color: c.foreground }} numberOfLines={1}>{m.title}</Text>
              {m.sub ? <Muted numberOfLines={1} style={{ fontSize: 12 }}>{tParts(m.sub)}</Muted> : null}
            </Press>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  checkT: { flex: 1, fontFamily: F.m, lineHeight: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, alignSelf: 'flex-start' },
  pillT: { fontFamily: F.b, fontSize: 11 },
  slotLabel: { fontFamily: F.s, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' },
  slot: { height: 120, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  input: { minHeight: 54, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menu: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  opt: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 2 },
});
