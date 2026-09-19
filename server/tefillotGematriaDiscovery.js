import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { normalizeDerivedLetters } from './derivedLetterMatching.js';
import { findGematriaRanges, findWordEdgeRanges } from './tanachGematriaSearch.js';

const VALID_METHODS = new Set(['gematria', 'initials', 'finals']);
const VALID_TYPES = new Set(['all', 'whole_word', 'whole_phrase']);
const VALID_OCCASIONS = new Set(['', 'weekday', 'shabbat', 'festival']);
const VALID_SERVICES = new Set(['', 'kabbalat-shabbat', 'maariv', 'shacharit', 'musaf', 'mincha', 'additional']);
const MAX_PAGE_SIZE = 50;
const MAX_SEQUENCE_LENGTH = 160;
const FESTIVAL_SLUGS = new Set(['pesach', 'shavuot', 'sukkot', 'shemini-atzeret', 'simchat-torah']);

let corpusCache = null;
const targetCache = new Map();

function boundedContext(displayText, match, surroundingLetters = 12) {
  const characters = [...displayText];
  const firstDisplay = match.letters[0].displayIndex;
  const selectedLength = [...match.text].length;
  const lastDisplayExclusive = firstDisplay + selectedLength;
  let beforeStart = firstDisplay;
  let afterEnd = lastDisplayExclusive;
  let seen = 0;
  while (beforeStart > 0 && seen < surroundingLetters) {
    beforeStart -= 1;
    if (/[\u05D0-\u05EA]/u.test(characters[beforeStart])) seen += 1;
  }
  seen = 0;
  while (afterEnd < characters.length && seen < surroundingLetters) {
    if (/[\u05D0-\u05EA]/u.test(characters[afterEnd])) seen += 1;
    afterEnd += 1;
  }
  return {
    beforeText: `${beforeStart > 0 ? '…' : ''}${characters.slice(beforeStart, firstDisplay).join('')}`,
    afterText: `${characters.slice(lastDisplayExclusive, afterEnd).join('')}${afterEnd < characters.length ? '…' : ''}`,
  };
}

async function readRevision(db) {
  const result = await db.query(
    `SELECT COALESCE(MAX(imported_at)::text, 'empty') AS imported_at,
            (SELECT COUNT(*)::int FROM tefillot_units) AS unit_count
     FROM tefillot_sources`
  );
  return `${result.rows[0].imported_at}:${result.rows[0].unit_count}`;
}

async function loadCorpus(db) {
  const revision = await readRevision(db);
  if (!corpusCache || corpusCache.revision !== revision) {
    targetCache.clear();
    const promise = db.query(
      `SELECT u.id, u.occasion_slug, u.occasion_label, u.occasion_order,
              u.service_slug, u.service_label, u.service_order,
              u.section_key, u.section_label, u.section_order, u.subsection,
              u.sequence, u.hebrew_text, u.source_reference, u.source_work,
              u.source_version, u.license, s.version_source, s.source_url
       FROM tefillot_units u
       JOIN tefillot_sources s ON s.id = u.source_id
       ORDER BY u.occasion_order, u.service_order, u.section_order, u.sequence, u.id`
    ).then(result => result.rows);
    corpusCache = { revision, promise };
    promise.catch(() => {
      if (corpusCache?.promise === promise) corpusCache = null;
    });
  }
  return { corpus: await corpusCache.promise, revision };
}

function normalizeFilter(value) {
  return typeof value === 'string' ? value : '';
}

export function parseTefillotGematriaQuery(query) {
  const method = normalizeFilter(query.method) || 'gematria';
  const type = normalizeFilter(query.type) || 'all';
  const value = Number(query.value || 0);
  const sequence = normalizeFilter(query.sequence);
  const wordCount = [...sequence].length;
  const page = Number(query.page || 1);
  const requestedLimit = Number(query.limit || 12);
  const orderIndependent = query.order_independent === 'true';
  const occasion = normalizeFilter(query.occasion);
  const service = normalizeFilter(query.service);

  if (!VALID_METHODS.has(method)) return { error: 'invalid_match_method' };
  if (!VALID_TYPES.has(type)) return { error: 'invalid_match_type' };
  if (!Number.isSafeInteger(page) || page < 1) return { error: 'invalid_page' };
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) return { error: 'invalid_limit' };
  if (!VALID_OCCASIONS.has(occasion)) return { error: 'invalid_occasion_filter' };
  if (!VALID_SERVICES.has(service)) return { error: 'invalid_service_filter' };
  if (method === 'gematria') {
    if (!Number.isSafeInteger(value) || value < 1) return { error: 'invalid_gematria_value' };
    if (query.sequence != null || query.order_independent != null) return { error: 'invalid_match_query' };
  } else {
    if (
      query.value != null
      || !/^[\u05D0-\u05EA]+$/u.test(sequence)
      || wordCount < 1
      || wordCount > MAX_SEQUENCE_LENGTH
    ) return { error: 'invalid_match_sequence' };
    if (query.order_independent != null && !['true', 'false'].includes(query.order_independent)) {
      return { error: 'invalid_order_independent' };
    }
  }
  return {
    method,
    type,
    value,
    sequence,
    wordCount,
    orderIndependent,
    occasion,
    service,
    page,
    limit: Math.min(requestedLimit, MAX_PAGE_SIZE),
  };
}

function occasionMatches(unit, occasion) {
  if (!occasion) return true;
  if (occasion === 'festival') return FESTIVAL_SLUGS.has(unit.occasion_slug);
  return unit.occasion_slug === occasion;
}

function serializeMatch(unit, compactMatch) {
  const cursor = createTanachCursor(unit.hebrew_text);
  const match = {
    ...cursor.range(compactMatch.start, compactMatch.end),
    start: compactMatch.start,
    end: compactMatch.end,
  };
  return {
    id: `tefillot-${unit.id}-${match.start}-${match.end}`,
    sourceType: 'tefillot',
    occasionSlug: unit.occasion_slug,
    occasionLabel: unit.occasion_label,
    serviceSlug: unit.service_slug,
    serviceLabel: unit.service_label,
    sectionKey: unit.section_key,
    sectionLabel: unit.section_label,
    subsection: unit.subsection,
    unitId: unit.id,
    type: compactMatch.type,
    start: match.start,
    end: match.end,
    text: match.text,
    sourceReference: unit.source_reference,
    sourceWork: unit.source_work,
    sourceVersion: unit.source_version,
    license: unit.license,
    versionSource: unit.version_source,
    sourceUrl: unit.source_url,
    ...boundedContext(unit.hebrew_text, match),
  };
}

export async function searchTefillotGematria(db, options) {
  const { corpus } = await loadCorpus(db);
  const normalizedSequence = normalizeDerivedLetters(options.sequence, options.method);
  const cacheSequence = options.orderIndependent
    ? [...normalizedSequence].sort().join('')
    : normalizedSequence;
  const cacheKey = options.method === 'gematria'
    ? `gematria:${options.value}`
    : `${options.method}:${options.orderIndependent ? 'any' : 'strict'}:${cacheSequence}:${options.wordCount}`;
  let cached = targetCache.get(cacheKey);
  if (!cached) {
    const matches = [];
    for (let unitIndex = 0; unitIndex < corpus.length; unitIndex += 1) {
      const unitMatches = options.method === 'gematria'
        ? findGematriaRanges(corpus[unitIndex].hebrew_text, options.value)
        : findWordEdgeRanges(
            corpus[unitIndex].hebrew_text,
            options.sequence,
            options.method,
            options.wordCount,
            options.orderIndependent,
          );
      for (const match of unitMatches) {
        matches.push({ unitIndex, start: match.start, end: match.end, type: match.classification });
      }
    }
    cached = { matches };
    targetCache.set(cacheKey, cached);
    while (targetCache.size > 6) targetCache.delete(targetCache.keys().next().value);
  }

  const counts = { all: 0, whole_word: 0, whole_phrase: 0, partial: 0 };
  const filtered = [];
  for (const match of cached.matches) {
    const unit = corpus[match.unitIndex];
    if (!occasionMatches(unit, options.occasion)) continue;
    if (options.service && unit.service_slug !== options.service) continue;
    counts[match.type] += 1;
    if (match.type !== 'partial') counts.all += 1;
    if (options.type === 'all' && match.type === 'partial') continue;
    if (options.type !== 'all' && match.type !== options.type) continue;
    filtered.push({ unit, match });
  }
  const offset = (options.page - 1) * options.limit;
  const pageMatches = filtered.slice(offset, offset + options.limit);
  return {
    method: options.method,
    results: pageMatches.map(({ unit, match }) => serializeMatch(unit, match)),
    counts,
    total: options.type === 'all' ? counts.all : counts[options.type],
    page: options.page,
    limit: options.limit,
    hasMore: offset + pageMatches.length < filtered.length,
  };
}

export function clearTefillotGematriaCaches() {
  corpusCache = null;
  targetCache.clear();
}