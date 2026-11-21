/**
 * Automatic checks for machines and driving licences. These catch typos and fake numbers, but they
 * cannot prove a machine is registered: Azerbaijan's state registries have no public API, so every
 * record still goes to an admin, who compares it with the uploaded documents.
 */
import type { LicenseKind } from './data/equipment';

export type CheckLevel = 'ok' | 'warn' | 'error';
/** `message` is filled in English; `tpl` + `vars` let the app translate it ("{plate}" placeholders). */
export interface Check { field: string; level: CheckLevel; message: string; tpl?: string; vars?: Record<string, string | number> }

export const fill = (tpl: string, vars: Record<string, string | number> = {}) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
export const chk = (field: string, level: CheckLevel, tpl: string, vars?: Record<string, string | number>): Check =>
  (vars ? { field, level, message: fill(tpl, vars), tpl, vars } : { field, level, message: tpl });

// ------------------------------------------------------------------------------------------- VIN

const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/** World manufacturer identifiers (first 3 VIN / PIN characters) for trucks and construction machines. */
const WMI: Record<string, string> = {
  CAT: 'Caterpillar', KMT: 'Komatsu', JCB: 'JCB', VCE: 'Volvo CE', HCM: 'Hitachi', DWG: 'Develon (Doosan)',
  LZZ: 'Sinotruk HOWO', LZG: 'Shacman',
  Y3M: 'MAZ', XTC: 'KamAZ', X96: 'GAZ', X89: 'GAZ', XTH: 'GAZ', X5F: 'ZIL', ZCF: 'Iveco',
  JAL: 'Isuzu', JAA: 'Isuzu', WDB: 'Mercedes-Benz', WDF: 'Mercedes-Benz', W1T: 'Mercedes-Benz', WMA: 'MAN', YV2: 'Volvo Trucks', YS2: 'Scania',
  XLR: 'DAF', KMF: 'Hyundai', KMH: 'Hyundai', JTD: 'Toyota', JT1: 'Toyota', JN1: 'Nissan', JMB: 'Mitsubishi',
  '1FT': 'Ford', '1FD': 'Ford', '1GC': 'Chevrolet', NM0: 'Ford Otosan', NMT: 'Toyota Turkey',
  '1RW': 'John Deere', '1T0': 'John Deere', '1DW': 'John Deere',
};

const regionOf = (c: string) =>
  /[A-H]/.test(c) ? 'Africa' : /[J-R]/.test(c) ? 'Asia' : /[S-Z]/.test(c) ? 'Europe'
    : /[1-5]/.test(c) ? 'North America' : /[67]/.test(c) ? 'Oceania' : 'South America';

export const cleanVin = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '');

export interface VinInfo { valid: boolean; standard: boolean; maker?: string; region?: string; year?: number; checks: Check[] }

/**
 * 17-character VINs (ISO 3779) are fully checked. Many machines (excavators, cranes, older trucks) carry a
 * shorter factory serial (frame) number instead; that is accepted with a warning for the admin.
 */
export function checkVin(raw: string, nowYear = new Date().getFullYear()): VinInfo {
  const vin = cleanVin(raw);
  const checks: Check[] = [];
  if (!vin) return { valid: false, standard: false, checks: [{ field: 'vin', level: 'error', message: 'Enter the VIN or frame (serial) number.' }] };
  if (/[^A-Z0-9]/.test(vin)) return { valid: false, standard: false, checks: [{ field: 'vin', level: 'error', message: 'Only Latin letters and digits are allowed.' }] };
  if (vin.length !== 17) {
    if (vin.length >= 5 && vin.length <= 16 && /\d/.test(vin)) {
      return { valid: true, standard: false, checks: [{ field: 'vin', level: 'warn', message: 'Not a 17-character VIN. Accepted as a factory serial number; the admin will compare it with the registration document.' }] };
    }
    return { valid: false, standard: false, checks: [{ field: 'vin', level: 'error', message: 'A VIN has exactly 17 characters.' }] };
  }
  if (/[IOQ]/.test(vin)) {
    return { valid: false, standard: true, checks: [{ field: 'vin', level: 'error', message: 'A VIN never contains the letters I, O or Q (they look like 1 and 0). Check those characters.' }] };
  }
  if (/^(.)\1+$/.test(vin) || /^(0123456789|1234567890|ABCDEFGH)/.test(vin)) {
    return { valid: false, standard: true, checks: [{ field: 'vin', level: 'error', message: 'This VIN looks made up.' }] };
  }
  const sum = vin.split('').reduce((a, ch, i) => a + (/\d/.test(ch) ? Number(ch) : VIN_VALUES[ch] ?? 0) * VIN_WEIGHTS[i], 0);
  const expected = sum % 11 === 10 ? 'X' : String(sum % 11);
  const region = regionOf(vin[0]);
  if (vin[8] !== expected) {
    // The check digit is mandatory only for North American VINs; elsewhere it is often a filler.
    checks.push(region === 'North America'
      ? chk('vin', 'error', 'Check digit is wrong (position 9 should be {d}). A character is probably mistyped.', { d: expected })
      : { field: 'vin', level: 'warn', message: 'Check digit does not match. That is allowed outside North America, but double-check the number.' });
  } else checks.push({ field: 'vin', level: 'ok', message: 'VIN format and check digit are correct.' });
  const maker = WMI[vin.slice(0, 3)];
  const ycode = YEAR_CODES.indexOf(vin[9]);
  let year: number | undefined;
  if (ycode >= 0) {
    // The year code repeats every 30 years: take the latest year that is not in the future.
    year = 1980 + ycode;
    while (year + 30 <= nowYear + 1) year += 30;
  }
  checks.push(maker
    ? chk('vin', 'ok', 'Manufacturer code {code}: {maker}.', { code: vin.slice(0, 3), maker })
    : chk('vin', 'warn', 'Manufacturer code {code} ({region}) is not in our list; the admin will check it.', { code: vin.slice(0, 3), region }));
  return { valid: !checks.some((c) => c.level === 'error'), standard: true, maker, region, year, checks };
}

// ----------------------------------------------------------------------------------- AZ plates

export const cleanPlate = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '').replace(/[АВЕКМНОРСТХ]/g, (c) => 'ABEKMHOPCTX'['АВЕКМНОРСТХ'.indexOf(c)]);

/** Only codes we are sure of are named; the rest are shown as a number. */
const PLATE_REGIONS: Record<string, string> = { '10': 'Bakı', '90': 'Bakı', '77': 'Bakı', '99': 'Bakı', '20': 'Gəncə', '50': 'Sumqayıt' };

export function formatPlate(raw: string): string {
  const p = cleanPlate(raw);
  const m = /^(\d{2})([A-Z]{1,2})(\d{3,4})$/.exec(p);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : p;
}

/** Civil Azerbaijani plates are NN-LL-NNN (region code, two letters, three digits). */
export function checkPlate(raw: string): { valid: boolean; region?: string; checks: Check[] } {
  const p = cleanPlate(raw);
  if (!p) return { valid: false, checks: [{ field: 'plate', level: 'error', message: 'Enter the state number plate.' }] };
  const std = /^(\d{2})([A-Z]{2})(\d{3})$/.exec(p);
  if (std) {
    const [, code, , digits] = std;
    if (code === '00' || digits === '000') return { valid: false, checks: [{ field: 'plate', level: 'error', message: 'Region code and number cannot be zero.' }] };
    const region = PLATE_REGIONS[code];
    return { valid: true, region, checks: [region
      ? chk('plate', 'ok', 'Standard plate {plate}, region code {code} ({region}).', { plate: formatPlate(p), code, region })
      : chk('plate', 'ok', 'Standard plate {plate}, region code {code}.', { plate: formatPlate(p), code })] };
  }
  // Machinery registered with the State Technical Supervision may carry other formats.
  if (/^\d{2}[A-Z]{1,2}\d{4}$/.test(p) || /^[A-Z]{2}\d{4,6}$/.test(p)) {
    return { valid: true, checks: [{ field: 'plate', level: 'warn', message: 'Non-standard plate format (machinery or old style). The admin will check it against the documents.' }] };
  }
  return { valid: false, checks: [{ field: 'plate', level: 'error', message: 'Azerbaijani plates look like 10-AA-123.' }] };
}

// ------------------------------------------------------------------------------------ licences

/**
 * Road categories, the self-propelled machinery certificate (traktorçu-maşinist vəsiqəsi) categories —
 * TR-A off-road vehicles, TR-B wheeled machines ≤ 77.2 kW, TR-C 77.2–154.5 kW, TR-D > 154.5 kW, TR-E tracked
 * machines — and two operator certificates: CRANE (crane operator) and LIFT (aerial work platform operator).
 */
export const LICENSE_CATEGORIES = ['A', 'A1', 'B', 'BE', 'C', 'C1', 'CE', 'D', 'D1', 'DE', 'TR-A', 'TR-B', 'TR-C', 'TR-D', 'TR-E', 'CRANE', 'LIFT'] as const;
export type LicenseCategory = typeof LICENSE_CATEGORIES[number];

/** 77.2 kW ≈ 105 hp and 154.5 kW ≈ 210 hp. */
export function requiredCategories(kind: LicenseKind, powerHp?: number | null): LicenseCategory[] {
  switch (kind) {
    case 'machine':
      if (!powerHp) return ['TR-B', 'TR-C', 'TR-D'];
      return powerHp <= 105 ? ['TR-B', 'TR-C', 'TR-D'] : powerHp <= 210 ? ['TR-C', 'TR-D'] : ['TR-D'];
    case 'tracked': return ['TR-E'];
    case 'truck': return ['C', 'CE'];
    case 'semi': return ['CE'];
    case 'crane': return ['CRANE'];
    case 'lift': return ['LIFT'];
    default: return [];
  }
}

export function canOperate(have: string[], kind: LicenseKind, powerHp?: number | null): { ok: boolean; need: LicenseCategory[] } {
  const need = requiredCategories(kind, powerHp);
  return { ok: need.length === 0 || need.some((c) => have.includes(c)), need };
}

export const cleanLicense = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '');

export function checkLicense(number: string, categories: string[], expires: string, today = new Date()): { valid: boolean; checks: Check[] } {
  const n = cleanLicense(number);
  const checks: Check[] = [];
  if (!n) checks.push({ field: 'number', level: 'error', message: 'Enter the licence number.' });
  else if (/^[A-Z]{2}\d{6}$/.test(n)) checks.push({ field: 'number', level: 'ok', message: 'Licence number format looks right.' });
  else if (/^[A-Z0-9]{6,12}$/.test(n) && /\d{4}/.test(n)) checks.push({ field: 'number', level: 'warn', message: 'Unusual number format; the admin will compare it with the photo.' });
  else checks.push({ field: 'number', level: 'error', message: 'Licence numbers look like AB123456.' });
  const bad = categories.filter((c) => !(LICENSE_CATEGORIES as readonly string[]).includes(c));
  if (!categories.length) checks.push({ field: 'categories', level: 'error', message: 'Choose at least one category.' });
  else if (bad.length) checks.push(chk('categories', 'error', 'Unknown categories: {list}.', { list: bad.join(', ') }));
  if (categories.includes('BE') && !categories.includes('B')) checks.push({ field: 'categories', level: 'warn', message: 'BE normally comes together with B.' });
  if (categories.includes('CE') && !categories.includes('C')) checks.push({ field: 'categories', level: 'warn', message: 'CE normally comes together with C.' });
  const exp = /^\d{4}-\d{2}-\d{2}$/.test(expires) ? new Date(`${expires}T23:59:59`) : null;
  if (!exp || Number.isNaN(exp.getTime())) checks.push({ field: 'expires', level: 'error', message: 'Enter the expiry date as YYYY-MM-DD.' });
  else if (exp < today) checks.push({ field: 'expires', level: 'error', message: 'This licence has expired.' });
  else if (exp.getFullYear() > today.getFullYear() + 15) checks.push({ field: 'expires', level: 'warn', message: 'Expiry date is unusually far in the future.' });
  else checks.push(chk('expires', 'ok', 'Valid until {date}.', { date: expires }));
  return { valid: !checks.some((c) => c.level === 'error'), checks };
}
