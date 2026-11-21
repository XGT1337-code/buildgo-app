import { unavailableReason } from './rental';
import type { Booking, Listing } from './types';

export interface EquipmentQuery { cat?: string; district?: string; start?: string; end?: string; text?: string }

/** Category, district, free dates and free text. Empty parts match everything. */
export function matchesSearch(l: Listing, bookings: Booking[], q: EquipmentQuery) {
  if (q.cat && l.category !== q.cat) return false;
  if (q.district && l.village.toLowerCase() !== q.district.toLowerCase()) return false;
  if (q.start && unavailableReason(l, bookings, q.start, q.end || q.start)) return false;
  const t = q.text?.trim().toLowerCase();
  if (t && !l.title.toLowerCase().includes(t) && !l.village.toLowerCase().includes(t) && !l.description.toLowerCase().includes(t)) return false;
  return true;
}
