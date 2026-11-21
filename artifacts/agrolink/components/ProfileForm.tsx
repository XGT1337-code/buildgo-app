import React, { useState } from 'react';
import { View } from 'react-native';
import { useAppData } from '@/context/AppData';
import { Button, Chip, Field, Label } from '@/components/ui';
import { isPlaceholderName, ROLE_LABEL, WORK_TYPES } from '@/lib/demo';
import { LocationPicker } from '@/components/LocationPicker';
import { PhoneField } from '@/components/PhoneField';
import { dialCodeOf, profileLocation, withLocation } from '@/lib/geo';
import { nationalFrom, phoneError, toInternational } from '@/lib/phone';
import type { Role, SavedLocation } from '@/lib/types';
import { t } from '@/lib/i18n';

export function ProfileForm({ onDone, cta }: { onDone: () => void; cta: string }) {
  const { state, saveProfile } = useAppData();
  const p = state.profile;
  const [name, setName] = useState(isPlaceholderName(p.name) ? '' : p.name);
  const [role, setRole] = useState<Role>(p.role);
  const [village, setVillage] = useState(p.village);
  const [loc, setLoc] = useState<SavedLocation | null>(profileLocation(p));
  const [national, setNational] = useState(() => nationalFrom(p.phone, dialCodeOf(p.country)));
  const [crops, setCrops] = useState<string[]>(p.crops);
  const [bio, setBio] = useState(p.bio);
  const toggle = (x: string) => setCrops((cs) => (cs.includes(x) ? cs.filter((y) => y !== x) : [...cs, x]));
  const dial = dialCodeOf(loc?.country);
  const phoneBad = !!phoneError(national, dial, loc?.country);

  const changeLoc = (next: SavedLocation | null) => {
    // A new country or region makes the old village meaningless; the phone keeps its digits but takes the new prefix.
    if (next?.country !== loc?.country || (loc?.regionCode && next?.regionCode !== loc.regionCode)) setVillage('');
    setLoc(next);
  };

  return (
    <View style={{ gap: 18 }}>
      <Field label={t('Full name')} value={name} onChangeText={setName} placeholder={t('Your name')} testID="profile-name" />
      <View style={{ gap: 8 }}>
        <Label>{t('Role')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <Chip key={r} label={ROLE_LABEL[r]} active={role === r} onPress={() => setRole(r)} />)}
        </View>
      </View>
      <LocationPicker value={loc} onChange={changeLoc} testID="profile-loc" />
      <Field label={t('City or village')} value={village} onChangeText={setVillage} placeholder={t('Optional')} testID="profile-village" />
      <PhoneField country={loc?.country} value={national} onChange={setNational} testID="profile-phone" />
      <View style={{ gap: 8 }}>
        <Label>{t('Kinds of work you do')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WORK_TYPES.map((x) => <Chip key={x} label={t(x)} active={crops.includes(x)} onPress={() => toggle(x)} />)}
        </View>
      </View>
      <Field label={t('About')} value={bio} onChangeText={setBio} multiline placeholder={t('Private houses and warehouses since 2008')} />
      <Button label={cta} icon="check" testID="save-profile" disabled={phoneBad} onPress={() => {
        const base = { ...p, name: name.trim() || 'Builder', role, village: village.trim(), crops, bio: bio.trim(), phone: toInternational(national, dial, loc?.country) };
        saveProfile(loc ? withLocation(base, loc, true) : base);
        onDone();
      }} />
    </View>
  );
}
