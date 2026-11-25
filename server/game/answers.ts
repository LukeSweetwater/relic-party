import data from '../../shared/categories.json' with { type: 'json' };

export interface Category {
  name: string;
  /** normalized alias -> canonical display answer */
  lookup: Map<string, string>;
}

/** Lowercase, strip accents and punctuation, collapse spaces, drop a leading "the". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function buildCategory(name: string, answers: string[]): Category {
  const lookup = new Map<string, string>();
  for (const entry of answers) {
    const aliases = entry.split('|');
    const canonical = aliases[0];
    for (const alias of aliases) lookup.set(normalize(alias), canonical);
  }
  return { name, lookup };
}

/** Returns the canonical answer, or null if it doesn't fit the category. Allows one typo in answers of 5+ letters. */
export function matchAnswer(category: Category, input: string): string | null {
  const n = normalize(input);
  if (!n) return null;
  const exact = category.lookup.get(n);
  if (exact) return exact;
  // Simple plural tolerance: "grapes" -> "grape"
  if (n.endsWith('s')) {
    const singular = category.lookup.get(n.slice(0, -1));
    if (singular) return singular;
  }
  if (n.length >= 5) {
    for (const [alias, canonical] of category.lookup) {
      if (Math.abs(alias.length - n.length) <= 1 && levenshtein(alias, n) <= 1) return canonical;
    }
  }
  return null;
}

export const STARTER_PACK: Category[] = data.categories.map((c) => buildCategory(c.name, c.answers));
