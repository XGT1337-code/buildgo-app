import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import {
  Avatar, Body, Button, Card, DemoBadge, Empty, F, Field, H2, IconButton, Muted, Notice, Press, Stars, Tag, StatusBarScrim, useTopInset, type IconName } from '@/components/ui';
import { BookingCard, DateStrip } from '@/components/Rental';
import { CATEGORY_LABEL } from '@/lib/demo';
import { confirm, notify } from '@/lib/device';
import { ago, cmpStr, fmtDay } from '@/lib/util';
import { imageSource } from '@/lib/util';
import { fmtRange, HOLDS_DATES, quote, unavailableReason, upcomingDays } from '@/lib/rental';
import { listingTerms, termsRows, termsText } from '@/lib/terms';
import type { BookingStatus } from '@/lib/types';
import { t, tp } from '@/lib/i18n';
import { catLabel } from '@/lib/licence';
import { useQueryClient } from '@tanstack/react-query';
import { deleteServerListing, getGetMyLicenseQueryKey, getListListingsQueryKey, sendChatRequest, useGetMyLicense } from '@workspace/api-client-react';
import { EQUIPMENT_TYPES, canOperate } from '@workspace/reference';
import { CheckList, StatusPill } from '@/components/Verify';
import { useAppAuth } from '@/lib/auth';
import { apiError } from '@/lib/api';

/** Bookings that still need attention come first. */
const ORDER: Record<BookingStatus, number> = { pending: 0, returned: 1, accepted: 2, active: 3, completed: 4, declined: 5, cancelled: 6 };

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  const c = useColors();
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.stepN, { backgroundColor: done ? c.primary : c.accent }]}>
          {done ? <Feather name="check" size={15} color={c.card} /> : <Text style={[styles.stepNT, { color: c.forest }]}>{n}</Text>}
        </View>
        <H2 style={{ flex: 1, fontSize: 17 }}>{title}</H2>
      </View>
      {children}
    </Card>
  );
}

function Spec({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.spec, { backgroundColor: c.card, borderColor: c.border }]}>
      <Feather name={icon} size={16} color={c.primary} />
      <Text style={[styles.specV, { color: c.foreground }]} numberOfLines={1}>{value}</Text>
      <Muted style={{ fontSize: 11 }}>{label}</Muted>
    </View>
  );
}

export default function ListingDetail() {
  const c = useColors();
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; start?: string; end?: string }>();
  const id = params.id;
  const { state, requestBooking, addReview, deleteListing, toggleFavorite } = useAppData();
  const listing = state.listings.find((l) => l.id === id);
  const bookings = useMemo(() => state.bookings.filter((b) => b.listingId === id), [state.bookings, id]);
  // Dates chosen on the search screen carry over, so price and availability show straight away.
  const [start, setStart] = useState<string | null>(params.start ?? null);
  const [end, setEnd] = useState<string | null>(params.end ?? params.start ?? null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [ack, setAck] = useState(false);
  const [contacting, setContacting] = useState(false);
  const cache = useQueryClient();
  const { isSignedIn, userId } = useAppAuth();
  const license = useGetMyLicense({ query: { queryKey: getGetMyLicenseQueryKey(), enabled: !!isSignedIn && !!listing?.server && !listing?.mine } });

  const days = useMemo(() => upcomingDays(42, listing?.availableFrom, listing?.availableTo), [listing?.availableFrom, listing?.availableTo]);
  const taken = useMemo(() => {
    const s = new Set<string>();
    bookings.filter((b) => HOLDS_DATES.includes(b.status)).forEach((b) => {
      days.forEach((d) => { if (d >= b.start && d <= b.end) s.add(d); });
    });
    return s;
  }, [bookings, days]);

  if (!listing) {
    return <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 30 }}>
      <Empty icon="alert-circle" title={t('Listing not found')} body={t('It may have been removed.')} action={<Button label={t('Back')} onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />} />
    </View>;
  }

  const avg = listing.reviews.length ? listing.reviews.reduce((a, r) => a + r.rating, 0) / listing.reviews.length : 0;
  const reviewed = listing.reviews.some((r) => r.mine);
  const completedMine = bookings.some((b) => b.mine && b.status === 'completed');
  const canReview = !listing.mine && completedMine && !reviewed && !listing.server;
  const ownerConv = state.conversations.find((x) => x.name === listing.owner);
  const { terms, source: termsSrc } = listingTerms(listing);
  const fav = (state.favorites ?? []).includes(listing.id);

  const s = start;
  const e = end ?? start;
  const why = s && e ? unavailableReason(listing, state.bookings, s, e) : null;
  const q = s && e ? quote(listing, s, e) : null;
  const incoming = bookings.filter((b) => !b.mine).sort((a, b) => ORDER[a.status] - ORDER[b.status] || cmpStr(a.start, b.start));
  const mine = bookings.filter((b) => b.mine).sort((a, b) => ORDER[a.status] - ORDER[b.status] || cmpStr(b.createdAt, a.createdAt));

  const srv = listing.server;
  const type = srv?.typeId ? EQUIPMENT_TYPES.find((x) => x.id === srv.typeId) : undefined;
  // Who may drive it: the licence classes this machine needs, against the renter's verified licence.
  // "Renter operates" means the renter drives; "Operator included" or "agree in chat" do not require it.
  const selfDrive = terms.operator === 'Renter operates, licence shown';
  const drive = type?.license ? canOperate(license.data?.approvedCategories ?? [], type.license, listing.powerHp) : null;
  const driveBlocked = !!srv && !listing.mine && selfDrive && !!drive && !drive.ok;

  const contactOwner = async () => {
    if (!srv) return;
    if (!isSignedIn) { router.push('/sign-in'); return; }
    if (srv.ownerId === userId) return;
    setContacting(true);
    try {
      const r = await sendChatRequest({ userId: srv.ownerId });
      if (r.conversation) router.push(`/chat/${r.conversation.id}`);
      else notify(t('Request sent'), t('{name} gets your request to chat. When they accept, agree on dates and handover there.', { name: listing.owner }), 'success');
    } catch (err) { notify(t('Could not send'), t(apiError(err)), 'error'); }
    finally { setContacting(false); }
  };

  const removeServer = () => confirm(t('Remove listing?'), t('It is removed from BuildGO for everyone.'), async () => {
    if (!srv) return;
    try { await deleteServerListing(srv.id); await cache.invalidateQueries({ queryKey: getListListingsQueryKey() }); router.back(); }
    catch (err) { notify(t('Could not remove'), t(apiError(err)), 'error'); }
  }, t('Remove'));

  const submit = () => {
    if (!s || !e) return;
    if (!ack) { setErr(t('Read and acknowledge the rental conditions first.')); return; }
    const r = requestBooking(listing.id, s, e, note.trim(), {
      text: termsText(listing), source: termsSrc, acceptedAt: new Date().toISOString(),
    });
    if (!r.ok) { setErr(r.error ?? t('Could not send the request.')); return; }
    setStart(null); setEnd(null); setNote(''); setAck(false); setErr('');
    notify(t('Request sent'), t('{name} decides next. Track it below and on Home.', { name: listing.owner }), 'success');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBarScrim tone={c.forest} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 260, backgroundColor: c.forest }}>
          {listing.photo ? <Image source={imageSource(listing.photo)} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Feather name="truck" size={80} color={c.forestSoft} /></View>
          )}
          <LinearGradient colors={['rgba(22,24,28,0.5)', 'transparent', 'rgba(22,24,28,0.9)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.topBar, { top: top + 6 }]}>
            <IconButton icon="arrow-left" label={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/rent'))} testID="back" />
            {!listing.mine ? (
              <IconButton icon="heart" label={fav ? t('Remove from saved') : t('Save listing')} color={fav ? c.clay : c.foreground}
                onPress={() => toggleFavorite(listing.id)} testID="fav-listing" />
            ) : (
              <IconButton icon="trash-2" label={t('Remove listing')} color={c.destructive} testID="delete-listing"
                onPress={srv ? removeServer : () => confirm(t('Remove listing?'), t('It and its requests are removed from this device.'), () => { deleteListing(listing.id); router.back(); }, t('Remove'))} />
            )}
          </View>
          <View style={styles.heroText}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {listing.demo ? <DemoBadge label={t('DEMO LISTING')} /> : listing.mine ? <Tag label={t('Your listing')} color={c.accent} fg={c.forest} /> : null}
              {srv && (listing.mine || srv.vehicle?.status === 'approved') ? <StatusPill status={listing.mine ? srv.status : 'approved'} /> : null}
              <Tag label={CATEGORY_LABEL[listing.category]} color={c.forestSoft} fg={c.primaryForeground} />
            </View>
            <Text style={[styles.title, { color: c.primaryForeground }]}>{listing.title}</Text>
            <Text style={[styles.price, { color: c.accent }]}>{listing.pricePerDay} AZN / {t('day')}</Text>
          </View>
        </View>

        <View style={{ padding: 18, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={listing.owner} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.owner, { color: c.foreground }]}>{listing.mine ? t('You') : listing.owner}</Text>
              <Muted>{listing.village}{listing.mine ? '' : ` · ${t('{n} km away', { n: listing.distanceKm })}`}</Muted>
            </View>
            {avg ? <View style={{ alignItems: 'flex-end' }}><Stars value={Math.round(avg)} /><Muted>{tp(listing.reviews.length, '{n} review', '{n} reviews')}</Muted></View> : null}
          </View>

          <View style={styles.specs}>
            <Spec icon="calendar" label={t('Available')} value={listing.availableFrom || listing.availableTo
              ? `${listing.availableFrom ? fmtDay(listing.availableFrom) : t('now')} – ${listing.availableTo ? fmtDay(listing.availableTo) : t('open')}` : t('Any dates')} />
            {listing.powerHp ? <Spec icon="zap" label={t('Power')} value={`${listing.powerHp} ${t('hp')}`} /> : null}
            {listing.year ? <Spec icon="clock" label={t('Year')} value={String(listing.year)} /> : null}
            <Spec icon="shield" label={t('Deposit')} value={terms.deposit ? `${terms.deposit} AZN` : t('None')} />
          </View>

          {srv && listing.mine && srv.status !== 'approved' ? (
            <Notice icon={srv.status === 'rejected' ? 'x-circle' : 'clock'}
              text={srv.status === 'rejected' ? `${t('Not approved by the admin')}: ${srv.reviewNote ?? ''}` : t('Waiting for an admin to check this listing. Only you can see it until then.')} />
          ) : null}
          {listing.description ? <Body>{listing.description}</Body> : null}
          {srv ? (
            <Card style={{ padding: 16, gap: 10 }} testID="listing-verification">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="shield" size={18} color={c.primary} />
                <H2 style={{ flex: 1, fontSize: 17 }}>{t('Verification')}</H2>
              </View>
              {srv.vehicle ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.owner, { color: c.foreground, flex: 1 }]}>{srv.vehicle.brand} {srv.vehicle.model}</Text>
                    <StatusPill status={srv.vehicle.status} />
                  </View>
                  <Muted>{srv.vehicle.plate ? `${t('Plate')} ${srv.vehicle.plate} · ` : ''}VIN {srv.vehicle.vin}</Muted>
                  <Muted style={{ fontSize: 12 }}>{t('VIN and plate are checked automatically and compared with the registration document by a BuildGO admin.')}</Muted>
                </View>
              ) : <Muted>{t('No registered machine is needed for this kind of equipment.')}</Muted>}
              {listing.mine ? <CheckList checks={srv.checks} compact /> : null}
              {!listing.mine && drive ? (
                <View style={[styles.avail, { backgroundColor: drive.ok ? c.successBg : c.noticeBg }]} testID="drive-check">
                  <Feather name={drive.ok ? 'check-circle' : 'alert-triangle'} size={18} color={drive.ok ? c.success : c.clay} />
                  <Text style={[styles.availT, { color: c.foreground }]}>
                    {drive.ok ? t('Your verified licence allows you to drive this machine.')
                      : t('To operate it yourself you need a verified licence or certificate: {cats}.', { cats: drive.need.map(catLabel).join(' / ') })}
                  </Text>
                </View>
              ) : null}
              {!listing.mine && drive && !drive.ok ? (
                <Button label={t('Add my driving licence')} icon="credit-card" variant="ghost" onPress={() => router.push(isSignedIn ? '/documents' : '/sign-in')} />
              ) : null}
            </Card>
          ) : null}
          {ownerConv && !listing.mine ? (
            <Button label={t('Open demo chat with owner')} icon="message-circle" variant="ghost" onPress={() => router.push(`/chat/${ownerConv.id}`)} />
          ) : null}

          {listing.mine ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <H2 style={{ flex: 1 }}>{t('Requests')}</H2>
                <Muted>{incoming.length}</Muted>
              </View>
              {incoming.length === 0
                ? <Muted>{t('No requests yet. When a renter sends one, you decide here and follow the handover, return and condition check.')}</Muted>
                : incoming.map((b) => <BookingCard key={b.id} booking={b} listing={listing} party="owner" />)}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Step n={1} title={t('Pick dates')} done={!!s}>
                <Muted>{s ? `${fmtRange(s, e!)}. ${t('Tap another day to change.')}` : t('Tap a start day, then an end day. Crossed-out days are booked.')}</Muted>
                <DateStrip days={days} start={start} end={end} busy={(d) => taken.has(d)} testID="listing-dates"
                  onChange={(a, b) => { setStart(a); setEnd(b); setErr(''); }} />
                {days.length === 0 ? <Muted>{t("The owner's availability window has ended.")}</Muted> : null}
              </Step>

              <Step n={2} title={t('Price and availability')} done={!!q && !why}>
                {!q ? <Muted>{t('Pick dates to see the total.')}</Muted> : (
                  <>
                    <View style={[styles.avail, { backgroundColor: why ? '#F6DCD3' : c.successBg }]} testID="availability">
                      <Feather name={why ? 'x-circle' : 'check-circle'} size={18} color={why ? c.destructive : c.success} />
                      <Text style={[styles.availT, { color: c.foreground }]}>{why ?? t('Available {range}', { range: fmtRange(s!, e!) })}</Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      <View style={styles.qRow}><Muted>{tp(q.days, '{n} day', '{n} days')} × {listing.pricePerDay} AZN</Muted><Text style={[styles.qV, { color: c.foreground }]}>{q.rent} AZN</Text></View>
                      <View style={styles.qRow}><Muted>{t('Deposit, returned after the condition check')}</Muted><Text style={[styles.qV, { color: c.foreground }]}>{q.deposit} AZN</Text></View>
                      <View style={[styles.qRow, styles.qTotal, { borderColor: c.border }]}>
                        <Text style={[styles.qV, { color: c.foreground }]}>{t('Due at handover')}</Text>
                        <Text style={[styles.qTotalV, { color: c.primary }]}>{q.total} AZN</Text>
                      </View>
                    </View>
                    <Muted style={{ fontSize: 12 }}>{t('Paid directly to the owner. BuildGO does not take payments.')}</Muted>
                  </>
                )}
              </Step>

              {srv ? (
                <Step n={3} title={t('Contact the owner')}>
                  <Muted>{t('Ask to chat with {name}. When they accept, agree on the dates, handover and payment in the chat.', { name: listing.owner })}</Muted>
                  {driveBlocked ? <Notice icon="alert-triangle" text={t('This machine is rented without an operator. Add a verified licence with the right category first, or ask the owner for a driver.')} /> : null}
                  <Button label={t('Ask to chat with the owner')} icon="message-circle" onPress={contactOwner} loading={contacting} testID="contact-owner" />
                </Step>
              ) : (
              <Step n={3} title={t('Send request')}>
                <Field placeholder={t('Note for the owner (optional)')} value={note} onChangeText={setNote} />
                <Press onPress={() => { setAck((a) => !a); setErr(''); }} testID="terms-ack" selected={ack}
                  style={[styles.ack, { borderColor: ack ? c.primary : c.input, backgroundColor: ack ? c.successBg : c.card, borderRadius: c.radius }]}>
                  <View style={[styles.box, { borderColor: c.forest, backgroundColor: ack ? c.forest : 'transparent' }]}>
                    {ack ? <Feather name="check" size={16} color={c.accent} /> : null}
                  </View>
                  <Text style={[styles.ackT, { color: c.foreground }]}>{t('I have read the rental conditions below. A copy is saved with my request.')}</Text>
                </Press>
                {err ? <Text style={{ fontFamily: F.s, color: c.destructive }}>{err}</Text> : null}
                <Button label={t('Send request')} icon="send" disabled={!s || !!why || !ack} onPress={submit} testID="request-booking" />
                <Muted style={{ fontSize: 12 }}>{t('Demo: the owner is simulated, so you can also play their steps.')}</Muted>
              </Step>
              )}

              {mine.length ? <H2 style={{ marginTop: 6 }}>{t('Your requests')}</H2> : null}
              {mine.map((b) => <BookingCard key={b.id} booking={b} listing={listing} party="renter" />)}
            </View>
          )}

          <Card style={{ padding: 16, gap: 10 }} testID="listing-terms">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="file-text" size={18} color={c.forest} />
              <H2 style={{ flex: 1 }}>{t('Rental conditions')}</H2>
              {termsSrc === 'template' ? <DemoBadge label={t('DEFAULT TEMPLATE')} /> : <Tag label={t('Set by owner')} color={c.accent} fg={c.forest} />}
            </View>
            {termsRows(terms).map(([k, v]) => (
              <View key={k} style={[styles.termRow, { borderColor: c.border }]}>
                <Text style={[styles.termK, { color: c.mutedForeground }]}>{k}</Text>
                <Text style={[styles.termV, { color: c.foreground }]}>{v}</Text>
              </View>
            ))}
            {termsSrc === 'template' ? <Muted>{t('The owner has not customised conditions, so the BuildGO default template applies. Confirm details in chat.')}</Muted> : null}
            <Press onPress={() => router.push({ pathname: '/conditions', params: { tab: 'rental' } })} testID="listing-open-conditions">
              <Text style={{ fontFamily: F.s, fontSize: 14, color: c.primary, paddingVertical: 4 }}>{t('Full template: payment, deposit, inspection, disputes')}</Text>
            </Press>
            <Muted style={{ fontSize: 12 }}>{t('Not legal advice. BuildGO does not take payments, hold deposits or run escrow.')}</Muted>
          </Card>

          <H2>{t('Reviews and rating')}</H2>
          {canReview ? (
            <Card style={{ padding: 14, gap: 12 }} testID="review-form">
              <Muted>{t('Your rental is completed. How did it go?')}</Muted>
              <Stars value={rating} onChange={setRating} size={30} />
              <Field placeholder={t('Was the machine on time and in good shape?')} value={review} onChangeText={setReview} multiline />
              <Button label={t('Post review')} icon="star" variant="accent" disabled={!review.trim()}
                onPress={() => { addReview(listing.id, rating, review.trim()); setReview(''); notify(t('Review posted'), t('Thanks for helping others choose.'), 'success'); }} />
            </Card>
          ) : !listing.mine && !reviewed ? <Muted>{t('You can review after a rental is completed.')}</Muted> : null}
          {listing.reviews.length === 0 ? <Muted>{t('No reviews yet.')}</Muted> : listing.reviews.map((r) => (
            <Card key={r.id} style={{ padding: 14, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.owner, { color: c.foreground, flex: 1 }]}>{r.author}</Text>
                <Stars value={r.rating} size={14} />
              </View>
              <Body style={{ fontSize: 14 }}>{r.text}</Body>
              <Muted>{ago(r.at)}{r.mine ? ` · ${t('on this device')}` : ''}</Muted>
            </Card>
          ))}
          {listing.demo ? <Notice text={t('Demo listing. Requests stay on this device; the owner is simulated.')} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 6 },
  title: { fontFamily: F.b, fontSize: 26, letterSpacing: -0.6 },
  price: { fontFamily: F.b, fontSize: 18 },
  owner: { fontFamily: F.b, fontSize: 15 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spec: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 14, padding: 10, gap: 2 },
  specV: { fontFamily: F.b, fontSize: 14 },
  stepN: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNT: { fontFamily: F.b, fontSize: 14 },
  avail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  availT: { flex: 1, fontFamily: F.s, fontSize: 14 },
  qRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  qV: { fontFamily: F.b, fontSize: 15 },
  qTotal: { borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  qTotalV: { fontFamily: F.b, fontSize: 20 },
  termRow: { flexDirection: 'row', gap: 12, paddingVertical: 7, borderTopWidth: 1 },
  termK: { width: 96, fontFamily: F.s, fontSize: 13 },
  termV: { flex: 1, fontFamily: F.m, fontSize: 14, lineHeight: 19 },
  ack: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 1.5, alignItems: 'flex-start' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ackT: { flex: 1, fontFamily: F.m, fontSize: 14, lineHeight: 20 },
});
