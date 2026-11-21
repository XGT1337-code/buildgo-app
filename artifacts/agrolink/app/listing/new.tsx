import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Button, Card, Chip, F, Field, H2, Label, Muted, Notice, Press, Segmented } from '@/components/ui';
import { DateStrip } from '@/components/Rental';
import { CATEGORY_LABEL } from '@/lib/demo';
import { confirm, notify, pickPhoto } from '@/lib/device';
import { fmtRange, upcomingDays } from '@/lib/rental';
import type { Category, RentalTerms } from '@/lib/types';
import { CANCEL_OPTS, DEFAULT_RENTAL_TERMS, DELIVERY_OPTS, FUEL_OPTS, OPERATOR_OPTS, PAYMENT_OPTS } from '@/lib/terms';
import { t, useI18n } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { createListing, getListListingsQueryKey, getListMyVehiclesQueryKey, useListMyVehicles } from '@workspace/api-client-react';
import { EQUIPMENT_TYPES } from '@workspace/reference';
import { CatalogInput, StatusPill } from '@/components/Verify';
import { useAppAuth } from '@/lib/auth';
import { apiError } from '@/lib/api';
import { mediaUrl, uploadImage } from '@/lib/media';
import { SERVER_PREFIX } from '@/lib/listings';

const STEPS = ['Listing', 'Specs, price & dates', 'Conditions & publish'];

function Opts({ label, opts, value, onPick, id }: { label: string; opts: string[]; value: string; onPick: (v: string) => void; id: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((o, i) => <View key={o} testID={`${id}-${i}`}><Chip label={t(o)} active={value === o} onPress={() => onPick(o)} /></View>)}
      </View>
    </View>
  );
}

const num = (s: string) => Number(s.replace(',', '.'));

export default function NewListing() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nav = useNavigation();
  const { state } = useAppData();
  const { isSignedIn } = useAppAuth();
  const { lang } = useI18n();
  const cache = useQueryClient();
  const vehicles = useListMyVehicles({ query: { queryKey: getListMyVehiclesQueryKey(), enabled: !!isSignedIn } });
  const [typeId, setTypeId] = useState('backhoe-loader');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('earthmoving');
  const [village, setVillage] = useState(state.profile.village);
  const [photo, setPhoto] = useState<string | undefined>();
  const [year, setYear] = useState('');
  const [power, setPower] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [anyDates, setAnyDates] = useState<'any' | 'window'>('any');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [terms, setTerms] = useState<RentalTerms>(DEFAULT_RENTAL_TERMS);
  const setT = (k: keyof RentalTerms) => (v: string) => setTerms((t) => ({ ...t, [k]: v }));
  const days = React.useMemo(() => upcomingDays(90), []);

  React.useLayoutEffect(() => { nav.setOptions({ title: `${t('Rent out')} · ${step + 1}/3` }); }, [nav, step]);

  // Back (header arrow or Android button) steps back through the form, and never silently drops a draft.
  const leaving = React.useRef(false);
  const dirty = !!(title.trim() || photo || vehicleId || price.trim() || description.trim());
  React.useEffect(() => nav.addListener('beforeRemove', (e) => {
    if (leaving.current) return;
    if (step > 0) { e.preventDefault(); setStep((s) => s - 1); return; }
    if (!dirty) return;
    e.preventDefault();
    confirm(t('Discard this listing?'), t('What you entered will be lost.'), () => { leaving.current = true; nav.dispatch(e.data.action); }, t('Discard'));
  }), [nav, step, dirty]);

  /** Returns an error for the current step, or null when it's complete. */
  const type = EQUIPMENT_TYPES.find((x) => x.id === typeId);
  // Self-propelled and registered machines are listed only together with their verified record.
  const needsVehicle = !!type && (type.plate || type.selfPropelled);
  const myVehicles = (vehicles.data ?? []).filter((v) => v.status !== 'rejected' && EQUIPMENT_TYPES.find((x) => x.id === v.typeId)?.category === category);
  const vehiclePhoto = (vehicles.data ?? []).find((v) => v.id === vehicleId)?.photoId ?? undefined;
  const tname = (x: { az: string; ru: string; en: string }) => (lang === 'ru' ? x.ru : lang === 'en' ? x.en : x.az);

  const problem = (k: number): string | null => {
    if (k === 0 && !title.trim()) return t('Say what you are renting out, like "JCB 3CX with operator".');
    if (k === 0 && needsVehicle && !vehicleId) return t('Choose the machine from your verified machines, or add it first.');
    if (k === 0 && village.trim().length < 2) return t('Enter the city, village or district.');
    if (k === 1) {
      const p = num(price);
      if (!Number.isFinite(p) || p <= 0) return t('Enter a daily price in AZN.');
      if (deposit.trim() && (!Number.isFinite(num(deposit)) || num(deposit) < 0)) return t('Enter a deposit in AZN, or leave it empty for none.');
      if (year.trim() && (!/^\d{4}$/.test(year.trim()) || +year > new Date().getFullYear() || +year < 1950)) return t('Year should look like 2015.');
      if (power.trim() && (!Number.isFinite(num(power)) || num(power) <= 0)) return t('Power in horsepower, like 82.');
      if (anyDates === 'window' && !from) return t('Pick the first and last day it is available, or choose Any dates.');
    }
    return null;
  };

  const next = () => {
    const p = problem(step);
    if (p) { notify(t('Almost there'), p, 'error'); return; }
    setStep((s) => s + 1);
  };

  const publish = async () => {
    for (const k of [0, 1]) { const p = problem(k); if (p) { setStep(k); notify(t('Almost there'), p, 'error'); return; } }
    if (busy) return;
    setBusy(true);
    try {
      const photoId = photo ? await uploadImage(photo, { private: false }) : undefined;
      const window = anyDates === 'window' && from ? { availableFrom: from, availableTo: to ?? from } : {};
      const created = await createListing({
        title: title.trim(), category, typeId, vehicleId: vehicleId ?? undefined, pricePerDay: Math.round(num(price) * 100) / 100,
        village: village.trim(), description: description.trim(), photoId,
        terms: { ...terms, deposit: deposit.trim() ? Math.round(num(deposit) * 100) / 100 : 0, extra: terms.extra.trim() },
        year: year.trim() ? +year : undefined, powerHp: power.trim() ? Math.round(num(power)) : undefined, ...window,
      });
      await cache.invalidateQueries({ queryKey: getListListingsQueryKey() });
      notify(t('Sent for review'), t('An admin checks the listing and the machine. It becomes visible to everyone after approval.'), 'success');
      leaving.current = true;
      router.back();
      setTimeout(() => router.push(`/listing/${SERVER_PREFIX}${created.id}`), 50);
    } catch (e) { notify(t('Not published'), t(apiError(e)), 'error'); }
    finally { setBusy(false); }
  };

  if (!isSignedIn) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 14, backgroundColor: c.background }}>
        <Notice icon="lock" text={t('Sign in to rent out equipment. Every listing is checked by an admin before it is published.')} />
        <Button label={t('Sign in')} icon="log-in" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={280}
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: insets.bottom + 40 }}>
      {/* Progress */}
      <View style={styles.progress} accessibilityLabel={t('Step {n} of {total}: {status}', { n: step + 1, total: 3, status: t(STEPS[step]) })}>
        {STEPS.map((label, i) => (
          <Press key={label} onPress={() => { if (i < step) setStep(i); }} style={{ flex: 1, gap: 6 }} haptic={i < step}>
            <View style={[styles.bar, { backgroundColor: i <= step ? c.primary : c.border }]} />
            <Text style={[styles.barT, { color: i === step ? c.foreground : c.mutedForeground, fontFamily: i === step ? F.b : F.m }]} numberOfLines={1}>{t(label)}</Text>
          </Press>
        ))}
      </View>

      {step === 0 ? (
        <>
          <Press onPress={async () => { const u = await pickPhoto('library'); if (u) setPhoto(u); }}
            style={[styles.photo, { backgroundColor: c.muted, borderColor: c.border, borderRadius: c.radius + 4 }]} testID="listing-photo">
            {/* Without its own photo, the listing shows the chosen machine's photo. */}
            {photo || vehiclePhoto ? <Image source={{ uri: photo ?? mediaUrl(vehiclePhoto!) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
              <View style={{ alignItems: 'center', gap: 6 }}><Feather name="camera" size={26} color={c.primary} /><Muted>{t('Equipment photo')}</Muted></View>
            )}
          </Press>
          <Field label={t('Title')} value={title} onChangeText={setTitle} placeholder={t('JCB 3CX with operator')} testID="listing-title" />
          <View style={{ gap: 8 }}>
            <Label>{t('Category')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => <Chip key={k} label={CATEGORY_LABEL[k]} active={category === k}
                onPress={() => { setCategory(k); setTypeId(EQUIPMENT_TYPES.find((x) => x.category === k)!.id); setVehicleId(null); }} />)}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t('Machine type')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EQUIPMENT_TYPES.filter((x) => x.category === category).map((x) => (
                <Chip key={x.id} label={tname(x)} active={typeId === x.id} onPress={() => { setTypeId(x.id); setVehicleId(null); }} />
              ))}
            </View>
          </View>
          {needsVehicle ? (
            <Card style={{ padding: 14, gap: 10 }} testID="listing-vehicle">
              <Label>{t('Verified machine')}</Label>
              <Muted>{t('This machine has a plate or drives itself, so it must be registered with its VIN, plate and documents.')}</Muted>
              {myVehicles.map((v) => (
                <Press key={v.id} onPress={() => { setVehicleId(v.id); if (!year && v.year) setYear(String(v.year)); if (!power && v.powerHp) setPower(String(v.powerHp)); }}
                  style={[styles.veh, { borderColor: vehicleId === v.id ? c.primary : c.border, backgroundColor: vehicleId === v.id ? c.successBg : c.card }]}>
                  <Feather name={vehicleId === v.id ? 'check-circle' : 'circle'} size={18} color={vehicleId === v.id ? c.primary : c.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.b, fontSize: 15, color: c.foreground }}>{v.brand} {v.model}</Text>
                    <Muted>{v.plate ?? v.vin}</Muted>
                  </View>
                  <StatusPill status={v.status} />
                </Press>
              ))}
              <Button label={t('Add machine')} icon="plus" variant="ghost" onPress={() => router.push('/vehicle/new')} testID="listing-add-vehicle" />
            </Card>
          ) : null}
          <CatalogInput label={t('City, district or village')} kind="place" value={village} onChange={(v) => setVillage(v)} placeholder="Bakı" icon="map-pin" testID="listing-village" />
        </>
      ) : step === 1 ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label={t('Year')} value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2015" style={{ flex: 1 }} maxLength={4} testID="listing-year" />
            <Field label={t('Power, hp')} value={power} onChangeText={setPower} keyboardType="decimal-pad" placeholder="92" style={{ flex: 1 }} testID="listing-power" />
          </View>
          <Field label={t('Details')} value={description} onChangeText={setDescription} multiline placeholder={t('Bucket and breaker included, operator on request')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label={t('Price per day, AZN')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="60" style={{ flex: 1 }} testID="listing-price" />
            <Field label={t('Deposit, AZN')} value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" placeholder="0" style={{ flex: 1 }} testID="terms-deposit" />
          </View>
          <View style={{ gap: 10 }}>
            <Label>{t('Available dates')}</Label>
            <Segmented value={anyDates} onChange={setAnyDates} options={[
              { value: 'any', label: t('Any dates'), icon: 'calendar' }, { value: 'window', label: t('Set a window'), icon: 'clock' },
            ]} />
            {anyDates === 'window' ? (
              <>
                <Muted>{from ? `${fmtRange(from, to ?? from)}. ${t('Tap to change.')}` : t('Tap the first day, then the last day it is available.')}</Muted>
                <DateStrip days={days} start={from} end={to} onChange={(a, b) => { setFrom(a); setTo(b); }} testID="listing-window" />
              </>
            ) : <Muted>{t('Renters can request any future dates.')}</Muted>}
          </View>
        </>
      ) : (
        <>
          <Muted>{t('Renters see these and must acknowledge them before requesting. Template wording, not a legal contract.')}</Muted>
          <Opts id="terms-payment" label={t('Payment')} opts={PAYMENT_OPTS} value={terms.payment} onPick={setT('payment')} />
          <Opts id="terms-delivery" label={t('Delivery')} opts={DELIVERY_OPTS} value={terms.delivery} onPick={setT('delivery')} />
          <Opts id="terms-fuel" label={t('Fuel')} opts={FUEL_OPTS} value={terms.fuel} onPick={setT('fuel')} />
          <Opts id="terms-operator" label={t('Operator')} opts={OPERATOR_OPTS} value={terms.operator} onPick={setT('operator')} />
          <Opts id="terms-cancel" label={t('Cancellation')} opts={CANCEL_OPTS} value={terms.cancellation} onPick={setT('cancellation')} />
          <Field label={t('Other conditions')} value={terms.extra} onChangeText={setT('extra')} multiline placeholder={t('Return it clean. Max 10 h a day.')} testID="terms-extra" />

          <Card style={{ padding: 16, gap: 8 }} testID="listing-preview">
            <Label>{t('Preview')}</Label>
            <H2>{title.trim() || t('Untitled')}</H2>
            <Muted>
              {CATEGORY_LABEL[category]} · {village.trim() || t('No district')}{year ? ` · ${year}` : ''}{power ? ` · ${power} ${t('hp')}` : ''}
            </Muted>
            <Text style={{ fontFamily: F.b, fontSize: 18, color: c.primary }}>{price || '—'} AZN / {t('day')}{deposit ? ` · ${t('{n} AZN deposit', { n: deposit })}` : ''}</Text>
            <Muted>{anyDates === 'window' && from ? t('Available {range}', { range: fmtRange(from, to ?? from) }) : t('Available any dates')}</Muted>
          </Card>
          <Notice icon="shield" text={t('After you publish, an admin checks the listing (and the machine documents). It appears for everyone once approved.')} />
        </>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {step > 0 ? <Button label={t('Back')} icon="arrow-left" variant="ghost" style={{ flex: 1 }} onPress={() => setStep((s) => s - 1)} /> : null}
        {step < 2
          ? <Button label={t('Next')} icon="arrow-right" style={{ flex: 2 }} onPress={next} testID="listing-next" />
          : <Button label={t('Send for review')} icon="check" variant="accent" style={{ flex: 2 }} onPress={publish} loading={busy} testID="save-listing" />}
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 8 },
  bar: { height: 5, borderRadius: 3 },
  barT: { fontSize: 11 },
  veh: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  photo: { height: 160, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
