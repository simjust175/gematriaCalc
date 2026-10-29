import { getCurrentWeeklyParshah } from './tanachWeeklyParsha.js';
import { isVerseInParshah, loadTanachCorpus } from './tanachGematriaDiscovery.js';
import { findGematriaRanges } from './tanachGematriaSearch.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

const MAX_VISIBLE_RESULTS = 150;

/**
 * Uses the canonical existing Gematria engine and weekly-Parsha boundaries.
 * Computes all matches, but bounds the response to avoid oversized pages.
 * Never writes to the database or changes the calculator's current value.
 */
export async function findWeeklyBaseWordMatches(db) {
  const parsha = getCurrentWeeklyParshah();
  if (!parsha) return { parsha: null, words: [], results: [], total: 0, limit: MAX_VISIBLE_RESULTS };
  const [{ rows: baseWords }, { corpus }] = await Promise.all([
    db.query('SELECT id, original_text, full_gematria FROM base_words ORDER BY id ASC'),
    loadTanachCorpus(db),
  ]);
  const words = baseWords
    .filter(row => Number.isSafeInteger(Number(row.full_gematria)) && Number(row.full_gematria) > 0)
    .map(row => ({ id: row.id, text: row.original_text, value: Number(row.full_gematria), count: 0 }));
  const byValue = new Map();
  for (const word of words) {
    if (!byValue.has(word.value)) byValue.set(word.value, []);
    byValue.get(word.value).push(word);
  }

  const results = [];
  let total = 0;
  for (const verse of corpus) {
    if (!isVerseInParshah(verse, parsha)) continue;
    for (const [value, entries] of byValue) {
      const matches = findGematriaRanges(verse.display_text, value);
      for (const match of matches) {
        // The existing discovery's "all" filter excludes partial words.
        if (match.classification === 'partial') continue;
        for (const word of entries) {
          word.count += 1;
          total += 1;
          if (results.length >= MAX_VISIBLE_RESULTS) continue;
          const cursor = createTanachCursor(verse.display_text);
          const range = cursor.range(match.start, match.end);
          results.push({
            baseWordId: word.id,
            baseWordText: word.text,
            value,
            bookSlug: verse.book_slug,
            bookName: verse.book_name,
            chapter: verse.chapter,
            verse: verse.verse,
            start: match.start,
            end: match.end,
            text: range.text,
            type: match.classification,
          });
        }
      }
    }
  }

  return {
    parsha: { nameHe: parsha.nameHe, shabbatDate: parsha.shabbatDate },
    words: words.filter(word => word.count > 0),
    baseWordCount: words.length,
    results,
    total,
    limit: MAX_VISIBLE_RESULTS,
  };
}
