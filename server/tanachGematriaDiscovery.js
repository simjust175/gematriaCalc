import { findGematriaRanges } from './tanachGematriaSearch.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { toHebrewNumber } from '../src/composables/useGematria.js';
import { getCurrentWeeklyParshah } from './tanachWeeklyParsha.js';
import { TANACH_PARSHIOT } from './tanachParshiot.js';

export const MAX_GEMATRIA_TARGET = 100000;
export const MAX_GEMATRIA_PAGE_SIZE = 50;

const VALID_TYPES = new Set(['all', 'whole_word', 'whole_phrase', 'partial']);
const MAX_CACHED_TARGETS = 6;
const MAX_CACHED_MATCH_REFERENCES = 200000;
const MAX_GEMATRIA_SEARCH_LENGTH = 160;
const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const HEBREW_MARK = /[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]/;
const TORAH_BOOK_ORDER = new Map([
  ['Genesis', 1], ['Exodus', 2], ['Leviticus', 3], ['Numbers', 4], ['Deuteronomy', 5],
]);
const PARSHAH_BY_ID = new Map(TANACH_PARSHIOT.map(parshah => [parshah.id, parshah]));

let corpusCache = null;
const targetCache = new Map();

function touchTarget(value, entry) {
  targetCache.delete(value);
  targetCache.set(value, entry);
  const referenceCount = () => [...targetCache.values()]
    .reduce((sum, item) => sum + item.matches.length, 0);
  while (
    targetCache.size > 1
    && (targetCache.size > MAX_CACHED_TARGETS || referenceCount() > MAX_CACHED_MATCH_REFERENCES)
  ) {
    targetCache.delete(targetCache.keys().next().value);
  }
}

async function readCorpusRevision(db) {
  const result = await db.query(
    `SELECT COALESCE(MAX(imported_at)::text, 'empty') AS imported_at,
            COALESCE(MAX(representation_version), 1)::int AS representation_version
     FROM tanach_sources`
  );
  const row = result.rows[0];
  return `${row.imported_at}:${row.representation_version}`;
}

async function loadCorpus(db) {
  const revision = await readCorpusRevision(db);
  if (!corpusCache || corpusCache.revision !== revision) {
    targetCache.clear();
    const promise = db.query(
      `SELECT v.book_slug, b.hebrew_name AS book_name, b.canonical_order,
              v.chapter, v.verse, v.display_text
       FROM tanach_verses v
       JOIN tanach_books b ON b.slug = v.book_slug
       ORDER BY b.canonical_order, b.segment_order, v.chapter, v.verse`
    ).then(result => result.rows);
    corpusCache = { revision, promise };
    promise.catch(() => {
      if (corpusCache?.promise === promise) corpusCache = null;
    });
  }
  try {
    return { corpus: await corpusCache.promise, revision };
  } catch (error) {
    if (corpusCache?.revision === revision) {
      corpusCache = null;
    }
    throw error;
  }
}

async function ensureCurrentRevision(db, revision) {
  const currentRevision = await readCorpusRevision(db);
  if (currentRevision !== revision) {
    corpusCache = null;
    targetCache.clear();
    return false;
  }
  return true;
}

function boundedContext(displayText, match, surroundingLetters = 12) {
  const characters = [...displayText];
  const firstDisplay = match.letters[0].displayIndex;
  const selectedLength = [...match.text].length;
  const lastDisplayExclusive = firstDisplay + selectedLength;
  // Use code-point positions from the canonical cursor. Context truncation is
  // intentionally visual only; text/start/end always identify the exact range.
  let beforeStart = firstDisplay;
  let seen = 0;
  while (beforeStart > 0 && seen < surroundingLetters) {
    beforeStart -= 1;
    if (HEBREW_LETTER.test(characters[beforeStart])) seen += 1;
  }
  let afterEnd = lastDisplayExclusive;
  seen = 0;
  while (afterEnd < characters.length && seen < surroundingLetters) {
    if (HEBREW_LETTER.test(characters[afterEnd])) seen += 1;
    afterEnd += 1;
  }
  while (HEBREW_MARK.test(characters[afterEnd] || '')) afterEnd += 1;

  return {
    beforeText: `${beforeStart > 0 ? '…' : ''}${characters.slice(beforeStart, firstDisplay).join('')}`,
    afterText: `${characters.slice(lastDisplayExclusive, afterEnd).join('')}${afterEnd < characters.length ? '…' : ''}`,
  };
}

function serializeMatch(verse, compactMatch) {
  const cursor = createTanachCursor(verse.display_text);
  const match = {
    ...cursor.range(compactMatch.start, compactMatch.end),
    start: compactMatch.start,
    end: compactMatch.end,
  };
  return {
    bookSlug: verse.book_slug,
    bookName: verse.book_name,
    chapter: verse.chapter,
    verse: verse.verse,
    start: match.start,
    end: match.end,
    type: compactMatch.type,
    text: match.text,
    ...boundedContext(verse.display_text, match),
  };
}

export function parseGematriaSearchQuery(query) {
  const value = Number(query.value);
  const type = typeof query.type === 'string' ? query.type : 'all';
  const page = query.page == null ? 1 : Number(query.page);
  const requestedLimit = query.limit == null ? 12 : Number(query.limit);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const currentParshah = query.parsha === 'current';
  const requestedChumash = typeof query.chumash === 'string' ? query.chumash : '';
  const chumash = requestedChumash === 'all' ? '' : requestedChumash;
  const parshaId = typeof query.parsha_id === 'string' ? query.parsha_id : '';
  const requestedBookOrder = query.book_order == null ? '' : query.book_order;
  const bookOrder = requestedBookOrder === '' ? 0 : Number(requestedBookOrder);
  const chapterBook = typeof query.chapter_book === 'string' ? query.chapter_book : '';
  const chapter = query.chapter == null ? 0 : Number(query.chapter);
  const verseNumber = query.verse == null ? 0 : Number(query.verse);

  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_GEMATRIA_TARGET) {
    return { error: 'invalid_gematria_value' };
  }
  if (!VALID_TYPES.has(type)) return { error: 'invalid_match_type' };
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) {
    return { error: 'invalid_page' };
  }
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    return { error: 'invalid_limit' };
  }
  if (search.length > MAX_GEMATRIA_SEARCH_LENGTH) return { error: 'invalid_search' };
  if (query.parsha != null && !currentParshah) return { error: 'invalid_parsha_filter' };
  if (query.chumash != null && typeof query.chumash !== 'string') return { error: 'invalid_chumash_filter' };
  if (chumash && !TORAH_BOOK_ORDER.has(chumash)) return { error: 'invalid_chumash_filter' };
  if (query.book_order != null && (!Number.isSafeInteger(bookOrder) || bookOrder < 1 || bookOrder > 24)) {
    return { error: 'invalid_book_filter' };
  }
  if (query.chapter_book != null && (typeof query.chapter_book !== 'string' || !chapterBook)) {
    return { error: 'invalid_chapter_filter' };
  }
  if (query.chapter != null && (!Number.isSafeInteger(chapter) || chapter < 1)) {
    return { error: 'invalid_chapter_filter' };
  }
  if (query.verse != null && (!Number.isSafeInteger(verseNumber) || verseNumber < 1)) {
    return { error: 'invalid_verse_filter' };
  }
  if ((chapterBook && !chapter) || (chapter && !chapterBook) || (verseNumber && !chapter)) {
    return { error: 'invalid_chapter_filter' };
  }
  if (query.parsha_id != null && typeof query.parsha_id !== 'string') return { error: 'invalid_parsha_filter' };
  if (parshaId && !PARSHAH_BY_ID.has(parshaId)) return { error: 'invalid_parsha_filter' };
  if (parshaId && chumash && PARSHAH_BY_ID.get(parshaId).start.bookSlug !== chumash) {
    return { error: 'invalid_parsha_filter' };
  }
  const parshaBookOrder = parshaId ? TORAH_BOOK_ORDER.get(PARSHAH_BY_ID.get(parshaId).start.bookSlug) : 0;
  if (parshaId && bookOrder && parshaBookOrder !== bookOrder) return { error: 'invalid_parsha_filter' };
  if (currentParshah && (chumash || parshaId || bookOrder || chapterBook || chapter || verseNumber)) {
    return { error: 'invalid_parsha_filter' };
  }

  return {
    value,
    type,
    page,
    limit: Math.min(requestedLimit, MAX_GEMATRIA_PAGE_SIZE),
    search,
    currentParshah,
    chumash,
    parshaId,
    bookOrder: bookOrder || (chumash ? TORAH_BOOK_ORDER.get(chumash) : 0),
    chapterBook,
    chapter,
    verse: verseNumber,
  };
}

export async function validateTanachGematriaScope(db, options) {
  const { bookOrder, chapterBook, chapter, verse: verseNumber } = options;
  if (!bookOrder && !chapterBook) return null;

  if (bookOrder) {
    const canonicalBook = await db.query(
      'SELECT 1 FROM tanach_books WHERE canonical_order = $1 LIMIT 1',
      [bookOrder]
    );
    if (!canonicalBook.rows.length) return 'invalid_book_filter';
  }

  if (!chapterBook) return null;
  const segment = await db.query(
    'SELECT canonical_order FROM tanach_books WHERE slug = $1 LIMIT 1',
    [chapterBook]
  );
  if (!segment.rows.length || (bookOrder && segment.rows[0].canonical_order !== bookOrder)) {
    return 'invalid_chapter_filter';
  }

  const reference = await db.query(
    `SELECT 1
     FROM tanach_verses
     WHERE book_slug = $1
       AND chapter = $2
       AND ($3::int = 0 OR verse = $3)
     LIMIT 1`,
    [chapterBook, chapter, verseNumber]
  );
  if (reference.rows.length) return null;
  return verseNumber ? 'invalid_verse_filter' : 'invalid_chapter_filter';
}

function searchKey(value = '') {
  return String(value)
    .normalize('NFD')
    // Keep word boundaries stable for both pasted UXLC text and user queries.
    // Maqaf and sof pasuq must delimit terms rather than silently joining them.
    .replace(/[״׳"'־\u05BE\u05C3:.,/\\-]/g, ' ')
    .replace(/[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function verseSearchKey(verse) {
  const hebrewText = searchKey(verse.display_text);
  const hebrewReference = `${verse.book_name} ${toHebrewNumber(verse.chapter)} ${toHebrewNumber(verse.verse)}`;
  const numericReference = `${verse.book_name} ${verse.chapter} ${verse.verse}`;
  return searchKey([
    hebrewText,
    verse.book_name,
    verse.book_slug,
    hebrewReference,
    numericReference,
    `${verse.book_slug} ${verse.chapter} ${verse.verse}`,
  ].join(' '));
}

function compareReference(left, right) {
  const leftBook = TORAH_BOOK_ORDER.get(left.bookSlug);
  const rightBook = TORAH_BOOK_ORDER.get(right.bookSlug);
  if (leftBook !== rightBook) return (leftBook || 999) - (rightBook || 999);
  if (left.chapter !== right.chapter) return left.chapter - right.chapter;
  return left.verse - right.verse;
}

export function isVerseInParshah(verse, weeklyParshah) {
  if (!weeklyParshah?.portions?.length || !TORAH_BOOK_ORDER.has(verse.book_slug)) return false;
  const reference = { bookSlug: verse.book_slug, chapter: verse.chapter, verse: verse.verse };
  return weeklyParshah.portions.some(portion => (
    compareReference(reference, portion.start) >= 0 && compareReference(reference, portion.end) <= 0
  ));
}

export async function searchTanachGematria(db, options, mayRetry = true) {
  const {
    value,
    type,
    page,
    limit,
    search = '',
    currentParshah = false,
    chumash = '',
    parshaId = '',
    bookOrder = 0,
    chapterBook = '',
    chapter = 0,
    verse: verseNumber = 0,
  } = options;
  const { corpus, revision } = await loadCorpus(db);
  let entry = targetCache.get(value);
  if (!entry) {
    const counts = { all: 0, whole_word: 0, whole_phrase: 0, partial: 0 };
    const matches = [];
    for (let verseIndex = 0; verseIndex < corpus.length; verseIndex += 1) {
      const verseMatches = findGematriaRanges(corpus[verseIndex].display_text, value);
      for (const match of verseMatches) {
        counts.all += 1;
        counts[match.classification] += 1;
        matches.push({
          verseIndex,
          start: match.start,
          end: match.end,
          type: match.classification,
        });
      }
    }
    entry = { counts, matches };
  }
  touchTarget(value, entry);

  const normalizedSearch = searchKey(search);
  const weeklyParshah = getCurrentWeeklyParshah();
  const manualParshah = parshaId ? PARSHAH_BY_ID.get(parshaId) : null;
  const offset = (page - 1) * limit;
  const results = [];
  const counts = { all: 0, whole_word: 0, whole_phrase: 0, partial: 0 };
  for (const match of entry.matches) {
    const verse = corpus[match.verseIndex];
    if (normalizedSearch && !verseSearchKey(verse).includes(normalizedSearch)) continue;
    if (chumash && verse.book_slug !== chumash) continue;
    if (bookOrder && verse.canonical_order !== bookOrder) continue;
    if (chapterBook && verse.book_slug !== chapterBook) continue;
    if (chapter && verse.chapter !== chapter) continue;
    if (verseNumber && verse.verse !== verseNumber) continue;
    if (manualParshah && !isVerseInParshah(verse, { portions: [manualParshah] })) continue;
    if (currentParshah && !isVerseInParshah(verse, weeklyParshah)) continue;
    counts.all += 1;
    counts[match.type] += 1;
    if (type !== 'all' && match.type !== type) continue;
    if (counts[type] - 1 >= offset && results.length < limit) {
      results.push(serializeMatch(verse, match));
    }
  }

  const total = type === 'all' ? counts.all : counts[type];
  const response = {
    target: value,
    results,
    counts,
    total,
    page,
    limit,
    hasMore: offset + results.length < total,
    weeklyParshah: weeklyParshah && {
      id: weeklyParshah.id,
      ids: weeklyParshah.ids,
      nameHe: weeklyParshah.nameHe,
      isIsrael: weeklyParshah.isIsrael,
      shabbatDate: weeklyParshah.shabbatDate,
    },
  };
  if (mayRetry && !await ensureCurrentRevision(db, revision)) {
    return searchTanachGematria(db, options, false);
  }
  return response;
}

export function clearTanachGematriaCaches() {
  corpusCache = null;
  targetCache.clear();
}