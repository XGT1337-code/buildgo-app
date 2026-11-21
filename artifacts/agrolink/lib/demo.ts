import type { AppState, Conversation, Field, Listing, Post, Profile } from './types';
import { addDays, isoDay, areaHa } from './util';
import { t, weekdayShort } from './i18n';

const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

/** Names saved before the user typed one (including those from the app's farming days). */
const PLACEHOLDER_NAMES = ['Builder', 'Guest builder', 'Guest farmer', 'Farmer'];
export const isPlaceholderName = (n: string) => PLACEHOLDER_NAMES.includes(n);
/** Placeholder names are shown in the current language. */
export const shownName = (n: string) => (isPlaceholderName(n) ? t('Builder') : n);
/** Text of the bundled sample and example sites is shown in the current language; the user's own as typed. */
export const siteText = (f: { sample?: boolean; example?: boolean }, s: string) => (f.sample || f.example ? t(s) : s);

export const DEFAULT_CENTER: [number, number] = [49.8671, 40.4093]; // Baku

/** Kinds of work offered in the profile (stored in `profile.crops`). */
export const WORK_TYPES = ['Earthworks', 'Foundation', 'Concrete pouring', 'Masonry', 'Roofing', 'Interior finishing', 'Road building', 'Demolition', 'Electrical work', 'Plumbing'];
/** Site stage (`field.crop`), ground type (`field.soil`) and power on site (`field.irrigation`). */
export const SITE_STAGES = ['Earthworks', 'Foundation', 'Frame', 'Roofing', 'Finishing', 'Utilities', 'Landscaping'];
export const GROUNDS = ['Clay', 'Loam', 'Sand', 'Rocky ground', 'Fill'];
export const POWER = ['380 V', '220 V', 'No power'];

export const DEFAULT_PROFILE: Profile = {
  name: 'Builder',
  role: 'contractor',
  village: 'Bakı',
  region: 'Baku',
  crops: ['Earthworks'],
  bio: '',
  country: 'AZ',
  countryName: 'Azerbaijan',
  regionCode: '',
  locationSet: false,
};

const sq = (cx: number, cy: number, dx: number, dy: number, skew = 0): [number, number][] => [
  [cx - dx, cy - dy],
  [cx + dx + skew, cy - dy],
  [cx + dx, cy + dy],
  [cx - dx - skew, cy + dy],
];

export const starterFields = (): Field[] => {
  const boundary = sq(49.7546, 40.4857, 0.00017, 0.00012, 0.00003);
  return [{
    id: 'f-sample-1',
    name: 'Masazir house, 2 floors',
    crop: 'Foundation',
    areaHa: Math.round(areaHa(boundary) * 10000) / 10000,
    village: 'Masazır',
    soil: 'Clay',
    irrigation: '380 V',
    privacy: 'neighbors',
    boundary,
    photo: 'asset:site',
    point: [49.7546, 40.4857],
    notes: 'Sample site so you can explore. Edit or delete it any time.',
    createdAt: ago(240),
    sample: true,
    country: 'AZ',
  }];
};

/** Labeled example sites in several countries. Not owned by the user, never verified. */
export const exampleFields = (): Field[] => {
  const mk = (id: string, name: string, crop: string, village: string, country: string, ring: [number, number][], soil: string, irrigation: string): Field => ({
    id, name, crop, village, country, soil, irrigation, boundary: ring, privacy: 'public', example: true,
    areaHa: Math.round(areaHa(ring) * 10000) / 10000, createdAt: ago(400),
    notes: 'Example site to show how mapped sites look. It does not belong to you.',
  });
  return [
    mk('ex-az-bilgah', 'Bilgah villa', 'Frame', 'Bilgəh', 'AZ', sq(50.0391, 40.5671, 0.0005, 0.0003, 0.0001), 'Sand', '380 V'),
    mk('ex-az-ganja', 'Ganja warehouse', 'Roofing', 'Gəncə', 'AZ', sq(46.3601, 40.6829, 0.0007, 0.0004, -0.0001), 'Loam', '380 V'),
    mk('ex-az-sumgait', 'Sumgait road repair', 'Earthworks', 'Sumqayıt', 'AZ', sq(49.6686, 40.5897, 0.0016, 0.0002, 0.0002), 'Fill', 'No power'),
    mk('ex-ge-tbilisi', 'Tbilisi residential block', 'Frame', 'Tbilisi', 'GE', sq(44.7871, 41.7151, 0.0006, 0.0004, 0.0001), 'Rocky ground', '380 V'),
    mk('ex-tr-kars', 'Kars school extension', 'Finishing', 'Kars', 'TR', sq(43.0975, 40.6013, 0.0005, 0.0003, 0.0001), 'Clay', '220 V'),
    mk('ex-kz-almaty', 'Almaty logistics hub', 'Foundation', 'Almaty', 'KZ', sq(76.9286, 43.2389, 0.0012, 0.0007, -0.0002), 'Loam', 'No power'),
  ];
};

const OLD_CATEGORY: Record<string, Listing['category']> = {
  tractor: 'earthmoving', harvester: 'earthmoving', trailer: 'trucks', seeder: 'tools', sprayer: 'tools', irrigation: 'tools',
};
const OLD_ROLE: Record<string, Profile['role']> = { farmer: 'contractor', agronomist: 'operator' };

/**
 * Device data saved while the app was a farming app (BuildGO): the farm demo content is replaced by the
 * construction one; the user's own sites, diary, listings and bookings stay, with old labels mapped.
 */
export function toConstruction(s: AppState): AppState {
  if (s.domain === 'construction') {
    // Names saved with the old brand (the admin was "Admin AgriGO").
    return s.profile.name.includes('AgriGO') ? { ...s, profile: { ...s.profile, name: s.profile.name.replace(/AgriGO/g, 'BuildGO') } } : s;
  }
  const fresh = initialState();
  const ownFields = s.fields.filter((f) => !f.sample && !f.example);
  const ownFieldIds = new Set(ownFields.map((f) => f.id));
  const ownListings = s.listings.filter((l) => !l.demo).map((l) => ({ ...l, category: OLD_CATEGORY[l.category] ?? l.category }));
  const known = new Set(Object.keys(LOG_ICON));
  return {
    ...s,
    domain: 'construction',
    profile: {
      ...s.profile,
      name: isPlaceholderName(s.profile.name) ? 'Builder' : s.profile.name.replace(/AgriGO/g, 'BuildGO'),
      role: OLD_ROLE[s.profile.role] ?? s.profile.role,
      crops: s.profile.crops.filter((c) => WORK_TYPES.includes(c)).length ? s.profile.crops.filter((c) => WORK_TYPES.includes(c)) : fresh.profile.crops,
    },
    fields: [...ownFields, ...fresh.fields],
    logs: [...s.logs.filter((l) => ownFieldIds.has(l.fieldId)).map((l) => (known.has(l.type) ? l : { ...l, type: 'note' as const })), ...fresh.logs],
    listings: [...ownListings, ...fresh.listings],
    bookings: s.bookings.filter((b) => !b.demo && ownListings.some((l) => l.id === b.listingId)),
    posts: fresh.posts,
    conversations: fresh.conversations,
    examplesSeeded: [],
    favorites: (s.favorites ?? []).filter((id) => ownListings.some((l) => l.id === id)),
  };
}

/** Idempotent: adds only examples never seeded before in this scope. Deleted examples stay deleted. */
export function seedExamples(s: AppState): AppState {
  const done = new Set(s.examplesSeeded ?? []);
  const have = new Set(s.fields.map((f) => f.id));
  const add = exampleFields().filter((f) => !done.has(f.id) && !have.has(f.id));
  const all = exampleFields().map((f) => f.id);
  if (!add.length && all.every((id) => done.has(id))) return s;
  return { ...s, fields: [...s.fields, ...add], examplesSeeded: Array.from(new Set([...done, ...all])) };
}

export const demoPosts = (): Post[] => [
  {
    id: 'p-demo-1', author: 'Leyla Hasanova', mine: false, village: 'Xırdalan', topic: 'alert',
    text: 'Strong wind forecast for Thursday. Crane lifts on our block are moved to Friday.',
    photo: 'asset:crane', likes: 14, liked: false, demo: true, createdAt: ago(3),
    comments: [{ id: 'c1', author: 'Tural Aliyev', text: 'Same for us in Masazir.', at: ago(2), mine: false }],
  },
  {
    id: 'p-demo-2', author: 'Elchin Mammadov', mine: false, village: 'Sumqayıt', topic: 'market',
    text: 'Selling 40 m³ of crushed stone left over from a job, pickup from Sumgait.',
    likes: 6, liked: false, demo: true, createdAt: ago(9), comments: [],
  },
];

export const demoListings = (): Listing[] => [
  {
    id: 'l-demo-1', title: 'JCB 3CX backhoe loader with operator', category: 'earthmoving', pricePerDay: 160, village: 'Xırdalan',
    distanceKm: 6.2, owner: 'Elchin Mammadov', mine: false, photo: 'asset:excavator', demo: true, createdAt: ago(100), year: 2017, powerHp: 92,
    description: 'Digging, trenches, loading. Operator included, fuel paid separately. Breaker attachment on request.',
    reviews: [{ id: 'r1', author: 'Tural Aliyev', rating: 5, text: 'On time, neat trenches, careful near the fence.', at: ago(400), mine: false }],
  },
  {
    id: 'l-demo-2', title: 'KamAZ 65115 dump truck, 15 t, with driver', category: 'trucks', pricePerDay: 140, village: 'Sumqayıt',
    distanceKm: 24.5, owner: 'Rashad Musayev', mine: false, photo: 'asset:truck', demo: true, createdAt: ago(160), year: 2016, powerHp: 300,
    description: 'Soil, sand, crushed stone, debris. Price per day; per trip by agreement.',
    reviews: [],
  },
  {
    id: 'l-demo-3', title: 'Truck crane Ivanovets 25 t', category: 'lifting', pricePerDay: 320, village: 'Binəqədi',
    distanceKm: 9.8, owner: 'Leyla Hasanova', mine: false, photo: 'asset:crane', demo: true, createdAt: ago(200), year: 2014, powerHp: 260,
    availableFrom: isoDay(addDays(new Date(), 3)), availableTo: isoDay(addDays(new Date(), 40)),
    description: '21 m boom. Crane operator with certificate included. Minimum 4 hours.',
    reviews: [],
  },
  {
    id: 'l-demo-4', title: 'Concrete mixer truck, 9 m³', category: 'concrete', pricePerDay: 210, village: 'Masazır',
    distanceKm: 12.3, owner: 'Kamran Guliyev', mine: false, photo: 'asset:mixer', demo: true, createdAt: ago(300), year: 2019,
    description: 'Delivery from your plant or ours. Chute extension included.',
    reviews: [{ id: 'r2', author: 'Gunel Rzayeva', rating: 4, text: 'Came on time, the driver helped with the pour.', at: ago(800), mine: false }],
  },
  {
    id: 'l-demo-5', title: 'Bomag BW 120 road roller', category: 'road', pricePerDay: 95, village: 'Bakı',
    distanceKm: 4.1, owner: 'Gunel Rzayeva', mine: false, photo: 'asset:roller', demo: true, createdAt: ago(320), year: 2015, powerHp: 34,
    description: 'Double drum, 2.7 t. Good for paths, parking lots and backfill.', reviews: [],
  },
  {
    id: 'l-demo-6', title: 'Hilti TE 70 rotary hammer', category: 'tools', pricePerDay: 18, village: 'Bakı',
    distanceKm: 1.8, owner: 'Tural Aliyev', mine: false, photo: 'asset:tools', demo: true, createdAt: ago(500),
    description: 'With chisels and SDS-max bits 16–32 mm. Deposit required.', reviews: [],
  },
];

export const demoConversations = (): Conversation[] => [
  {
    id: 'm-demo-1', name: 'Elchin Mammadov', subtitle: 'JCB 3CX', unread: 1,
    messages: [
      { id: 'a', from: 'them', text: 'Salam! The loader is free from Thursday.', at: ago(5) },
      { id: 'b', from: 'them', text: 'Send me the site location when you can.', at: ago(4.5) },
    ],
  },
];

export const initialState = (): AppState => ({
  domain: 'construction',
  profile: DEFAULT_PROFILE,
  fields: starterFields(),
  logs: [
    { id: 'lg1', fieldId: 'f-sample-1', date: isoDay(addDays(new Date(), -21)), type: 'earthworks', note: 'Pit dug 1.8 m deep, soil taken away in 6 trips.' },
    { id: 'lg2', fieldId: 'f-sample-1', date: isoDay(addDays(new Date(), -9)), type: 'concrete', note: 'Strip foundation poured, M300, 18 m³.' },
  ],
  posts: demoPosts(),
  listings: demoListings(),
  bookings: [],
  conversations: demoConversations(),
});

export interface WeatherDay {
  day: string; hi: number; lo: number; rain: number;
  /** Max wind, km/h. */
  wind: number;
  icon: 'sun' | 'cloud' | 'cloud-rain' | 'cloud-snow' | 'cloud-lightning' | 'wind';
  /** Second-opinion forecast (MET Norway) for the same day, when the server could cross-check. */
  check?: { hi: number; lo: number; rain: number; agree: boolean };
}
export function demoWeather(): WeatherDay[] {
  const icons: WeatherDay['icon'][] = ['sun', 'sun', 'cloud', 'cloud-rain', 'wind', 'sun', 'cloud'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return {
      day: i === 0 ? t('Today') : weekdayShort(d),
      hi: 24 + ((i * 7) % 6) - (icons[i] === 'cloud-rain' ? 5 : 0),
      lo: 12 + ((i * 3) % 4),
      rain: icons[i] === 'cloud-rain' ? 7.4 : icons[i] === 'cloud' ? 0.8 : 0,
      wind: icons[i] === 'wind' ? 48 : 6 + ((i * 5) % 9),
      icon: icons[i],
    };
  });
}

/** A label table whose values are translated each time they are read. */
function translated(table: Record<string, string>): Record<string, string> {
  return new Proxy(table, { get: (o, k) => (typeof k === 'string' && k in o ? t(o[k]) : undefined) });
}

export const CATEGORY_LABEL: Record<string, string> = translated({
  earthmoving: 'Earthmoving', trucks: 'Trucks', lifting: 'Lifting', concrete: 'Concrete', road: 'Road', tools: 'Tools',
});
export const TOPIC_LABEL: Record<string, string> = { question: 'Question', tip: 'Tip', market: 'Market', alert: 'Alert' };
export const LOG_LABEL: Record<string, string> = translated({
  delivery: 'Material delivery', earthworks: 'Earthworks', concrete: 'Concrete pour', machine: 'Machine on site', inspection: 'Inspection', note: 'Note',
});
export const LOG_ICON: Record<string, string> = {
  delivery: 'package', earthworks: 'layers', concrete: 'box', machine: 'truck', inspection: 'clipboard', note: 'edit-3',
};
export const ROLE_LABEL: Record<string, string> = translated({
  contractor: 'Contractor', owner: 'Equipment owner', both: 'Contractor and owner', operator: 'Operator / driver',
});
