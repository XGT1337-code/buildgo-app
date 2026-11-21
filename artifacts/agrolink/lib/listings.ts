import { useQuery } from '@tanstack/react-query';
import { getListListingsQueryKey, listListings, type ServerListing } from '@workspace/api-client-react';
import { mediaUrl } from './media';
import { listingTerms } from './terms';
import type { Listing, LngLat, RentalTerms } from './types';

/** Server listings appear in the app under this id prefix, next to demo and device listings. */
export const SERVER_PREFIX = 'srv-';
export const serverIdOf = (id: string) => (id.startsWith(SERVER_PREFIX) ? id.slice(SERVER_PREFIX.length) : null);

const km = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(a)));
};

export function toListing(s: ServerListing, from?: LngLat): Listing {
  const point: LngLat | undefined = s.lat != null && s.lng != null ? [s.lng, s.lat] : undefined;
  const base: Listing = {
    id: `${SERVER_PREFIX}${s.id}`,
    title: s.title,
    category: s.category,
    pricePerDay: s.pricePerDay,
    village: s.village,
    distanceKm: point && from ? km(from, point) : 0,
    owner: `${s.owner.firstName} ${s.owner.lastName}`,
    mine: s.mine,
    description: s.description,
    photo: s.photoId ? mediaUrl(s.photoId) : undefined,
    reviews: [],
    demo: false,
    createdAt: s.createdAt,
    year: s.year ?? undefined,
    powerHp: s.powerHp ?? undefined,
    availableFrom: s.availableFrom ?? undefined,
    availableTo: s.availableTo ?? undefined,
    server: {
      id: s.id, status: s.status, reviewNote: s.reviewNote, ownerId: s.owner.id, ownerUsername: s.owner.username, typeId: s.typeId,
      vehicle: s.vehicle ? { brand: s.vehicle.brand, model: s.vehicle.model, plate: s.vehicle.plate, vin: s.vehicle.vin, status: s.vehicle.status, year: s.vehicle.year, powerHp: s.vehicle.powerHp } : null,
      checks: s.checks,
    },
  };
  return s.terms ? { ...base, terms: { ...listingTerms(base).terms, ...(s.terms as Partial<RentalTerms>) } } : base;
}

/** Approved listings for everyone, plus the signed-in user's own in any review state. */
export function useServerListings(from?: LngLat) {
  const q = useQuery({ queryKey: getListListingsQueryKey(), queryFn: () => listListings(), staleTime: 60_000, retry: 1 });
  return { ...q, listings: (q.data ?? []).map((s) => toListing(s, from)) };
}
