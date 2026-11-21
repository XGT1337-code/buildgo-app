import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { getListMyVehiclesQueryKey, registerVehicle } from '@workspace/api-client-react';
import { BRANDS, EQUIPMENT_TYPES, checkPlate, checkVin, chk, type RentalCategory } from '@workspace/reference';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { Button, Chip, Field, H2, Label, Muted, Notice } from '@/components/ui';
import { CatalogInput, CheckList, PhotoSlot, type CheckRow } from '@/components/Verify';
import { ErrorText } from '@/components/AuthShell';
import { useAppAuth } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { uploadImage } from '@/lib/media';
import { confirm, notify } from '@/lib/device';
import { t, useI18n } from '@/lib/i18n';
import { CATEGORY_LABEL } from '@/lib/demo';

/**
 * Register a machine: type, brand/model from the catalog, VIN (or factory serial), plate and the
 * registration certificate photo. Checked automatically here and on the server, then by an admin.
 */
export default function NewVehicle() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nav = useNavigation();
  const cache = useQueryClient();
  const { lang } = useI18n();
  const { isSignedIn } = useAppAuth();
  const [category, setCategory] = useState<RentalCategory>('earthmoving');
  const [typeId, setTypeId] = useState('backhoe-loader');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [power, setPower] = useState('');
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [doc, setDoc] = useState<string>();
  const [doc2, setDoc2] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Photos and typed details are not dropped by an accidental back.
  const leaving = React.useRef(false);
  const dirty = !!(brand.trim() || vin.trim() || plate.trim() || doc || doc2 || photo);
  React.useEffect(() => nav.addListener('beforeRemove', (e) => {
    if (leaving.current || !dirty) return;
    e.preventDefault();
    confirm(t('Discard this machine?'), t('What you entered will be lost.'), () => { leaving.current = true; nav.dispatch(e.data.action); }, t('Discard'));
  }), [nav, dirty]);

  const type = EQUIPMENT_TYPES.find((x) => x.id === typeId)!;
  const brandModels = BRANDS.find((b) => b.name.toLowerCase() === brand.trim().toLowerCase())?.models;
  const name = (x: { az: string; ru: string; en: string }) => (lang === 'ru' ? x.ru : lang === 'en' ? x.en : x.az);

  // The same checks the server runs, shown while typing.
  const checks = useMemo<CheckRow[]>(() => {
    const out: CheckRow[] = [];
    if (vin.trim().length >= 5) out.push(...checkVin(vin).checks);
    if (plate.trim() || type.plate) if (plate.trim().length >= 3) out.push(...checkPlate(plate).checks);
    const info = vin.trim().length === 17 ? checkVin(vin) : null;
    if (info?.year && /^\d{4}$/.test(year) && Math.abs(info.year - +year) > 1) {
      out.push(chk('year', 'warn', 'The VIN says model year {vin}, but {year} was entered.', { vin: info.year, year }));
    }
    return out;
  }, [vin, plate, year, type.plate]);

  const problem = (): string | null => {
    if (!brand.trim() || !model.trim()) return t('Choose the brand and model.');
    if (year && (!/^\d{4}$/.test(year) || +year < 1950 || +year > new Date().getFullYear() + 1)) return t('Year should look like 2015.');
    if (power && !(+power > 0)) return t('Power in horsepower, like 82.');
    const v = checkVin(vin);
    if (!v.valid) return t(v.checks.find((x) => x.level === 'error')?.message ?? 'Check the VIN.');
    if (type.plate) { const p = checkPlate(plate); if (!p.valid) return t(p.checks[0].message); }
    if (!doc) return t('Add a photo of the registration certificate (texpasport).');
    return null;
  };

  const submit = async () => {
    const p = problem();
    if (p) { setMsg(p); return; }
    setBusy(true); setMsg('');
    try {
      const docIds = [await uploadImage(doc!, { private: true })];
      if (doc2) docIds.push(await uploadImage(doc2, { private: true }));
      const photoId = photo ? await uploadImage(photo, { private: false }) : undefined;
      await registerVehicle({
        typeId, brand: brand.trim(), model: model.trim(), vin, plate: plate.trim() || undefined, docIds, photoId,
        year: year ? +year : undefined, powerHp: power ? Math.round(+power) : undefined,
      });
      await cache.invalidateQueries({ queryKey: getListMyVehiclesQueryKey() });
      notify(t('Sent for verification'), t('The admin compares the VIN and plate with your documents. You will get a notice here.'), 'success');
      leaving.current = true;
      router.back();
    } catch (e) { setMsg(t(apiError(e))); }
    finally { setBusy(false); }
  };

  if (!isSignedIn) return <View style={{ padding: 20 }}><Notice text={t('Sign in to register a machine.')} /></View>;

  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={280}
      contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: insets.bottom + 40 }}>
      <Notice icon="shield" tone="forest" text={t('Every machine is checked: the VIN and plate are validated automatically, then an admin compares them with your registration document. Only verified machines can be rented out.')} />
      <View style={{ gap: 8 }}>
        <Label>{t('Category')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(CATEGORY_LABEL) as RentalCategory[]).map((k) => (
            <Chip key={k} label={CATEGORY_LABEL[k]} active={category === k}
              onPress={() => { setCategory(k); setTypeId(EQUIPMENT_TYPES.find((x) => x.category === k)!.id); }} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Label>{t('Machine type')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EQUIPMENT_TYPES.filter((x) => x.category === category).map((x) => <Chip key={x.id} label={name(x)} active={typeId === x.id} onPress={() => setTypeId(x.id)} />)}
        </View>
      </View>
      <CatalogInput label={t('Brand')} kind="brand" value={brand} onChange={(v) => { setBrand(v); setModel(''); }} placeholder="JCB, KamAZ, Caterpillar…" icon="tag" testID="veh-brand" />
      <CatalogInput label={t('Model')} kind="model" brand={brand} value={model} onChange={setModel} placeholder="3CX" icon="truck" testID="veh-model" options={brandModels} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label={t('Year')} value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2015" maxLength={4} style={{ flex: 1 }} testID="veh-year" />
        <Field label={t('Power, hp')} value={power} onChangeText={setPower} keyboardType="number-pad" placeholder="92" style={{ flex: 1 }} testID="veh-power" />
      </View>
      <H2>{t('Identification')}</H2>
      <Field label={t('VIN or frame number')} value={vin} onChangeText={(v) => setVin(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false}
        placeholder="1RW6155R4KD012345" maxLength={20} testID="veh-vin" />
      <Field label={type.plate ? t('State number plate') : t('State number plate (if any)')} value={plate} onChangeText={(v) => setPlate(v.toUpperCase())}
        autoCapitalize="characters" autoCorrect={false} placeholder="10-AA-123" maxLength={12} testID="veh-plate" />
      <CheckList checks={checks} />
      <H2>{t('Documents and photo')}</H2>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PhotoSlot label={t('Registration (front)')} uri={doc} onChange={setDoc} icon="file-text" testID="veh-doc" />
        <PhotoSlot label={t('Back side (optional)')} uri={doc2} onChange={setDoc2} icon="file-text" />
      </View>
      <PhotoSlot label={t('Photo of the machine (public)')} uri={photo} onChange={setPhoto} icon="camera" />
      <Muted>{t('Documents are visible only to you and the BuildGO admins.')}</Muted>
      <ErrorText>{msg}</ErrorText>
      <Button label={t('Send for verification')} icon="shield" onPress={submit} loading={busy} testID="veh-submit" />
    </KeyboardAwareScrollViewCompat>
  );
}
