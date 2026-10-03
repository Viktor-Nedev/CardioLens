// Fuzzy matching for the command palette.

const WORD_START = /[\s#·:,(/-]/;

/** Score one search word against the text, or null when its characters do not appear in order. */
function wordScore(word: string, t: string): number | null {
  const at = t.indexOf(word);
  if (at >= 0) return 100 + (at === 0 || WORD_START.test(t[at - 1]) ? 20 : 0) - at * 0.5;
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of word) {
    const found = t.indexOf(ch, from);
    if (found < 0) return null;
    score += found === prev + 1 ? 4 : 1;
    if (found === 0 || WORD_START.test(t[found - 1])) score += 3;
    prev = found;
    from = found + 1;
  }
  return score;
}

const words = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Score how well `query` matches `text` (higher is better), or null when it does not match.
 * Every word of the query must match on its own; substrings beat scattered characters,
 * word starts and consecutive runs score higher, and shorter texts win ties.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const ws = words(query);
  if (!ws.length) return 0;
  const t = text.toLowerCase();
  let total = 0;
  for (const w of ws) {
    const s = wordScore(w, t);
    if (s == null) return null;
    total += s;
  }
  return total - t.length * 0.01;
}

/** Indices of the characters of `text` matched by `query`, for highlighting. */
export function fuzzyIndices(query: string, text: string): number[] {
  const t = text.toLowerCase();
  const out = new Set<number>();
  for (const w of words(query)) {
    const at = t.indexOf(w);
    if (at >= 0) {
      for (let i = 0; i < w.length; i++) out.add(at + i);
      continue;
    }
    const hits: number[] = [];
    let from = 0;
    for (const ch of w) {
      const found = t.indexOf(ch, from);
      if (found < 0) break;
      hits.push(found);
      from = found + 1;
    }
    if (hits.length === w.length) hits.forEach((i) => out.add(i));
  }
  return [...out].sort((a, b) => a - b);
}
