import { parsePhoneNumberFromString, validatePhoneNumberLength, type CountryCode } from 'libphonenumber-js/max';
import metadata from 'libphonenumber-js/metadata.max.json';
/**
 * Contact-number helpers. Pure functions, no React Native imports, so they can be checked in Node.
 * This is a contact number shown to other farmers, never a sign-in method.
 */

/** "+994" -> "994", "+1-268" -> "1268", "+1-809 and 1-829" -> "1" (area code is typed by the user). */
export function parseDialCode(raw?: string | null): string {
  if (!raw) return '';
  const first = raw.split(/\s+and\s+/i);
  if (first.length > 1) return (first[0].split('-')[0] ?? '').replace(/\D/g, '');
  return raw.replace(/\D/g, '');
}

/** Digits a user typed for the national part. Drops a pasted "+<dial>" / "00<dial>" prefix and a trunk 0. */
export function cleanNational(input: string, dial: string): string {
  const t = input.trim();
  let d = t.replace(/\D/g, '');
  const intl = t.startsWith('+') || (!!dial && d.startsWith(`00${dial}`));
  if (intl && d.startsWith('00')) d = d.slice(2);
  if (intl && dial && d.startsWith(dial)) d = d.slice(dial.length);
  return d;
}

export function phoneDigitLimit(country?: string): number {
  const entry = metadata.countries[country as keyof typeof metadata.countries];
  const lengths = entry?.[3] as number[] | undefined;
  return lengths ? Math.max(...lengths) + (country === 'IT' ? 0 : 1) : 15;
}

/** Empty string means "no phone". Otherwise an error message, or null when valid. */
export function phoneError(national: string, dial: string, country?: string): string | null {
  if (!national) return null;
  if (!dial) return 'Choose a country first.';
  if (country) {
    const why = validatePhoneNumberLength(national, country as CountryCode);
    if (why === 'TOO_SHORT') return 'That number looks too short.';
    if (why === 'TOO_LONG') return 'That number looks too long.';
    if (why) return 'Invalid phone length for this country.';
    const parsed = parsePhoneNumberFromString(national, country as CountryCode);
    if (!parsed || parsed.countryCallingCode !== (dial.startsWith('1') ? '1' : dial)) return 'Invalid phone number for this country.';
    return null;
  }
  if (national.length < 4) return 'That number looks too short.';
  if (dial.length + national.length > 15) return 'That number looks too long.';
  return null;
}

/** Normalized international form (E.164 style) or undefined when empty or invalid. */
export function toInternational(national: string, dial: string, country?: string): string | undefined {
  if (!national || phoneError(national, dial, country)) return undefined;
  return country ? parsePhoneNumberFromString(national, country as CountryCode)?.number : `+${dial}${national}`;
}

/** National part of a stored number, only when it belongs to this dial code. Otherwise ''. */
export function nationalFrom(stored: string | undefined, dial: string): string {
  if (!stored || !dial) return '';
  const pre = `+${dial}`;
  return stored.startsWith(pre) ? stored.slice(pre.length) : '';
}

export const isPhone = (x: unknown): x is string => typeof x === 'string' && /^\+\d{6,15}$/.test(x);
