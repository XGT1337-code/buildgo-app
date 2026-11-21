import React, { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Button, Card, F, Muted, Notice, Segmented } from '@/components/ui';
import { TERMS, TERMS_DISCLAIMER, type TermsKind } from '@/lib/terms';
import { t } from '@/lib/i18n';

const KINDS: TermsKind[] = ['rental', 'equipment', 'materials'];

export default function Conditions() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [kind, setKind] = useState<TermsKind>(KINDS.includes(tab as TermsKind) ? (tab as TermsKind) : 'rental');
  const doc = TERMS[kind];

  const share = async () => {
    const text = [t(doc.title).toUpperCase(), t(doc.lede), '',
      ...doc.sections.flatMap((s) => [t(s.title), ...s.points.map((p) => `- ${t(p)}`), '']), t(TERMS_DISCLAIMER)].join('\n');
    try { await Share.share({ message: text, title: t(doc.title) }); } catch { /* user dismissed or unsupported */ }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} testID="conditions-screen"
      contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: insets.bottom + 40 }}>
      <View style={{ gap: 6 }}>
        <Text style={[styles.kick, { color: c.primary }]}>{t('DEAL CONDITIONS')}</Text>
        <Text style={[styles.h, { color: c.foreground }]}>{t('Agree the boring parts first')}</Text>
        <Muted style={{ fontSize: 14, lineHeight: 20 }}>{t('Templates for the three deals people make most. Read them together before money or machines move.')}</Muted>
      </View>
      <Segmented<TermsKind> value={kind} onChange={setKind} options={[
        { value: 'rental', label: t('Rental'), icon: 'truck' },
        { value: 'equipment', label: t('Gear sale'), icon: 'tool' },
        { value: 'materials', label: t('Materials'), icon: 'package' },
      ]} />
      <Animated.View key={kind} entering={FadeInDown.duration(260)} style={{ gap: 12 }}>
        <View style={[styles.hero, { backgroundColor: c.forest, borderRadius: c.radius + 6 }]}>
          <Text style={[styles.heroT, { color: c.primaryForeground }]} testID={`conditions-title-${kind}`}>{t(doc.title)}</Text>
          <Text style={[styles.heroB, { color: '#C9CDD3' }]}>{t(doc.lede)}</Text>
        </View>
        {doc.sections.map((s, i) => (
          <Card key={s.id} style={{ padding: 16, gap: 10 }} testID={`conditions-${kind}-${s.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.num, { backgroundColor: c.accent }]}><Text style={[styles.numT, { color: c.forest }]}>{i + 1}</Text></View>
              <Text style={[styles.secT, { color: c.foreground }]}>{t(s.title)}</Text>
              <Feather name={s.icon} size={18} color={c.mutedForeground} />
            </View>
            {s.points.map((p, k) => (
              <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.dot, { backgroundColor: c.primary }]} />
                <Text style={[styles.pt, { color: c.foreground }]}>{t(p)}</Text>
              </View>
            ))}
          </Card>
        ))}
      </Animated.View>
      <Notice icon="alert-triangle" text={t(TERMS_DISCLAIMER)} />
      {kind !== 'rental' ? <Muted style={{ textAlign: 'center' }}>{t('BuildGO has no sales marketplace. Use this checklist in your own chats and meetings.')}</Muted> : null}
      <Button label={t('Share this template')} icon="share-2" variant="secondary" onPress={share} testID="conditions-share" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kick: { fontFamily: F.b, fontSize: 12, letterSpacing: 1.4 },
  h: { fontFamily: F.b, fontSize: 26, letterSpacing: -0.6 },
  hero: { padding: 18, gap: 8 },
  heroT: { fontFamily: F.b, fontSize: 22, letterSpacing: -0.4 },
  heroB: { fontFamily: F.m, fontSize: 14, lineHeight: 20 },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numT: { fontFamily: F.b, fontSize: 13 },
  secT: { flex: 1, fontFamily: F.b, fontSize: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  pt: { flex: 1, fontFamily: F.r, fontSize: 14, lineHeight: 21 },
});
