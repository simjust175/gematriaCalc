import { findGematriaRanges } from './tanachGematriaSearch.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

export const MAX_GEMATRIA_TARGET = 100000;
export const MAX_GEMATRIA_PAGE_SIZE = 50;

const VALID_TYPES = new Set(['all', 'whole_word', 'whole_phrase', 'partial']);
const MAX_CACHED_TARGETS = 6;
const MAX_CACHED_MATCH_REFERENCES = 200000;
const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const HEBREW_MARK = /[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]/;

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
      `SELECT v.book_slug, b.hebrew_name AS book_name, v.chapter, v.verse, v.display_text
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

  return {
    value,
    type,
    page,
    limit: Math.min(requestedLimit, MAX_GEMATRIA_PAGE_SIZE),
  };
}

export async function searchTanachGematria(db, options, mayRetry = true) {
  const { value, type, page, limit } = options;
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

  const offset = (page - 1) * limit;
  const results = [];
  let filteredIndex = 0;
  for (const match of entry.matches) {
    if (type !== 'all' && match.type !== type) continue;
    if (filteredIndex >= offset && results.length < limit) {
      results.push(serializeMatch(corpus[match.verseIndex], match));
    }
    filteredIndex += 1;
    if (results.length === limit) break;
  }

  const total = type === 'all' ? entry.counts.all : entry.counts[type];
  const response = {
    target: value,
    results,
    counts: entry.counts,
    total,
    page,
    limit,
    hasMore: offset + results.length < total,
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