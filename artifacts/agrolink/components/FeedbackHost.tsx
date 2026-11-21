import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutUp, ZoomIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Button, F, Press, useTopInset } from '@/components/ui';
import { closeDialog, dismissToast, subscribeFeedback, type Dialog, type Toast } from '@/lib/feedback';
import { t } from '@/lib/i18n';

// Reanimated layout animations leave absolutely positioned overlays hidden on web, so animate on native only.
const NATIVE = Platform.OS !== 'web';

/** Renders toasts (top of screen) and the confirm dialog. Mount once at the app root. */
export function FeedbackHost() {
  const c = useColors();
  const top = useTopInset();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => subscribeFeedback((s) => { setToasts(s.toasts); setDialog(s.dialog); }), []);

  const tone = {
    info: { bg: c.forest, icon: 'info' as const, ic: c.accent },
    success: { bg: c.primary, icon: 'check-circle' as const, ic: c.accent },
    error: { bg: c.destructive, icon: 'alert-circle' as const, ic: c.card },
  };

  return (
    <>
      <View pointerEvents="box-none" style={[styles.toastWrap, { top: top + 8 }]}>
        {toasts.map((t) => {
          const k = tone[t.tone];
          return (
            <Animated.View key={t.id} entering={NATIVE ? FadeInUp.duration(220) : undefined} exiting={NATIVE ? FadeOutUp.duration(180) : undefined}>
              <Press onPress={() => dismissToast(t.id)} haptic={false} accessibilityLabel={`${t.title}. ${t.msg ?? ''}`}
                style={[styles.toast, { backgroundColor: k.bg }]} testID="toast">
                <Feather name={k.icon} size={20} color={k.ic} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.toastT, { color: c.primaryForeground }]}>{t.title}</Text>
                  {t.msg ? <Text style={[styles.toastM, { color: c.primaryForeground }]}>{t.msg}</Text> : null}
                </View>
              </Press>
            </Animated.View>
          );
        })}
      </View>

      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={closeDialog} statusBarTranslucent>
        <Pressable style={styles.scrim} onPress={closeDialog} accessibilityLabel={t('Close dialog')}>
          {dialog ? (
            <Animated.View entering={ZoomIn.duration(180)} style={[styles.dialog, { backgroundColor: c.card, borderRadius: c.radius + 8 }]}>
              <Pressable onPress={() => {}} style={{ gap: 10 }}>
                <View style={[styles.dIcon, { backgroundColor: dialog.destructive ? '#F6DCD3' : c.muted }]}>
                  <Feather name={dialog.destructive ? 'alert-triangle' : 'help-circle'} size={22} color={dialog.destructive ? c.destructive : c.primary} />
                </View>
                <Text style={[styles.dTitle, { color: c.foreground }]}>{dialog.title}</Text>
                <Text style={[styles.dMsg, { color: c.mutedForeground }]}>{dialog.msg}</Text>
                <View style={styles.dRow}>
                  <Button label={t('Cancel')} variant="ghost" onPress={closeDialog} style={{ flex: 1, minHeight: 50 }} testID="dialog-cancel" />
                  <Button label={dialog.okLabel} variant={dialog.destructive ? 'danger' : 'primary'} style={{ flex: 1, minHeight: 50 }} testID="dialog-ok"
                    onPress={() => { const ok = dialog.onOk; closeDialog(); ok(); }} />
                </View>
              </Pressable>
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 14, right: 14, gap: 8, zIndex: 1000, alignItems: 'stretch' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, maxWidth: 520, alignSelf: 'center', width: '100%',
    shadowColor: '#16181C', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  toastT: { fontFamily: F.b, fontSize: 15 },
  toastM: { fontFamily: F.m, fontSize: 13, lineHeight: 18, opacity: 0.9 },
  scrim: { flex: 1, backgroundColor: 'rgba(22,24,28,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, padding: 20 },
  dIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dTitle: { fontFamily: F.b, fontSize: 20, letterSpacing: -0.3 },
  dMsg: { fontFamily: F.m, fontSize: 14, lineHeight: 20 },
  dRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
