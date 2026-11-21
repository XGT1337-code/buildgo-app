import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { F, Field, Label, Muted, Press } from '@/components/ui';
import { countryLabel, listCountries, regionsOf } from '@/lib/geo';
import type { SavedLocation } from '@/lib/types';
import { t } from '@/lib/i18n';

type Opt = { code: string; name: string };

function PickerSheet({ visible, title, options, value, onPick, onClose, testID }: {
  visible: boolean; title: string; options: Opt[]; value?: string; onPick: (o: Opt) => void; onClose: () => void; testID: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.name.toLowerCase().includes(t) || o.code.toLowerCase() === t) : options;
  }, [q, options]);
  return (
    // Android has no page sheet: the modal is full screen and edge-to-edge, so it needs the status bar inset.
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}
      statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16 }}>
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetT, { color: c.foreground }]}>{title}</Text>
          <Press onPress={onClose} style={[styles.close, { backgroundColor: c.muted }]} testID={`${testID}-close`}>
            <Feather name="x" size={20} color={c.forest} />
          </Press>
        </View>
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Field value={q} onChangeText={setQ} placeholder={t('Search')} autoCorrect={false} testID={`${testID}-search`} />
        </View>
        <FlatList
          data={list}
          keyExtractor={(o) => o.code}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={30}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 30 }}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>{t('Nothing matches “{q}”', { q })}.</Muted>}
          renderItem={({ item }) => {
            const on = item.code === value;
            return (
              <Press onPress={() => { onPick(item); setQ(''); }} style={[styles.opt, { borderColor: c.border }]} testID={`${testID}-opt-${item.code}`}>
                <Text style={[styles.optT, { color: on ? c.primary : c.foreground, fontFamily: on ? F.b : F.m }]}>{item.name}</Text>
                {on ? <Feather name="check" size={18} color={c.primary} /> : null}
              </Press>
            );
          }}
        />
      </View>
    </Modal>
  );
}

/** Country first, then a region list that depends on it. */
export function LocationPicker({ value, onChange, testID = 'loc', countryOnly = false }: {
  value: SavedLocation | null; onChange: (v: SavedLocation | null) => void; testID?: string;
  /** Hide the region step (first-launch country screen). Region stays optional elsewhere. */
  countryOnly?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState<'country' | 'region' | null>(null);
  const countries = useMemo(() => listCountries(), []);
  const regions = useMemo(() => (value?.country ? regionsOf(value.country) : []), [value?.country]);

  const Box = ({ label, text, placeholder, onPress, disabled, id }: { label: string; text?: string; placeholder: string; onPress: () => void; disabled?: boolean; id: string }) => (
    // No flex: 1 here — in a column with automatic height Android gives it zero height and the box spills out.
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Press onPress={onPress} disabled={disabled} testID={id}
        style={[styles.box, { backgroundColor: c.card, borderColor: c.input, borderRadius: c.radius, opacity: disabled ? 0.5 : 1 }]}>
        <Text numberOfLines={1} style={[styles.boxT, { color: text ? c.foreground : c.mutedForeground }]}>{text || placeholder}</Text>
        <Feather name="chevron-down" size={18} color={c.mutedForeground} />
      </Press>
    </View>
  );

  return (
    <View style={{ gap: 10 }}>
      <Box label={t('Country')} id={`${testID}-country`} text={countryLabel(value?.country, value?.countryName)} placeholder={t('Choose country')} onPress={() => setOpen('country')} />
      {countryOnly ? null : <Box label={t('Region (optional)')} id={`${testID}-region`} text={value?.region} disabled={!value?.country || regions.length === 0}
        placeholder={!value?.country ? t('Choose a country first') : regions.length ? t('Choose region') : t('No regions listed')} onPress={() => setOpen('region')} />}
      <PickerSheet visible={open === 'country'} title={t('Country')} options={countries} value={value?.country} testID={`${testID}-country-sheet`}
        onClose={() => setOpen(null)}
        onPick={(o) => {
          setOpen(null);
          if (o.code !== value?.country) onChange({ country: o.code, countryName: o.name, regionCode: '', region: '' });
          if (!countryOnly && o.code !== value?.country && regionsOf(o.code).length) setTimeout(() => setOpen('region'), 350);
        }} />
      <PickerSheet visible={open === 'region'} title={t('Region in {country}', { country: countryLabel(value?.country, value?.countryName) ?? '' })} options={regions} value={value?.regionCode} testID={`${testID}-region-sheet`}
        onClose={() => setOpen(null)}
        onPick={(o) => { setOpen(null); if (value) onChange({ ...value, regionCode: o.code, region: o.name }); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12 },
  sheetT: { flex: 1, fontFamily: F.b, fontSize: 22, letterSpacing: -0.4 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, gap: 10 },
  optT: { flex: 1, fontSize: 16 },
  box: { minHeight: 52, borderWidth: 1.5, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  boxT: { flex: 1, fontFamily: F.m, fontSize: 16 },
});
