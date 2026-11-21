import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { Body, Button, Card, F, Field, Muted, Press, Stars, Tag } from '@/components/ui';
import { confirm, notify } from '@/lib/device';
import { fmtDay } from '@/lib/util';
import { fmtRange, nextStep, quote, stageIndex, STAGES, statusLabel, type Party } from '@/lib/rental';
import type { Booking, BookingStatus, Listing } from '@/lib/types';
import { fmtDateLong, monthShort, t, tp, weekdayShort } from '@/lib/i18n';

export function statusTone(c: ReturnType<typeof useColors>): Record<BookingStatus, [string, string]> {
  return {
    pending: [c.wheat, c.forest],
    accepted: [c.primary, c.card],
    active: [c.sky, c.card],
    returned: [c.clay, c.card],
    completed: [c.forest, c.accent],
    declined: [c.destructive, c.card],
    cancelled: [c.muted, c.mutedForeground],
  };
}

export function StatusTag({ status }: { status: BookingStatus }) {
  const c = useColors();
  const [bg, fg] = statusTone(c)[status];
  return <Tag label={statusLabel(status)} color={bg} fg={fg} />;
}

/** Five-step progress: Request → Confirmed → Handed over → Returned → Completed. */
export function Timeline({ status }: { status: BookingStatus }) {
  const c = useColors();
  if (status === 'declined' || status === 'cancelled') {
    return (
      <View style={[styles.ended, { backgroundColor: status === 'declined' ? '#F6DCD3' : c.muted }]}>
        <Feather name={status === 'declined' ? 'x-circle' : 'slash'} size={16} color={status === 'declined' ? c.destructive : c.mutedForeground} />
        <Text style={[styles.endedT, { color: status === 'declined' ? c.destructive : c.mutedForeground }]}>
          {status === 'declined' ? t('The owner declined this request') : t('This request was cancelled')}
        </Text>
      </View>
    );
  }
  const cur = stageIndex(status);
  return (
    <View style={styles.tl} accessibilityLabel={t('Step {n} of {total}: {status}', { n: cur + 1, total: STAGES.length, status: statusLabel(status) })}>
      {STAGES.map((st, i) => {
        const done = i < cur || status === 'completed';
        const now = i === cur && status !== 'completed';
        return (
          <React.Fragment key={st.status}>
            <View style={styles.tlStep}>
              {/* Connectors: left half links to the previous step, right half to the next. */}
              {i > 0 ? <View style={[styles.tlLine, { left: 0, right: '50%', backgroundColor: i <= cur ? c.primary : c.border }]} /> : null}
              {i < STAGES.length - 1 ? <View style={[styles.tlLine, { left: '50%', right: 0, backgroundColor: i < cur ? c.primary : c.border }]} /> : null}
              <View style={[styles.tlDot, {
                backgroundColor: done ? c.primary : now ? c.accent : c.card,
                borderColor: done ? c.primary : now ? c.forest : c.border,
              }]}>
                <Feather name={done ? 'check' : st.icon} size={13} color={done ? c.card : now ? c.forest : c.mutedForeground} />
              </View>
              <Text style={[styles.tlT, { color: now ? c.foreground : c.mutedForeground, fontFamily: now ? F.b : F.m }]} numberOfLines={1}>{t(st.label)}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Horizontal day picker. Tap a start day, then an end day; tap again to restart. */
export function DateStrip({ days, start, end, onChange, busy, testID }: {
  days: string[]; start: string | null; end: string | null; onChange: (start: string | null, end: string | null) => void;
  busy?: (d: string) => boolean; testID?: string;
}) {
  const c = useColors();
  const tap = (d: string) => {
    if (!start || end || d < start) { onChange(d, null); return; }
    if (d === start) { onChange(d, d); return; }
    onChange(start, d);
  };
  let lastMonth = '';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} testID={testID}>
      {days.map((d) => {
        const inRange = !!start && d >= start && d <= (end ?? start);
        const isBusy = busy?.(d) ?? false;
        const dt = new Date(d + 'T12:00:00');
        const month = monthShort(dt);
        const showMonth = month !== lastMonth;
        lastMonth = month;
        return (
          <View key={d} style={{ gap: 4 }}>
            <Text style={[styles.month, { color: showMonth ? c.mutedForeground : 'transparent' }]}>{month.toUpperCase()}</Text>
            <Press onPress={() => (isBusy ? notify(t('Not available'), t('{date} is already booked.', { date: fmtDay(d) }), 'error') : tap(d))} selected={inRange}
              accessibilityLabel={`${fmtDateLong(dt)}${isBusy ? t(', booked') : ''}`}
              style={[styles.day, { backgroundColor: inRange ? c.forest : isBusy ? c.muted : c.card, borderColor: inRange ? c.forest : c.border, opacity: isBusy ? 0.5 : 1 }]}>
              <Text style={[styles.dayW, { color: inRange ? c.accent : c.mutedForeground }]}>{weekdayShort(dt)}</Text>
              <Text style={[styles.dayN, { color: inRange ? c.primaryForeground : c.foreground, textDecorationLine: isBusy ? 'line-through' : 'none' }]}>{dt.getDate()}</Text>
            </Press>
          </View>
        );
      })}
    </ScrollView>
  );
}


/**
 * One booking with its timeline and the action for the current step.
 * When the step belongs to the other side (a demo person), it is offered as a clearly labeled simulation.
 */
export function BookingCard({ booking: b, listing, party }: { booking: Booking; listing: Listing; party: Party }) {
  const c = useColors();
  const router = useRouter();
  const { setBookingStatus, updateBooking } = useAppData();
  const [checking, setChecking] = useState(false);
  const [issue, setIssue] = useState(false);
  const [issueNote, setIssueNote] = useState('');
  const step = nextStep(b);
  const q = quote(listing, b.start, b.end);
  const mineToDo = step?.by === party;
  const other = party === 'owner' ? 'renter' : 'owner';

  const go = (to: BookingStatus, patch?: Partial<Booking>) => {
    setBookingStatus(b.id, to, patch);
    const msg: Partial<Record<BookingStatus, [string, string]>> = {
      accepted: [t('Booking confirmed'), `${listing.title}, ${fmtRange(b.start, b.end)}.`],
      declined: [t('Request declined'), party === 'renter' ? t('Find similar equipment for the same dates.') : t('{name} has been told.', { name: b.requester })],
      active: [t('Rental active'), t('Handed over. Return by {date}.', { date: fmtDay(b.end) })],
      returned: [t('Marked as returned'), t('The owner now checks the condition.')],
      completed: [t('Rental completed'), party === 'renter' ? t('Leave a review for the owner.') : t('Rate the renter to help other owners.')],
      cancelled: [t('Request cancelled'), t('The dates are free again.')],
    };
    const m = msg[to];
    if (m) notify(m[0], m[1], to === 'declined' || to === 'cancelled' ? 'info' : 'success');
  };

  const doStep = () => {
    if (!step) return;
    if (step.to === 'completed') {
      // The owner inspects the machine; a simulated (demo) owner reports it as fine.
      if (mineToDo) setChecking(true);
      else go('completed', { condition: 'good' });
      return;
    }
    go(step.to);
  };

  return (
    <Card style={{ padding: 14, gap: 12 }} testID={`booking-${b.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.head, { color: c.foreground }]} numberOfLines={1}>
            {party === 'owner' ? b.requester : fmtRange(b.start, b.end)}
          </Text>
          <Muted>{party === 'owner' ? fmtRange(b.start, b.end) + ' · ' : ''}{tp(q.days, '{n} day', '{n} days')} · {q.rent} AZN{q.deposit ? t(' + {n} deposit', { n: q.deposit }) : ''}</Muted>
        </View>
        <StatusTag status={b.status} />
      </View>

      <Timeline status={b.status} />

      {b.note ? <Body style={{ fontSize: 14 }}>“{b.note}”</Body> : null}
      {b.termsSnapshot
        ? <Muted style={{ fontSize: 12 }}>{t('Conditions acknowledged {date}', { date: fmtDay(b.termsSnapshot.acceptedAt.slice(0, 10)) })} · {b.termsSnapshot.source === 'owner' ? t('owner terms') : t('default template')}</Muted>
        : party === 'owner' ? <Muted style={{ fontSize: 12 }}>{t('No conditions acknowledgement on record (demo request).')}</Muted> : null}
      {b.status === 'completed' && b.condition ? (
        <View style={[styles.cond, { backgroundColor: b.condition === 'good' ? c.successBg : '#F6DCD3' }]}>
          <Feather name={b.condition === 'good' ? 'check-circle' : 'alert-triangle'} size={16} color={b.condition === 'good' ? c.success : c.destructive} />
          <Text style={[styles.condT, { color: c.foreground }]}>
            {b.condition === 'good' ? t('Returned in good condition') : `${t('Issue reported')}${b.conditionNote ? `: ${b.conditionNote}` : ''}`}
          </Text>
        </View>
      ) : null}

      {/* Condition check form (owner, after return). */}
      {checking ? (
        <View style={{ gap: 10 }}>
          <Muted>{t('How did the machine come back?')}</Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('Good')} icon="thumbs-up" variant={!issue ? 'primary' : 'ghost'} style={{ flex: 1 }} onPress={() => setIssue(false)} />
            <Button label={t('Issue')} icon="alert-triangle" variant={issue ? 'danger' : 'ghost'} style={{ flex: 1 }} onPress={() => setIssue(true)} />
          </View>
          {issue ? <Field value={issueNote} onChangeText={setIssueNote} placeholder={t('What is wrong? e.g. cracked mirror')} multiline /> : null}
          <Button label={t('Confirm and complete')} icon="check" testID={`complete-${b.id}`}
            onPress={() => { setChecking(false); go('completed', { condition: issue ? 'issue' : 'good', conditionNote: issue ? issueNote.trim() : undefined }); }} />
        </View>
      ) : step ? (
        <View style={{ gap: 8 }}>
          <Muted style={{ fontSize: 12 }}>{step.hint}</Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {party === 'owner' && b.status === 'pending' ? (
              <Button label={t('Decline')} variant="ghost" style={{ flex: 1 }} testID={`decline-${b.id}`}
                onPress={() => confirm(t('Decline request?'), t('{name} will be told the machine is not available for these dates.', { name: b.requester }), () => go('declined'), t('Decline'))} />
            ) : null}
            {party === 'renter' && (b.status === 'pending' || b.status === 'accepted') ? (
              <Button label={t('Cancel')} variant="ghost" style={{ flex: 1 }} testID={`cancel-${b.id}`}
                onPress={() => confirm(t('Cancel request?'), t('The dates will be freed for others.'), () => go('cancelled'), t('Cancel request'))} />
            ) : null}
            <Button label={mineToDo ? step.label : `${other === 'owner' ? t('Demo owner') : t('Demo renter')}: ${step.label.toLowerCase()}`} icon={step.icon}
              variant={mineToDo ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={doStep} testID={`step-${b.id}`} />
          </View>
          {!mineToDo ? <Muted style={{ fontSize: 11 }}>{other === 'owner' ? t('Demo: the owner is not a real person, so you can play their step.') : t('Demo: the renter is not a real person, so you can play their step.')}</Muted> : null}
          {party === 'renter' && b.status === 'pending' && !mineToDo ? (
            <Press onPress={() => go('declined')} testID={`sim-decline-${b.id}`}>
              <Text style={[styles.link, { color: c.destructive }]}>{t('Simulate owner declining')}</Text>
            </Press>
          ) : null}
        </View>
      ) : null}

      {/* Decline → notification and a new search for the same kind of machine and dates. */}
      {party === 'renter' && b.status === 'declined' ? (
        <Button label={t('Find similar equipment')} icon="search" variant="accent" testID={`find-similar-${b.id}`}
          onPress={() => { updateBooking(b.id, { dismissed: true }); router.push({ pathname: '/rent', params: { cat: listing.category, start: b.start, end: b.end } }); }} />
      ) : null}

      {party === 'owner' && b.status === 'completed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Muted style={{ flex: 1 }}>{b.renterRating ? t('Your rating of the renter') : t('Rate the renter')}</Muted>
          <Stars value={b.renterRating ?? 0} size={24} onChange={(n) => { updateBooking(b.id, { renterRating: n }); notify(t('Thanks'), t('You rated {name} {n}/5.', { name: b.requester, n }), 'success'); }} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { fontFamily: F.b, fontSize: 15 },
  tl: { flexDirection: 'row', alignItems: 'flex-start' },
  tlStep: { flex: 1, alignItems: 'center', gap: 4 },
  tlDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tlLine: { position: 'absolute', top: 13, height: 2 },
  tlT: { fontSize: 10.5 },
  ended: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12 },
  endedT: { flex: 1, fontFamily: F.s, fontSize: 13 },
  cond: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12 },
  condT: { flex: 1, fontFamily: F.s, fontSize: 13 },
  link: { fontFamily: F.s, fontSize: 13, paddingVertical: 2 },
  month: { fontFamily: F.b, fontSize: 10, letterSpacing: 0.8, paddingLeft: 2 },
  day: { width: 54, height: 66, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayW: { fontFamily: F.s, fontSize: 11 },
  dayN: { fontFamily: F.b, fontSize: 20 },
});
