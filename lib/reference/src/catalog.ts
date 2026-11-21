import { MATERIALS } from './data/materials';
import { WORKS } from './data/works';
import { BRANDS, EQUIPMENT_TYPES } from './data/equipment';
import { DISTRICTS, PLACES } from './data/places';
import { fold, nameProblem, rank } from './text';

export type CatalogKind = 'work' | 'material' | 'equipment' | 'brand' | 'model' | 'place';
export const CATALOG_KINDS: CatalogKind[] = ['work', 'material', 'equipment', 'brand', 'model', 'place'];

export interface CatalogEntry {
  kind: CatalogKind;
  /** Stable key: built-ins use their English/AZ name, admin additions their database id. */
  id: string;
  az: string; ru: string; en: string;
  /** Extra spellings matched by search (brand aliases, district, model's brand). */
  names: string[];
  /** `names` folded once for search (built-ins only; admin additions are folded per search). */
  keys?: string[];
  /** Group, district or brand shown as a subtitle. */
  sub?: string;
  /** For places: map point [lng, lat]. */
  point?: [number, number];
  source: 'builtin' | 'admin';
}

const KIND_RU = ['город', 'посёлок', 'село', 'хутор'];
const KIND_AZ = ['şəhər', 'qəsəbə', 'kənd', 'oba'];

let builtins: CatalogEntry[] | null = null;
export function builtinEntries(): CatalogEntry[] {
  if (builtins) return builtins;
  const out: CatalogEntry[] = [];
  for (const [az, ru, en, group] of WORKS) out.push({ kind: 'work', id: `work:${en}`, az, ru, en, names: [az, ru, en], sub: group, source: 'builtin' });
  for (const [az, ru, en, group] of MATERIALS) out.push({ kind: 'material', id: `material:${en}`, az, ru, en, names: [az, ru, en], sub: group, source: 'builtin' });
  for (const t of EQUIPMENT_TYPES) out.push({ kind: 'equipment', id: `equipment:${t.id}`, az: t.az, ru: t.ru, en: t.en, names: [t.az, t.ru, t.en], sub: t.category, source: 'builtin' });
  for (const b of BRANDS) {
    out.push({ kind: 'brand', id: `brand:${b.name}`, az: b.name, ru: b.name, en: b.name, names: [b.name, ...(b.aliases ?? [])], sub: b.country, source: 'builtin' });
    for (const m of b.models) out.push({ kind: 'model', id: `model:${b.name}:${m}`, az: m, ru: m, en: m, names: [m, `${b.name} ${m}`], sub: b.name, source: 'builtin' });
  }
  // A district's point is its namesake centre (Goranboy town for Goranboy district), else the middle of its places.
  DISTRICTS.forEach(([az, ru, en], i) => {
    const inside = PLACES.filter((p) => p[4] === i);
    const centre = inside.find((p) => fold(p[0]) === fold(az) && p[3] <= 1) ?? inside.find((p) => fold(p[0]) === fold(az));
    const point: [number, number] | undefined = centre ? [centre[6], centre[5]]
      : inside.length ? [inside.reduce((a, p) => a + p[6], 0) / inside.length, inside.reduce((a, p) => a + p[5], 0) / inside.length] : undefined;
    out.push({ kind: 'place', id: `district:${az}`, az: `${az} rayonu`, ru: ru ? `${ru} район` : az, en: en ? `${en} District` : az, names: [az, ru, en], sub: 'district', point, source: 'builtin' });
  });
  for (const [az, ru, en, k, d, lat, lon] of PLACES) {
    const district = DISTRICTS[d]?.[0];
    out.push({
      kind: 'place', id: `place:${az}:${district ?? ''}`, az, ru: ru || az, en: en || az, names: [az, ru, en],
      sub: [KIND_AZ[k], district].filter(Boolean).join(' · '), point: [lon, lat], source: 'builtin',
    });
  }
  for (const e of out) e.keys = e.names.map((n) => (n ? fold(n) : ''));
  builtins = out;
  return out;
}

/** Search one kind (or all) by any language, typo-tolerant. Extra entries are admin additions from the database. */
export function searchCatalog(query: string, opts: { kind?: CatalogKind; extra?: CatalogEntry[]; limit?: number; brand?: string } = {}) {
  let entries = [...builtinEntries(), ...(opts.extra ?? [])];
  if (opts.kind) entries = entries.filter((e) => e.kind === opts.kind);
  if (opts.brand) entries = entries.filter((e) => e.kind !== 'model' || fold(e.sub ?? '') === fold(opts.brand!));
  return rank(query, entries, opts.limit ?? 8, 0.55);
}

export type Verdict = 'exists' | 'similar' | 'new' | 'invalid';
export interface NameCheck { verdict: Verdict; message: string; matches: { entry: CatalogEntry; score: number }[] }

/**
 * Is a proposed new catalog name plausible? Exact or near-exact matches mean it already exists,
 * close ones are offered as "did you mean". A clean unknown name is allowed but flagged as new.
 */
export function checkName(kind: CatalogKind, name: string, opts: { extra?: CatalogEntry[]; brand?: string } = {}): NameCheck {
  const problem = nameProblem(name, { allowDigits: kind === 'model' || kind === 'brand' || kind === 'material' || kind === 'equipment', allowNumeric: kind === 'model' });
  if (problem) return { verdict: 'invalid', message: problem, matches: [] };
  if (kind === 'model' && !opts.brand) return { verdict: 'invalid', message: 'Choose the brand this model belongs to.', matches: [] };
  if (kind === 'model' && !/\d/.test(name) && name.trim().split(/\s+/).length < 2) {
    return { verdict: 'invalid', message: 'Machine models usually contain a number, like "65115", "3CX" or "PC200".', matches: [] };
  }
  const matches = searchCatalog(name, { kind, extra: opts.extra, brand: opts.brand, limit: 5 }).map((m) => ({ entry: m.item, score: m.score }));
  const top = matches[0];
  if (top && top.score >= 0.97) return { verdict: 'exists', message: `Already in the catalog: ${top.entry.az} / ${top.entry.ru} / ${top.entry.en}.`, matches };
  // Same thing under another kind ("Beton" proposed as a kind of work) is almost certainly a mistake.
  const elsewhere = searchCatalog(name, { extra: opts.extra, limit: 3 }).filter((m) => m.item.kind !== kind && m.score >= 0.95);
  if (elsewhere.length) {
    return { verdict: 'invalid', message: `This is already listed as a ${elsewhere[0].item.kind}: ${elsewhere[0].item.az}.`, matches: elsewhere.map((m) => ({ entry: m.item, score: m.score })) };
  }
  if (top && top.score >= 0.75) return { verdict: 'similar', message: `Very close to "${top.entry.az}". Is it a typo?`, matches };
  return { verdict: 'new', message: 'Not found in the catalog or the map of Azerbaijan. It can be added after you confirm it is real.', matches };
}
