import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { F, Label, Muted } from '@/components/ui';
import { dialCodeOf } from '@/lib/geo';
import { cleanNational, phoneError, phoneDigitLimit } from '@/lib/phone';
import { t } from '@/lib/i18n';

/**
 * Optional contact number. The prefix always comes from the selected country;
 * the value held by the parent is only the national digits, so a country change never keeps an old prefix.
 */
export function PhoneField({ country, value, onChange, testID = 'phone' }: {
  country?: string; value: string; onChange: (national: string) => void; testID?: string;
}) {
  const c = useColors();
  const dial = dialCodeOf(country);
  const err = phoneError(value, dial, country);
  return (
    <View style={{ gap: 6 }}>
      <Label>{t('Contact phone (optional)')}</Label>
      <View style={[styles.row, { backgroundColor: c.card, borderColor: err ? c.destructive : c.input, borderRadius: c.radius }]}>
        <View style={[styles.pre, { backgroundColor: c.muted, borderColor: c.border }]}>
          <Text style={[styles.preT, { color: dial ? c.forest : c.mutedForeground }]} testID={`${testID}-prefix`}>{dial ? `+${dial}` : '+ ?'}</Text>
        </View>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(cleanNational(t, dial).slice(0, phoneDigitLimit(country)))}
          editable={!!dial}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder={dial ? t('Phone number') : t('Choose a country first')}
          placeholderTextColor={c.mutedForeground}
          style={[styles.input, { color: c.foreground }]}
          testID={testID}
        />
      </View>
      {err ? <Text style={{ fontFamily: F.s, fontSize: 13, color: c.destructive }}>{t(err)}</Text>
        : <Muted style={{ fontSize: 12 }}>{t('So clients and renters can reach you. Not used for signing in.')}</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, minHeight: 52, overflow: 'hidden' },
  pre: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 12, borderRightWidth: 1 },
  preT: { fontFamily: F.b, fontSize: 16 },
  input: { flex: 1, paddingHorizontal: 12, fontFamily: F.m, fontSize: 16, minHeight: 50 },
});
