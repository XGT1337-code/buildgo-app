import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Button, Chip, Field, Label, Muted, Press } from '@/components/ui';
import { CatalogInput } from '@/components/Verify';
import { GROUNDS, POWER, SITE_STAGES } from '@/lib/demo';
import { notify, pickPhoto } from '@/lib/device';
import { fieldCover, fmtArea } from '@/lib/util';
import { t } from '@/lib/i18n';

function Pick({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {options.map((o) => <Chip key={o} label={t(o)} active={value === o} onPress={() => onChange(o)} />)}
    </ScrollView>
  );
}

/** Add or edit a construction site: name, stage, size, ground, power and notes. Sites are described, not drawn on a map. */
export default function EditField() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, upsertField } = useAppData();
  const existing = id ? state.fields.find((f) => f.id === id) : undefined;
  // Samples and older sites may carry an outline; it is kept as is and sets their area.
  const hasOutline = !!existing && existing.boundary.length >= 3;

  const [name, setName] = useState(existing?.name ?? '');
  const [crop, setCrop] = useState(existing?.crop ?? 'Foundation');
  const [village, setVillage] = useState(existing?.village ?? state.profile.village);
  // Picked from the settlements list: the site gets that place's coordinates (map pin, local weather).
  const [point, setPoint] = useState(existing?.point);
  const [soil, setSoil] = useState(existing?.soil ?? 'Clay');
  const [irr, setIrr] = useState(existing?.irrigation ?? '380 V');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [photo, setPhoto] = useState<string | undefined>(existing?.photo);
  // Typed in square metres, stored in hectares.
  const [m2, setM2] = useState(existing && !hasOutline && existing.areaHa ? String(Math.round(existing.areaHa * 10000)) : '');

  React.useLayoutEffect(() => {
    nav.setOptions({ title: existing ? t('Edit site') : t('New site') });
  }, [nav, existing]);

  const save = () => {
    if (!name.trim()) { notify(t('Name needed'), t('Give the site a short name, like "Masazir house".'), 'error'); return; }
    const area = Number(m2.replace(/\s/g, '').replace(',', '.'));
    if (!hasOutline && m2.trim() && (!Number.isFinite(area) || area <= 0)) { notify(t('Area'), t('Enter the size in square metres, like 600.'), 'error'); return; }
    const fid = upsertField({
      id: existing?.id, name: name.trim(), crop, village: village.trim() || state.profile.village, soil, irrigation: irr,
      privacy: existing?.privacy ?? 'private', notes: notes.trim(), photo, boundary: existing?.boundary ?? [], point,
      areaHa: hasOutline ? existing!.areaHa : Number.isFinite(area) ? Math.round(area) / 10000 : 0,
      // New sites record the owner's selected location; existing fields keep whatever they had (never relocated).
      ...(existing ? {} : { country: state.profile.country, regionCode: state.profile.regionCode || undefined }),
    });
    // Opened from a link there may be nothing to go back to; then land on the site directly.
    if (!router.canGoBack()) { router.replace(`/field/${fid}`); return; }
    router.back();
    if (!existing) setTimeout(() => router.push(`/field/${fid}`), 50);
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={280}
    >
      <Press onPress={async () => { const u = await pickPhoto('library'); if (u) setPhoto(u); }}
        style={[styles.photo, { backgroundColor: c.muted, borderColor: c.border, borderRadius: c.radius + 4 }]} testID="field-photo">
        <Image source={fieldCover({ photo, crop })} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Press>
      <Muted>{t(photo && !photo.startsWith('asset:') ? 'Your site photo' : 'Illustration. Replace it with a photo of your site.')}</Muted>
      <Button label={t('Change photo')} icon="image" variant="secondary" onPress={async () => { const u = await pickPhoto('library'); if (u) setPhoto(u); }} testID="change-field-photo" />
      <Button label={t('Take a photo')} icon="camera" variant="ghost" onPress={async () => { const u = await pickPhoto('camera'); if (u) setPhoto(u); }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={t('Building site')} variant="secondary" onPress={() => setPhoto('asset:site')} testID="field-photo-site" />
        <Button label={t('Excavation')} variant="secondary" onPress={() => setPhoto('asset:site-earth')} testID="field-photo-earth" />
      </View>
      {photo ? <Button label={t('Reset photo')} variant="ghost" onPress={() => setPhoto(undefined)} /> : null}

      <Field label={t('Name')} value={name} onChangeText={setName} placeholder={t('Masazir house')} testID="field-name" />
      {hasOutline
        ? <Muted>{t('Area {n}, from the saved outline.', { n: fmtArea(existing!.areaHa) })}</Muted>
        : <Field label={t('Area, m²')} value={m2} onChangeText={setM2} keyboardType="number-pad" placeholder="600" testID="field-area" />}
      <View style={{ gap: 8 }}><Label>{t('Stage')}</Label><Pick options={SITE_STAGES} value={crop} onChange={setCrop} /></View>
      <CatalogInput label={t('City or village')} kind="place" value={village} placeholder="Masazır" icon="map-pin" testID="field-village"
        onChange={(v, picked) => { setVillage(v); setPoint(picked?.point); }} />
      <View style={{ gap: 8 }}><Label>{t('Ground')}</Label><Pick options={GROUNDS} value={soil} onChange={setSoil} /></View>
      <View style={{ gap: 8 }}><Label>{t('Power on site')}</Label><Pick options={POWER} value={irr} onChange={setIrr} /></View>

      <Field label={t('Notes')} value={notes} onChangeText={setNotes} multiline placeholder={t('Gate from the north road, trucks up to 20 t')} />
      <Button label={existing ? t('Save changes') : t('Add site')} icon="check" onPress={save} testID="save-field" />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  photo: { height: 150, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
