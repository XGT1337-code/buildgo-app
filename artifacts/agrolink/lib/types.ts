export type LngLat = [number, number];
export type Privacy = 'private' | 'neighbors' | 'public';

/**
 * A construction site (объект). Stored under the original "field" names so older device data still loads:
 * `crop` is the current stage of work, `soil` the ground type, `irrigation` the power supply on site.
 */
export interface Field {
  id: string;
  name: string;
  crop: string;
  areaHa: number;
  village: string;
  soil: string;
  irrigation: string;
  privacy: Privacy;
  boundary: LngLat[];
  /** Location of the chosen village from the settlements list, for fields without an outline. */
  point?: LngLat;
  photo?: string;
  notes: string;
  createdAt: string;
  /** ISO country code where the field was created (from the owner's chosen location). Unknown on legacy fields. */
  country?: string;
  /** Region code within `country`, when the owner had one chosen. */
  regionCode?: string;
  /** True for the starter sample shipped with the app. Shown with a SAMPLE label. */
  sample?: boolean;
  /** Seeded example field from a public-style showcase. Never owned by the user, never verified. */
  example?: boolean;
}

export type LogType = 'delivery' | 'earthworks' | 'concrete' | 'machine' | 'inspection' | 'note';

export interface LogEntry {
  id: string;
  fieldId: string;
  date: string;
  type: LogType;
  note: string;
  photo?: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  at: string;
  mine: boolean;
}

export type Topic = 'question' | 'tip' | 'market' | 'alert';

export interface Post {
  id: string;
  author: string;
  mine: boolean;
  village: string;
  topic: Topic;
  text: string;
  photo?: string;
  likes: number;
  liked: boolean;
  comments: Comment[];
  createdAt: string;
  demo: boolean;
}

export type Category = 'earthmoving' | 'trucks' | 'lifting' | 'concrete' | 'road' | 'tools';

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  at: string;
  mine: boolean;
}

export interface Listing {
  id: string;
  title: string;
  category: Category;
  pricePerDay: number;
  village: string;
  distanceKm: number;
  owner: string;
  mine: boolean;
  description: string;
  photo?: string;
  reviews: Review[];
  demo: boolean;
  createdAt: string;
  /** Owner-chosen rental conditions. Missing on legacy and demo listings (template is shown instead). */
  terms?: RentalTerms;
  /** Key specs shown on the equipment page. */
  year?: number;
  powerHp?: number;
  /** Window the owner offers the machine (inclusive ISO days). Missing = any date. */
  availableFrom?: string;
  availableTo?: string;
  /** Present on listings stored on the BuildGO server (moderated, visible to everyone once approved). */
  server?: ServerInfo;
}

export interface ServerInfo {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  ownerId: string;
  ownerUsername: string;
  typeId?: string | null;
  vehicle?: {
    brand: string; model: string; plate?: string | null; vin: string; status: 'pending' | 'approved' | 'rejected'; year?: number | null; powerHp?: number | null;
  } | null;
  checks: { field: string; level: 'ok' | 'warn' | 'error'; message: string }[];
}

export interface RentalTerms {
  payment: string;
  deposit: number;
  delivery: string;
  fuel: string;
  operator: string;
  cancellation: string;
  extra: string;
}

export interface TermsSnapshot {
  /** Plain-text copy of the conditions exactly as shown when the renter acknowledged them. */
  text: string;
  source: 'owner' | 'template';
  acceptedAt: string;
}

/**
 * Rental lifecycle (see lib/rental.ts):
 * pending → (owner) accepted | declined → (owner hands over) active → (renter returns) returned
 * → (owner confirms condition) completed → reviews. Renter may cancel while pending or accepted.
 */
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'active' | 'returned' | 'completed';

export interface Booking {
  id: string;
  listingId: string;
  requester: string;
  mine: boolean;
  start: string;
  end: string;
  status: BookingStatus;
  note: string;
  createdAt: string;
  demo: boolean;
  termsSnapshot?: TermsSnapshot;
  /** Every status change with its time, oldest first. */
  history?: { status: BookingStatus; at: string }[];
  /** Owner's check when the machine came back. */
  condition?: 'good' | 'issue';
  conditionNote?: string;
  /** Owner's 1–5 rating of the renter after completion. */
  renterRating?: number;
  /** Renter hid the "declined" notice from Home. */
  dismissed?: boolean;
}

export interface Message {
  id: string;
  from: 'me' | 'them';
  text: string;
  at: string;
}

export interface Conversation {
  id: string;
  name: string;
  subtitle: string;
  messages: Message[];
  unread: number;
}

/** contractor: rents machines for a job; owner: rents them out; operator: driver / machine operator for hire. */
export type Role = 'contractor' | 'owner' | 'both' | 'operator';

export interface Profile {
  name: string;
  role: Role;
  village: string;
  /** Free-text or dataset region name (legacy profiles may hold free text). */
  region: string;
  /** Kinds of work the person does (stored as `crops` for older device data). */
  crops: string[];
  bio: string;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
  countryName?: string;
  /** Region code within the country from the bundled dataset, '' when not chosen. */
  regionCode?: string;
  /** Map starting point derived from the dataset (never from fields). */
  center?: LngLat;
  zoom?: number;
  /** Optional contact number, normalized international form like +994501234567. Not used for sign-in. */
  phone?: string;
  /** True once the user explicitly picked a location. */
  locationSet?: boolean;
}

export interface SavedLocation {
  country: string;
  countryName: string;
  regionCode: string;
  region: string;
}

export interface AppState {
  /** 'construction' once device data has been moved over from the farming version (see toConstruction). */
  domain?: 'construction';
  profile: Profile;
  fields: Field[];
  logs: LogEntry[];
  posts: Post[];
  listings: Listing[];
  bookings: Booking[];
  conversations: Conversation[];
  /** Ids of example fields already seeded into this scope (so deleted examples never come back). */
  examplesSeeded?: string[];
  /** Listing ids the user bookmarked. */
  favorites?: string[];
}
