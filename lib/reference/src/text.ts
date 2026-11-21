/** Text folding and fuzzy matching that works across Azerbaijani Latin, Russian Cyrillic and English. */

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ә: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm',
  н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'x', һ: 'h', ц: 'ts', ч: 'c', ҹ: 'c', ш: 's', щ: 's',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ј: 'y',
};
const LAT: Record<string, string> = { ə: 'e', ı: 'i', i̇: 'i', ş: 's', ç: 'c', ğ: 'g', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u', w: 'v', q: 'k', x: 'h' };

/**
 * Other accented Latin letters. A table instead of String.normalize: on Android Hermes, normalize() calls into
 * Java, and search folds thousands of names.
 */
const ACC: Record<string, string> = {
  à: 'a', á: 'a', ã: 'a', ä: 'a', å: 'a', ā: 'a', ă: 'a', ą: 'a', è: 'e', é: 'e', ê: 'e', ë: 'e', ē: 'e', ė: 'e', ę: 'e', ě: 'e',
  ì: 'i', í: 'i', ï: 'i', ī: 'i', į: 'i', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ō: 'o', ő: 'o', ø: 'o', ù: 'u', ú: 'u', ū: 'u', ů: 'u',
  ű: 'u', ų: 'u', ý: 'y', ÿ: 'y', ñ: 'n', ń: 'n', ň: 'n', ć: 'c', č: 'c', ď: 'd', đ: 'd', ł: 'l', ľ: 'l', ĺ: 'l', ř: 'r', ŕ: 'r',
  ś: 's', š: 's', ť: 't', ź: 'z', ż: 'z', ž: 'z', ß: 'ss',
};

/** Lower-case, script- and accent-free key: "Şəmkir", "Шамкир" and "Shamkir" all fold to "samkir". */
export function fold(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += CYR[ch] ?? LAT[ch] ?? ACC[ch] ?? ch;
  return out
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/kh/g, 'h').replace(/zh/g, 'j').replace(/[yj](?=[aeiou])/g, 'y')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Damerau–Levenshtein distance (adjacent swaps count as one edit). Three reused rows, no matrix. */
let r0 = new Int32Array(0), r1 = new Int32Array(0), r2 = new Int32Array(0);
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  if (r0.length < n + 1) { r0 = new Int32Array(n + 1); r1 = new Int32Array(n + 1); r2 = new Int32Array(n + 1); }
  let pp = r0, prev = r1, cur = r2;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
      cur[j] = v;
    }
    const t = pp; pp = prev; prev = cur; cur = t;
  }
  return prev[n];
}

/** similarity() for strings that are already folded. */
function foldedSimilarity(x: string, y: string, min = 0): number {
  if (!x || !y) return 0;
  if (x === y) return 1;
  const len = Math.max(x.length, y.length);
  // "Belarus 892" vs "892": a full word inside the other is a strong hint.
  const word = x.length >= 3 && y.length >= 3 && (` ${y} `.includes(` ${x} `) || ` ${x} `.includes(` ${y} `)) ? 0.8 : 0;
  // The distance is at least the length difference; skip the full computation when it cannot reach `min`.
  if (1 - Math.abs(x.length - y.length) / len < min) return word;
  return Math.max(1 - distance(x, y) / len, word);
}

/** 0…1, where 1 is identical after folding. */
export function similarity(a: string, b: string): number {
  return foldedSimilarity(fold(a), fold(b));
}

/** `keys`: the names already folded (built once for the large built-in lists). */
export interface Named { names: string[]; keys?: string[] }

/** Best matches of `query` among entries, each scored by its closest name (any language or alias). */
export function rank<T extends Named>(query: string, entries: T[], limit = 5, min = 0.6): { item: T; score: number }[] {
  const q = fold(query);
  if (!q) return [];
  const out: { item: T; score: number }[] = [];
  for (const item of entries) {
    let best = 0;
    const keys = item.keys ?? item.names.map((n) => (n ? fold(n) : ''));
    for (const f of keys) {
      if (!f) continue;
      // Cheap prefix hit first: typing "goran" should find "Goranboy" immediately.
      const s = f === q ? 1 : f.startsWith(q) && q.length >= 3 ? 0.9 + Math.min(0.09, q.length / f.length / 10) : foldedSimilarity(q, f, min);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best >= min) out.push({ item, score: best });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Obvious junk: too short or long, digits only, repeated letters, no vowels, symbols.
 * `allowNumeric`: machine models may be plain numbers (KamAZ 65115, MAZ 5516).
 */
export function nameProblem(name: string, { allowDigits = false, allowNumeric = false } = {}): string | null {
  const s = name.trim();
  if (s.length < 2) return 'Name is too short.';
  if (s.length > 60) return 'Name is too long.';
  if (/^[\d\s.-]+$/.test(s) && !(allowNumeric && /\d{3,}/.test(s))) return 'A name cannot be only numbers.';
  if (!allowDigits && /\d/.test(s)) return 'Names of kinds of work and places do not contain digits.';
  if (/(.)\1{3,}/u.test(s.toLowerCase())) return 'The same letter is repeated too many times.';
  if (/[^\p{L}\p{N}\s().,'’\-/]/u.test(s)) return 'Use letters only, without symbols.';
  const f = fold(s).replace(/[^a-z]/g, '');
  if (f.length >= 4 && !/[aeiouy]/.test(f)) return 'This does not look like a real word (no vowels).';
  return null;
}
