import { normalize, toHebrewNumber } from '../src/composables/useGematria.js';
import { loadTanachCorpus } from './tanachGematriaDiscovery.js';
import { loadTefillotCorpus } from './tefillotGematriaDiscovery.js';
import { isTefillotAvailable } from './tefillot.js';

const preparedCorpora = new WeakMap();
const MAX_QUERY_LENGTH = 160;

export function parseSuggestionQuery(query) {
  if (typeof query.q !== 'string' || query.q.length > MAX_QUERY_LENGTH) return { error: 'invalid_query' };
  const text = normalize(query.q);
  const limit = query.limit == null ? 8 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) return { error: 'invalid_limit' };
  return { text, limit, eligible: text.replace(/\s/g, '').length >= 3 };
}

function prepare(corpus, sourceType) {
  let entries = preparedCorpora.get(corpus);
  if (entries) return entries;
  entries = corpus.flatMap(row => {
    const text = sourceType === 'tanach' ? row.display_text : row.hebrew_text;
    if (!text) return [];
    const normalized = normalize(text);
    return [{
      row, sourceType, text, normalized, compact: normalized.replace(/\s/g, ''),
    }];
  });
  preparedCorpora.set(corpus, entries);
  return entries;
}

export function rankSuggestion(entry, query) {
  const index = entry.normalized.indexOf(query);
  if (index >= 0) return [
    entry.normalized === query ? 0 : index === 0 ? 1 : entry.normalized[index - 1] === ' ' ? 2 : 3,
    entry.normalized.length, index,
  ];
  const compactQuery = query.replace(/\s/g, '');
  const compactIndex = entry.compact.indexOf(compactQuery);
  if (compactIndex < 0) return null;
  return [entry.compact === compactQuery ? 0 : compactIndex === 0 ? 1 : 3, entry.normalized.length, compactIndex];
}

function compare(left, right) {
  for (let index = 0; index < left.rank.length; index++) {
    if (left.rank[index] !== right.rank[index]) return left.rank[index] - right.rank[index];
  }
  return left.order - right.order;
}

export function suggestionSnippet(text, query) {
  const letters = [];
  const offsets = [];
  for (let index = 0; index < text.length; index++) {
    if (/[\u05D0-\u05EA]/u.test(text[index])) {
      letters.push(text[index]);
      offsets.push(index);
    }
  }
  const normalizedQuery = normalize(query);
  const needle = normalizedQuery.replace(/\s/g, '');
  const normalizedText = normalize(text);
  const normalizedPosition = normalizedText.indexOf(normalizedQuery);
  // Highlight the occurrence that earned the normalized-text rank, not an
  // earlier similar word that matches only when spaces are removed.
  const position = normalizedPosition >= 0
    ? normalizedText.slice(0, normalizedPosition).replace(/\s/g, '').length
    : letters.join('').indexOf(needle);
  if (position < 0) return { before: text.slice(0, 140), match: '', after: text.length > 140 ? '…' : '' };
  const start = offsets[position];
  let end = offsets[position + needle.length - 1] + 1;
  while (/[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]/u.test(text[end] || '')) end++;
  const beforeStart = Math.max(0, start - 35);
  const afterEnd = Math.min(text.length, Math.max(end, start + 140));
  return {
    before: `${beforeStart ? '…' : ''}${text.slice(beforeStart, start)}`,
    match: text.slice(start, end),
    after: `${text.slice(end, afterEnd)}${afterEnd < text.length ? '…' : ''}`,
  };
}

export function selectSuggestions(corpora, query, limit = 8) {
  const top = [];
  const seen = new Set();
  let order = 0;
  for (const { corpus, sourceType } of corpora) {
    for (const entry of prepare(corpus, sourceType)) {
      const rank = rankSuggestion(entry, query);
      if (!rank) continue;
      const key = `${sourceType}:${entry.normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      top.push({ entry, rank, order: order++ });
      top.sort(compare);
      if (top.length > limit) top.pop();
    }
  }
  return top.map(({ entry }) => {
    const { row, sourceType, text } = entry;
    return {
      id: sourceType === 'tanach' ? `tanach:${row.book_slug}:${row.chapter}:${row.verse}` : `tefillot:${row.id}`,
      sourceType, text,
      context: sourceType === 'tanach'
        ? `${row.book_name} ${toHebrewNumber(row.chapter)}:${toHebrewNumber(row.verse)}`
        : [row.occasion_label, row.service_label, row.section_label].filter(Boolean).join(' · '),
      snippet: suggestionSnippet(text, query),
    };
  });
}

export async function searchCorpusSuggestions(db, options) {
  if (!options.eligible) return { results: [] };
  const { corpus } = await loadTanachCorpus(db);
  const corpora = [{ corpus, sourceType: 'tanach' }];
  let warning = '';
  try {
    if (await isTefillotAvailable(db)) {
      const prayers = await loadTefillotCorpus(db);
      corpora.push({ corpus: prayers.corpus, sourceType: 'tefillot' });
    }
  } catch {
    warning = 'הצעות מתפילות אינן זמינות כרגע';
  }
  return { results: selectSuggestions(corpora, options.text, options.limit), ...(warning ? { warning } : {}) };
}

export function registerCorpusSuggestionRoutes(app, { pool, requireAuth }) {
  app.get('/api/corpus/suggestions', requireAuth, async (req, res) => {
    const options = parseSuggestionQuery(req.query);
    if (options.error) return res.status(400).json({ error: options.error });
    try {
      res.json(await searchCorpusSuggestions(pool, options));
    } catch (error) {
      console.error('/api/corpus/suggestions error:', error.message);
      res.status(503).json({ error: 'corpus_suggestions_unavailable' });
    }
  });
}
