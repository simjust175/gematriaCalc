import { getCurrentWeeklyParshah } from './tanachWeeklyParsha.js';
import { isVerseInParshah, loadTanachCorpus } from './tanachGematriaDiscovery.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

// Consistent with existing Tanach discovery: only whole words/phrases are shown
// by default. Pages bound the response while every saved base word is scanned.
export const WEEKLY_SCAN_PAGE_SIZE = 50;

/**
 * Authenticated read-only scan. No changes to the user's calculator value,
 * Tanach corpus, saved library, base-word records or database schema.
 */
export async function findWeeklyBaseWordMatches(db, options = {}) {
  const parsha = getCurrentWeeklyParshah();
  if (!parsha) return matchWeeklyBaseWords({ baseWords: [], corpus: [], parsha: null, ...options });
  const [{ rows: baseWords }, { corpus }] = await Promise.all([
    db.query('SELECT id, original_text, full_gematria FROM base_words ORDER BY id ASC'),
    loadTanachCorpus(db),
  ]);
  return matchWeeklyBaseWords({ baseWords, corpus, parsha, ...options });
}

export function parseWeeklyBaseWordsQuery(query = {}) {
  const page = query.page == null ? 1 : Number(query.page);
  const wordId = query.word_id == null || query.word_id === '' ? null : Number(query.word_id);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return { error: 'invalid_page' };
  if (wordId !== null && (!Number.isSafeInteger(wordId) || wordId < 1)) return { error: 'invalid_base_word_id' };
  return { page, wordId };
}

/**
 * Enumerate contiguous *complete-word* ranges using the canonical Tanach
 * cursor's word boundaries and gematria prefix sums. Every candidate uses
 * the exact same matching boundaries and standard gematria values as the
 * existing finder, without rescanning the verse once per saved word/value.
 *
 * Calculate totals for ALL base words; paginate the results for the requested
 * word only (or all words) so a user can reach every saved word's matches.
 */
export function matchWeeklyBaseWords({ baseWords, corpus, parsha, page = 1, wordId = null }) {
  const empty = {
    parsha: parsha ? { nameHe: parsha.nameHe, shabbatDate: parsha.shabbatDate } : null,
    words: [],
    baseWordCount: 0,
    results: [],
    total: 0,
    selectedTotal: 0,
    page,
    limit: WEEKLY_SCAN_PAGE_SIZE,
    hasMore: false,
  };
  if (!parsha) return empty;

  const words = baseWords
    .filter(row => Number.isSafeInteger(Number(row.full_gematria)) && Number(row.full_gematria) > 0)
    .map(row => ({ id: row.id, text: row.original_text, value: Number(row.full_gematria), count: 0 }));
  if (!words.length) return empty;
  const byValue = new Map();
  for (const word of words) {
    if (!byValue.has(word.value)) byValue.set(word.value, []);
    byValue.get(word.value).push(word);
  }

  const offset = (page - 1) * WEEKLY_SCAN_PAGE_SIZE;
  const results = [];
  let total = 0;
  let selectedTotal = 0;

  for (const verse of corpus) {
    if (!isVerseInParshah(verse, parsha)) continue;
    const cursor = createTanachCursor(verse.display_text);
    const { letters, prefixes } = cursor;
    const wordRanges = [];
    for (let i = 0; i < letters.length; i += 1) {
      const last = wordRanges[wordRanges.length - 1];
      if (!last || last.wordIndex !== letters[i].wordIndex) {
        wordRanges.push({ wordIndex: letters[i].wordIndex, start: i, end: i });
      } else {
        last.end = i;
      }
    }

    for (let startWord = 0; startWord < wordRanges.length; startWord += 1) {
      const first = wordRanges[startWord].start;
      for (let endWord = startWord; endWord < wordRanges.length; endWord += 1) {
        const end = wordRanges[endWord].end;
        const value = prefixes[end + 1] - prefixes[first];
        const entries = byValue.get(value);
        if (!entries) continue;
        for (const word of entries) {
          word.count += 1;
          total += 1;
          if (wordId !== null && word.id !== wordId) continue;
          if (selectedTotal >= offset && results.length < WEEKLY_SCAN_PAGE_SIZE) {
            results.push({
              baseWordId: word.id,
              baseWordText: word.text,
              value,
              bookSlug: verse.book_slug,
              bookName: verse.book_name,
              chapter: verse.chapter,
              verse: verse.verse,
              start: first,
              end,
              text: cursor.range(first, end).text,
              type: endWord === startWord ? 'whole_word' : 'whole_phrase',
            });
          }
          selectedTotal += 1;
        }
      }
    }
  }
  return {
    parsha: empty.parsha,
    words: words.filter(word => word.count > 0),
    baseWordCount: words.length,
    results,
    total,
    selectedTotal,
    page,
    limit: WEEKLY_SCAN_PAGE_SIZE,
    hasMore: offset + results.length < selectedTotal,
  };
}
