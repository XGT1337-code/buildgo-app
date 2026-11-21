import type { IconName } from '@/components/ui';
import { addDays, cmpStr, DAY, fmtDay, isoDay, rangesOverlap } from './util';
import type { Booking, BookingStatus, Listing } from './types';
import { t } from './i18n';

/**
 * The rental flow, one place:
 *   Request sent → Owner decides (accept / decline) → Booking confirmed → Handover → Rental active
 *   → Return → Condition check → Completed → Reviews and rating.
 */

/** Statuses that hold the dates (block other requests). */
export const HOLDS_DATES: BookingStatus[] = ['pending', 'accepted', 'active'];

const STATUS_EN: Record<BookingStatus, string> = {
  pending: 'Waiting for owner',
  accepted: 'Booking confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  active: 'Rental active',
  returned: 'Returned, check pending',
  completed: 'Completed',
};
export const statusLabel = (s: BookingStatus) => t(STATUS_EN[s]);

/** Steps shown in the timeline, in order. */
export const STAGES: { status: BookingStatus; label: string; icon: IconName }[] = [
  { status: 'pending', label: 'Request', icon: 'send' },
  { status: 'accepted', label: 'Confirmed', icon: 'check' },
  { status: 'active', label: 'Handed over', icon: 'truck' },
  { status: 'returned', label: 'Returned', icon: 'corner-down-left' },
  { status: 'completed', label: 'Completed', icon: 'award' },
];

export const stageIndex = (s: BookingStatus) => STAGES.findIndex((x) => x.status === s);

export type Party = 'owner' | 'renter';

export interface NextStep { to: BookingStatus; by: Party; label: string; icon: IconName; hint: string }

/** The single forward step for a booking, and who takes it. Decline and cancel are side exits handled separately. */
export function nextStep(b: Booking): NextStep | null {
  switch (b.status) {
    case 'pending': return { to: 'accepted', by: 'owner', label: t('Accept request'), icon: 'check', hint: t('The owner reviews dates and conditions, then accepts or declines.') };
    case 'accepted': return { to: 'active', by: 'owner', label: t('Confirm handover'), icon: 'truck', hint: t('Hand the machine over on {date} and check it together.', { date: fmtDay(b.start) }) };
    case 'active': return { to: 'returned', by: 'renter', label: t('Mark as returned'), icon: 'corner-down-left', hint: t('Bring it back by {date}.', { date: fmtDay(b.end) }) };
    case 'returned': return { to: 'completed', by: 'owner', label: t('Confirm condition'), icon: 'clipboard', hint: t('The owner inspects the machine and confirms its condition.') };
    default: return null;
  }
}

export const days = (start: string, end: string) =>
  Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / DAY) + 1;

export const fmtRange = (start: string, end: string) => (start === end ? fmtDay(start) : `${fmtDay(start)} – ${fmtDay(end)}`);

/** Why a listing can't be booked for these dates, or null when it can. */
export function unavailableReason(l: Listing, bookings: Booking[], start: string, end: string): string | null {
  if (end < start) return t('End date is before start date.');
  if (start < isoDay(new Date())) return t('Those dates are in the past.');
  if (l.availableFrom && start < l.availableFrom) return t('Available from {date}.', { date: fmtDay(l.availableFrom) });
  if (l.availableTo && end > l.availableTo) return t('Available until {date}.', { date: fmtDay(l.availableTo) });
  const clash = bookings.find((b) => b.listingId === l.id && HOLDS_DATES.includes(b.status) && rangesOverlap(start, end, b.start, b.end));
  if (clash) return t('Already booked {range}.', { range: fmtRange(clash.start, clash.end) });
  return null;
}

export interface Quote { days: number; rent: number; deposit: number; total: number }
export function quote(l: Listing, start: string, end: string): Quote {
  const n = days(start, end);
  const rent = Math.round(n * l.pricePerDay * 100) / 100;
  const deposit = l.terms?.deposit ?? 0;
  return { days: n, rent, deposit, total: rent + deposit };
}

/** Upcoming days a date strip should offer, clamped to the listing's window when given. */
export function upcomingDays(count = 42, from?: string, to?: string) {
  const out: string[] = [];
  for (let i = 1; out.length < count && i < 400; i++) {
    const d = isoDay(addDays(new Date(), i));
    if (from && d < from) continue;
    if (to && d > to) break;
    out.push(d);
  }
  return out;
}

/** Which side of a booking the user is on. */
export const partyOf = (b: Booking, listing?: Listing): Party | null => (b.mine ? 'renter' : listing?.mine ? 'owner' : null);

export interface RentalTask {
  id: string;
  listingId: string;
  icon: IconName;
  title: string;
  sub: string;
  /** 'you' = the user must act; 'wait' = waiting on the other side; 'alert' = a decline to act on. */
  kind: 'you' | 'wait' | 'alert';
  booking: Booking;
}

/** Everything on Home under "Your rentals", most urgent first. */
export function rentalTasks(listings: Listing[], bookings: Booking[]): RentalTask[] {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const out: RentalTask[] = [];
  for (const b of bookings) {
    const l = byId.get(b.listingId);
    if (!l) continue;
    const when = fmtRange(b.start, b.end);
    const add = (icon: IconName, title: string, sub: string, kind: RentalTask['kind']) =>
      out.push({ id: b.id, listingId: l.id, icon, title, sub, kind, booking: b });
    if (b.mine) {
      if (b.status === 'pending') add('clock', t('Request sent: {title}', { title: l.title }), t('{when} · waiting for {owner}', { when, owner: l.owner }), 'wait');
      else if (b.status === 'accepted') add('check-circle', t('Booking confirmed: {title}', { title: l.title }), t('Pick up {date} from {place}', { date: fmtDay(b.start), place: l.village }), 'wait');
      else if (b.status === 'active') add('truck', t('Rental active: {title}', { title: l.title }), t('Return by {date}', { date: fmtDay(b.end) }), 'you');
      else if (b.status === 'returned') add('clipboard', t('Returned: {title}', { title: l.title }), t('Owner is checking the condition'), 'wait');
      else if (b.status === 'completed' && !l.reviews.some((r) => r.mine)) add('star', t('Rate {name}', { name: l.title }), t('Rental completed. Leave a review'), 'you');
      else if (b.status === 'declined' && !b.dismissed) add('x-circle', t('Declined: {title}', { title: l.title }), t('{when} · find similar equipment', { when }), 'alert');
    } else if (l.mine) {
      if (b.status === 'pending') add('inbox', t('New request: {title}', { title: l.title }), `${b.requester} · ${when}`, 'you');
      else if (b.status === 'accepted') add('truck', t('Hand over {title}', { title: l.title }), t('To {name} on {date}', { name: b.requester, date: fmtDay(b.start) }), 'you');
      else if (b.status === 'active') add('clock', t('Rented out: {title}', { title: l.title }), t('{name} returns it {date}', { name: b.requester, date: fmtDay(b.end) }), 'wait');
      else if (b.status === 'returned') add('clipboard', t('Check condition: {title}', { title: l.title }), t('Returned by {name}', { name: b.requester }), 'you');
      else if (b.status === 'completed' && !b.renterRating) add('star', t('Rate {name}', { name: b.requester }), t('Rental of {title} completed', { title: l.title }), 'you');
    }
  }
  const rank = { alert: 0, you: 1, wait: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || cmpStr(a.booking.start, b.booking.start));
}
