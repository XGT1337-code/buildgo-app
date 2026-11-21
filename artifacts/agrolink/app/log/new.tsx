import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Button, Chip, Field, IconButton, Label, Muted } from '@/components/ui';
import { LOG_ICON, LOG_LABEL } from '@/lib/demo';
import { pickPhoto } from '@/lib/device';
import { addDays, fmtDay, isoDay } from '@/lib/util';
import type { LogType } from '@/lib/types';
import { t } from '@/lib/i18n';

const TYPES: LogType[] = ['delivery', 'earthworks', 'concrete', 'machine', 'inspection', 'note'];

export default function NewLog() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { fieldId } = useLocalSearchParams<{ fieldId: string }>();
  const { state, addLog } = useAppData();
  const field = state.fields.find((f) => f.id === fieldId);
  const [type, setType] = useState<LogType>('delivery');
  const [offset, setOffset] = useState(0);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const days = Array.from({ length: 10 }, (_, i) => -i);

  const save = () => {
    if (!fieldId) return;
    addLog({ fieldId, type, date: isoDay(addDays(new Date(), offset)), note: note.trim(), photo });
    router.back();
  };

  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={40}
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: insets.bottom + 40 }}>
      <Muted>{field?.name ?? t('Site')}</Muted>
      <View style={{ gap: 8 }}>
        <Label>{t('What happened')}</Label>
        <View style={styles.wrap}>
          {TYPES.map((lt) => <Chip key={lt} label={LOG_LABEL[lt]} icon={LOG_ICON[lt] as 'feather'} active={type === lt} onPress={() => setType(lt)} />)}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Label>{t('When')}</Label>
        <View style={styles.wrap}>
          {days.map((d) => <Chip key={d} label={d === 0 ? t('Today') : d === -1 ? t('Yesterday') : fmtDay(isoDay(addDays(new Date(), d)))} active={offset === d} onPress={() => setOffset(d)} />)}
        </View>
      </View>
      <Field label={t('Note')} value={note} onChangeText={setNote} multiline placeholder={t('M300 concrete, 12 m³, pump from 9:00')} testID="log-note" />
      <View style={{ gap: 8 }}>
        <Label>{t('Photo')}</Label>
        {photo ? (
          <View>
            <Image source={{ uri: photo }} style={{ height: 200, borderRadius: c.radius }} contentFit="cover" />
            <View style={{ position: 'absolute', top: 8, right: 8 }}><IconButton icon="x" onPress={() => setPhoto(undefined)} size={40} /></View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('Camera')} icon="camera" variant="secondary" style={{ flex: 1 }} onPress={async () => { const u = await pickPhoto('camera'); if (u) setPhoto(u); }} />
            <Button label={t('Gallery')} icon="image" variant="secondary" style={{ flex: 1 }} onPress={async () => { const u = await pickPhoto('library'); if (u) setPhoto(u); }} />
          </View>
        )}
      </View>
      <Button label={t('Save entry')} icon="check" onPress={save} testID="save-log" />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
