import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  deleteVehicle, getGetMyLicenseQueryKey, getListMyVehiclesQueryKey, submitLicense, useGetMyLicense, useListMyVehicles, type Vehicle,
} from '@workspace/api-client-react';
import { EQUIPMENT_TYPES, LICENSE_CATEGORIES, checkLicense } from '@workspace/reference';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { Button, Card, Chip, F, Field, H2, Label, Muted, Notice } from '@/components/ui';
import { CheckList, PhotoSlot, StatusPill } from '@/components/Verify';
import { ErrorText } from '@/components/AuthShell';
import { useAppAuth } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { uploadImage } from '@/lib/media';
import { confirm, notify } from '@/lib/device';
import { t, useI18n } from '@/lib/i18n';
import { catLabel } from '@/lib/licence';

const ROAD = LICENSE_CATEGORIES.filter((x) => !x.startsWith('TR-') && x !== 'CRANE' && x !== 'LIFT');
/** Self-propelled machinery certificate categories plus the crane and aerial platform operator certificates. */
const MACHINERY = LICENSE_CATEGORIES.filter((x) => x.startsWith('TR-') || x === 'CRANE' || x === 'LIFT');
const MACHINERY_HINT: Record<string, string> = {
  'TR-A': 'Off-road vehicles', 'TR-B': 'Wheeled machines up to 105 hp (loaders, backhoes)', 'TR-C': 'Wheeled machines 105–210 hp',
  'TR-D': 'Wheeled machines over 210 hp', 'TR-E': 'Tracked machines (excavators, bulldozers, pavers)',
  CRANE: 'Truck, crawler and tower cranes', LIFT: 'Aerial platforms and scissor lifts',
};


/** Driving licence and registered machines — the documents an admin verifies. */
export default function Documents() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cache = useQueryClient();
  const { isSignedIn } = useAppAuth();
  const lic = useGetMyLicense({ query: { queryKey: getGetMyLicenseQueryKey(), enabled: !!isSignedIn } });
  const vehicles = useListMyVehicles({ query: { queryKey: getListMyVehiclesQueryKey(), enabled: !!isSignedIn } });
  const current = lic.data?.license ?? null;
  const [editing, setEditing] = useState(false);

  if (!isSignedIn) return <View style={{ padding: 20 }}><Notice text={t('Sign in to add your documents.')} /></View>;

  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={40}
      contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: insets.bottom + 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Feather name="credit-card" size={20} color={c.primary} />
        <H2 style={{ flex: 1 }}>{t('Driving licence')}</H2>
        {current ? <StatusPill status={current.status} /> : null}
      </View>
      {lic.isLoading ? <ActivityIndicator color={c.primary} /> : current && !editing ? (
        <Card style={{ padding: 16, gap: 10 }} testID="license-card">
          <Text style={[styles.big, { color: c.foreground }]}>{current.number}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {current.categories.map((x) => <View key={x} style={[styles.cat, { backgroundColor: c.forest }]}><Text style={[styles.catT, { color: c.accent }]}>{catLabel(x)}</Text></View>)}
          </View>
          <Muted>{t('Valid until {date}', { date: current.expiresOn })}</Muted>
          {current.status === 'rejected' && current.reviewNote ? <Notice icon="x-circle" text={`${t('Admin')}: ${current.reviewNote}`} /> : null}
          {current.status === 'pending' ? <Muted>{t('An admin is checking the photo against the number and categories.')}</Muted> : null}
          {current.status === 'approved' ? <Muted>{t('You can rent machines that need these categories and drive them yourself.')}</Muted> : null}
          <Button label={current.status === 'rejected' ? t('Submit again') : t('Update licence')} variant="ghost" icon="edit-2" onPress={() => setEditing(true)} />
        </Card>
      ) : <LicenseForm onDone={() => { setEditing(false); void cache.invalidateQueries({ queryKey: getGetMyLicenseQueryKey() }); }} />}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <Feather name="truck" size={20} color={c.primary} />
        <H2 style={{ flex: 1 }}>{t('My machines')}</H2>
      </View>
      {vehicles.isLoading ? <ActivityIndicator color={c.primary} /> : (vehicles.data ?? []).length === 0
        ? <Muted>{t('Add an excavator, truck, crane or tool with its VIN or serial number, plate and registration document. Only verified machines can be listed for rent.')}</Muted>
        : (vehicles.data ?? []).map((v) => <VehicleCard key={v.id} v={v} onDelete={() => confirm(t('Remove this machine?'), `${v.brand} ${v.model}`, async () => {
          await deleteVehicle(v.id).catch(() => {}); void cache.invalidateQueries({ queryKey: getListMyVehiclesQueryKey() });
        }, t('Remove'))} />)}
      <Button label={t('Add machine')} icon="plus" variant="accent" onPress={() => router.push('/vehicle/new')} testID="add-vehicle" />
    </KeyboardAwareScrollViewCompat>
  );
}

function VehicleCard({ v, onDelete }: { v: Vehicle; onDelete: () => void }) {
  const c = useColors();
  const { lang } = useI18n();
  const type = EQUIPMENT_TYPES.find((x) => x.id === v.typeId);
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ padding: 14, gap: 8 }} testID={`vehicle-${v.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.b, fontSize: 16, color: c.foreground }}>{v.brand} {v.model}</Text>
          <Muted>{type ? (lang === 'ru' ? type.ru : lang === 'en' ? type.en : type.az) : v.typeId}{v.year ? ` · ${v.year}` : ''}{v.powerHp ? ` · ${v.powerHp} ${t('hp')}` : ''}</Muted>
        </View>
        <StatusPill status={v.status} />
      </View>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <Muted>VIN: <Text style={{ fontFamily: F.s, color: c.foreground }}>{v.vin}</Text></Muted>
        {v.plate ? <Muted>{t('Plate')}: <Text style={{ fontFamily: F.s, color: c.foreground }}>{v.plate}</Text></Muted> : null}
      </View>
      {v.status === 'rejected' && v.reviewNote ? <Notice icon="x-circle" text={`${t('Admin')}: ${v.reviewNote}`} /> : null}
      {open ? <CheckList checks={v.checks} compact /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={open ? t('Hide checks') : t('Show checks')} variant="ghost" onPress={() => setOpen((o) => !o)} style={{ flex: 1, minHeight: 42 }} />
        <Button label={t('Remove')} variant="ghost" icon="trash-2" onPress={onDelete} style={{ minHeight: 42 }} />
      </View>
    </Card>
  );
}

function LicenseForm({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const [number, setNumber] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [expires, setExpires] = useState('');
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const toggle = (x: string) => setCats((s) => (s.includes(x) ? s.filter((y) => y !== x) : [...s, x]));
  const live = useMemo(() => (number || cats.length || expires ? checkLicense(number, cats, expires).checks : []), [number, cats, expires]);

  const submit = async () => {
    const r = checkLicense(number, cats, expires);
    if (!r.valid) { setMsg(t(r.checks.find((x) => x.level === 'error')!.message)); return; }
    if (!front) { setMsg(t('Add a photo of the front side of the licence.')); return; }
    setBusy(true); setMsg('');
    try {
      const frontId = await uploadImage(front, { private: true });
      const backId = back ? await uploadImage(back, { private: true }) : undefined;
      await submitLicense({ number, categories: cats, expiresOn: expires, frontId, backId });
      notify(t('Sent for verification'), t('The admin checks the photo against the number and categories.'), 'success');
      onDone();
    } catch (e) { setMsg(t(apiError(e))); }
    finally { setBusy(false); }
  };

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <Muted>{t('Add your licence and operator certificates so owners can rent you machines without their operator. An admin verifies them against the photo.')}</Muted>
      <Field label={t('Licence number')} value={number} onChangeText={(v) => setNumber(v.toUpperCase())} autoCapitalize="characters" placeholder="AB123456" testID="lic-number" />
      <View style={{ gap: 8 }}>
        <Label>{t('Road categories')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ROAD.map((x) => <Chip key={x} label={x} active={cats.includes(x)} onPress={() => toggle(x)} />)}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Label>{t('Machinery and operator certificates')}</Label>
        {MACHINERY.map((x) => (
          <Chip key={x} label={`${catLabel(x)} · ${t(MACHINERY_HINT[x])}`} active={cats.includes(x)} onPress={() => toggle(x)} />
        ))}
      </View>
      <Field label={t('Valid until (YYYY-MM-DD)')} value={expires} onChangeText={(v) => setExpires(v.replace(/[^\d-]/g, '').slice(0, 10))}
        placeholder="2030-05-01" keyboardType="numbers-and-punctuation" testID="lic-expires" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PhotoSlot label={t('Front side')} uri={front} onChange={setFront} icon="credit-card" testID="lic-front" />
        <PhotoSlot label={t('Back side (optional)')} uri={back} onChange={setBack} icon="credit-card" />
      </View>
      <CheckList checks={live} />
      <ErrorText>{msg}</ErrorText>
      <Button label={t('Send for verification')} icon="shield" onPress={submit} loading={busy} testID="lic-submit" />
      <Muted style={{ fontSize: 12, color: c.mutedForeground }}>{t('Documents are visible only to you and the BuildGO admins.')}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  big: { fontFamily: F.b, fontSize: 22, letterSpacing: 1 },
  cat: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  catT: { fontFamily: F.b, fontSize: 13 },
});
