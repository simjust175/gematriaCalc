/**
 * server/app.js — Express application (exported for testing).
 * Does NOT call app.listen() — that lives in server/index.js.
 */
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { ensureMiluiPreferences, pool } from './db.js';
import { computeAll, normalize } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { parshaSearchKey } from './tanachParshiot.js';
import {
  parseGematriaSearchQuery,
  searchTanachGematria,
  validateTanachGematriaScope,
} from './tanachGematriaDiscovery.js';
import {
  parseMultipleDiscoveryQuery,
  searchSavedMultiples,
} from './multipleDiscovery.js';
import {
  isApplicationReady,
  requireApplicationReady,
} from './readiness.js';
import {
  MILUI_DEFAULT_MAPPING,
  MILUI_PRESET_NAME,
  normalizeMiluiMapping,
} from '../src/utils/milui.js';
import {
  acquireMiluiSaveLock,
  deleteMiluiIndexRows,
  getActiveMiluiMatches,
  indexSavedEntryForCurrentVersions,
  invalidateMiluiCoverageCheck,
  rebuildAndActivateMiluiMapping,
} from './miluiIndex.js';

export const app = express();
const PostgresSessionStore = connectPgSimple(session);

// ── Middleware ───────────────────────────────────────────────────────────────

// The deployment terminates TLS before forwarding requests to the app. Trusting
// that proxy lets secure session cookies be issued in production.
app.set('trust proxy', 1);
app.use(express.json());
app.use(requireApplicationReady);

// Sessions live in PostgreSQL so autoscaled instances share the same login
// state. No external CORS headers: all API access is same-origin through Vite.
app.use(session({
  secret: process.env.SESSION_SECRET || (() => {
    throw new Error('SESSION_SECRET environment variable must be set');
  })(),
  store: new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// ── Public auth routes ───────────────────────────────────────────────────────

/** GET /api/health — readiness signal for diagnostics and deployment checks. */
app.get('/api/health', (_req, res) => {
  res.json({ ready: isApplicationReady() });
});

/** POST /api/auth/login — validate APP_PASSWORD and create session. */
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return res.status(503).json({
      error: 'app_not_configured',
      message: 'APP_PASSWORD secret is not set. Add it in Replit Secrets.',
    });
  }
  if (typeof password !== 'string' || password !== expected) {
    return res.status(401).json({ error: 'invalid_password' });
  }

  req.session.authenticated = true;
  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'session_error' });
    res.json({ success: true });
  });
});

/** GET /api/auth/check — returns current authentication state. */
app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: req.session?.authenticated === true });
});

/** POST /api/auth/logout — destroy the session. */
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'logout_error' });
    res.json({ success: true });
  });
});

// ── Auth guard ───────────────────────────────────────────────────────────────

/** Middleware: reject any request without a valid authenticated session. */
function requireAuth(req, res, next) {
  if (req.session?.authenticated === true) return next();
  res.status(401).json({ error: 'not_authenticated' });
}

// ── Protected API routes ─────────────────────────────────────────────────────

/** GET /api/settings/milui — retrieve the current private מילוי preference. */
app.get('/api/settings/milui', requireAuth, async (_req, res) => {
  try {
    await ensureMiluiPreferences();
    const result = await pool.query(
      `SELECT preset_name, mapping
       FROM milui_preferences
       WHERE id = 'private-default'`
    );
    const row = result.rows[0];
    if (!row) {
      return res.json({ presetName: MILUI_PRESET_NAME, mapping: MILUI_DEFAULT_MAPPING });
    }
    res.json({ presetName: row.preset_name, mapping: row.mapping });
  } catch (err) {
    console.error('/api/settings/milui GET error:', err.message);
    res.status(500).json({ error: 'milui_settings_failed' });
  }
});

/** PUT /api/settings/milui — validate and persist the current private preference. */
app.put('/api/settings/milui', requireAuth, async (req, res) => {
  const checked = normalizeMiluiMapping(req.body?.mapping);
  if (!checked.valid) {
    return res.status(400).json({ error: 'invalid_milui_mapping', message: checked.error });
  }

  try {
    await ensureMiluiPreferences();
    const activated = await rebuildAndActivateMiluiMapping(checked.mapping, {
      presetName: MILUI_PRESET_NAME,
    });
    res.json({
      presetName: activated.presetName,
      mapping: activated.mapping,
      mappingVersion: activated.version,
    });
  } catch (err) {
    console.error('/api/settings/milui PUT error:', err.message);
    if (err.code === 'MILUI_REBUILD_IN_PROGRESS') {
      return res.status(409).json({ error: 'milui_rebuild_in_progress' });
    }
    res.status(500).json({ error: 'milui_settings_failed' });
  }
});

/** GET /api/tanach/books — canonical 24-book navigation and source metadata. */
app.get('/api/tanach/books', requireAuth, async (_req, res) => {
  try {
    const [booksResult, sourceResult, countResult, parshiotResult] = await Promise.all([
      pool.query(
        `SELECT slug, canonical_order, segment_order, canonical_name, hebrew_name,
                english_name, chapter_count
         FROM tanach_books
         ORDER BY canonical_order, segment_order`
      ),
      pool.query(
        `SELECT name, version, build, published_at, attribution, license, source_url,
                representation_version, imported_at
         FROM tanach_sources ORDER BY imported_at DESC LIMIT 1`
      ),
      pool.query('SELECT COUNT(*)::int AS verse_count FROM tanach_verses'),
      pool.query(
        `SELECT p.id, p.canonical_order, p.name_he,
                p.start_book_slug, p.start_chapter, p.start_verse,
                p.end_book_slug, p.end_chapter, p.end_verse,
                start_book.hebrew_name AS start_book_name,
                end_book.hebrew_name AS end_book_name
         FROM tanach_parshiot p
         JOIN tanach_books start_book ON start_book.slug = p.start_book_slug
         JOIN tanach_books end_book ON end_book.slug = p.end_book_slug
         ORDER BY p.canonical_order`
      ),
    ]);
    const canonicalMap = new Map();
    for (const segment of booksResult.rows) {
      if (!canonicalMap.has(segment.canonical_order)) {
        const section = segment.canonical_order <= 5
          ? { id: 'torah', name_he: 'תורה' }
          : segment.canonical_order <= 13
            ? { id: 'prophets', name_he: 'נביאים' }
            : { id: 'writings', name_he: 'כתובים' };
        canonicalMap.set(segment.canonical_order, {
          order: segment.canonical_order,
          name: segment.canonical_name,
          section,
          segments: [],
        });
      }
      canonicalMap.get(segment.canonical_order).segments.push(segment);
    }
    res.json({
      books: booksResult.rows,
      canonicalBooks: [...canonicalMap.values()],
      parshiot: parshiotResult.rows,
      source: sourceResult.rows[0] || null,
      stats: {
        canonicalBooks: canonicalMap.size,
        sourceSegments: booksResult.rowCount,
        verses: countResult.rows[0].verse_count,
      },
    });
  } catch (err) {
    console.error('/api/tanach/books error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/tanach/verses?book=Genesis&chapter=1 */
app.get('/api/tanach/verses', requireAuth, async (req, res) => {
  try {
    const book = typeof req.query.book === 'string' ? req.query.book : '';
    const chapter = Number(req.query.chapter);
    if (!book || !Number.isInteger(chapter) || chapter < 1) {
      return res.status(400).json({ error: 'invalid_reference' });
    }
    const result = await pool.query(
      `SELECT v.book_slug, b.hebrew_name AS book_name, v.chapter, v.verse, v.display_text,
              CHAR_LENGTH(REPLACE(v.normalized_text, ' ', '')) AS letter_count
       FROM tanach_verses v
       JOIN tanach_books b ON b.slug = v.book_slug
       WHERE v.book_slug = $1 AND v.chapter = $2
       ORDER BY v.verse`,
      [book, chapter]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'reference_not_found' });
    res.json({ verses: result.rows });
  } catch (err) {
    console.error('/api/tanach/verses error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/tanach/verse?book=Genesis&chapter=1&verse=1 */
app.get('/api/tanach/verse', requireAuth, async (req, res) => {
  try {
    const book = typeof req.query.book === 'string' ? req.query.book : '';
    const chapter = Number(req.query.chapter);
    const verse = Number(req.query.verse);
    if (!book || !Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(verse) || verse < 1) {
      return res.status(400).json({ error: 'invalid_reference' });
    }
    const result = await pool.query(
      `SELECT v.book_slug, b.hebrew_name AS book_name, b.chapter_count, v.chapter, v.verse,
              v.display_text, v.normalized_text, s.attribution
       FROM tanach_verses v
       JOIN tanach_books b ON b.slug = v.book_slug
       JOIN tanach_sources s ON s.id = v.source_id
       WHERE v.book_slug = $1 AND v.chapter = $2 AND v.verse = $3`,
      [book, chapter, verse]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'reference_not_found' });
    res.json({ verse: result.rows[0] });
  } catch (err) {
    console.error('/api/tanach/verse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/tanach/search?q=...&limit=20 */
app.get('/api/tanach/search', requireAuth, async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    if (query.length < 2) return res.json({ results: [] });
    const [namesResult, parshiotResult] = await Promise.all([
      pool.query(
        'SELECT slug, hebrew_name, canonical_name, chapter_count FROM tanach_books ORDER BY LENGTH(hebrew_name) DESC'
      ),
      pool.query(
        `SELECT p.id, p.name_he, p.start_book_slug AS book_slug,
                start_book.hebrew_name AS book_name, p.start_chapter AS chapter, p.start_verse AS verse
         FROM tanach_parshiot p
         JOIN tanach_books start_book ON start_book.slug = p.start_book_slug
         ORDER BY p.canonical_order`
      ),
    ]);
    const cleanQuery = query.replace(/[״׳"']/g, '');
    const queryParshaKey = parshaSearchKey(cleanQuery);
    const namedCandidates = namesResult.rows.flatMap(book => ([
      { slug: book.slug, name: book.hebrew_name.replace(/[״׳"']/g, ''), chapterCount: book.chapter_count },
      { slug: book.slug, name: book.canonical_name.replace(/[״׳"']/g, ''), chapterCount: book.chapter_count },
    ]));
    const matchedName = namedCandidates
      .filter(candidate => cleanQuery === candidate.name || cleanQuery.startsWith(`${candidate.name} `))
      .sort((a, b) => b.name.length - a.name.length)[0]?.name;
    if (matchedName) {
      const matchingSlugs = [...new Set(
        namedCandidates.filter(candidate => candidate.name === matchedName).map(candidate => candidate.slug)
      )];
      const maximumChapter = Math.max(
        ...namedCandidates
          .filter(candidate => candidate.name === matchedName)
          .map(candidate => candidate.chapterCount)
      );
      const remainder = cleanQuery.slice(matchedName.length).trim();
      if (!remainder) {
        const bookChoices = matchingSlugs.map(slug => {
          const book = namesResult.rows.find(row => row.slug === slug);
          return {
            type: 'book',
            book_slug: book.slug,
            book_name: book.hebrew_name,
            chapter: 1,
            verse: 1,
            label: `ספר ${book.hebrew_name}`,
          };
        });
        const parshaChoices = parshiotResult.rows
          .filter(parsha => parshaSearchKey(parsha.name_he).includes(queryParshaKey))
          .map(parsha => ({
            type: 'parsha',
            parsha_id: parsha.id,
            parsha_name: parsha.name_he,
            book_slug: parsha.book_slug,
            book_name: parsha.book_name,
            chapter: parsha.chapter,
            verse: parsha.verse,
            label: `פרשת ${parsha.name_he}`,
          }));
        return res.json({ results: [...bookChoices, ...parshaChoices].slice(0, limit) });
      }
      const referenceParts = remainder.split(/[\s:.,]+/).filter(Boolean);
      const parseReferenceNumber = value => !value ? null : /^\d+$/.test(value)
        ? Number(value)
        : computeAll(value)?.fullGematria;
      const chapter = parseReferenceNumber(referenceParts[0]);
      const verse = parseReferenceNumber(referenceParts[1]);
      if (chapter && chapter <= maximumChapter && referenceParts.length <= 2) {
        const referenceResult = await pool.query(
          `SELECT v.book_slug, b.hebrew_name AS book_name, v.chapter, v.verse, v.display_text
           FROM tanach_verses v
           JOIN tanach_books b ON b.slug = v.book_slug
           WHERE v.book_slug = ANY($1::text[])
             AND v.chapter = $2
             AND ($3::int IS NULL OR v.verse = $3)
           ORDER BY b.canonical_order, b.segment_order
           LIMIT $4`,
          [matchingSlugs, chapter, verse, limit]
        );
        return res.json({ results: referenceResult.rows });
      }
    }
    const parshaChoices = parshiotResult.rows
      .filter(parsha => parshaSearchKey(parsha.name_he).includes(queryParshaKey))
      .map(parsha => ({
        type: 'parsha',
        parsha_id: parsha.id,
        parsha_name: parsha.name_he,
        book_slug: parsha.book_slug,
        book_name: parsha.book_name,
        chapter: parsha.chapter,
        verse: parsha.verse,
        label: `פרשת ${parsha.name_he}`,
      }));
    if (parshaChoices.length) return res.json({ results: parshaChoices.slice(0, limit) });
    const normalizedQuery = normalize(query);
    const result = await pool.query(
      `SELECT v.book_slug, b.hebrew_name AS book_name, v.chapter, v.verse, v.display_text
       FROM tanach_verses v
       JOIN tanach_books b ON b.slug = v.book_slug
       WHERE b.hebrew_name ILIKE $1
          OR b.canonical_name ILIKE $1
          OR b.english_name ILIKE $1
          OR ($2 <> '' AND (
            to_tsvector('simple', v.normalized_text) @@ plainto_tsquery('simple', $2)
            OR v.normalized_text ILIKE $3
          ))
       ORDER BY b.canonical_order, b.segment_order, v.chapter, v.verse
       LIMIT $4`,
      [`%${query}%`, normalizedQuery, `%${normalizedQuery}%`, limit]
    );
    res.json({ results: result.rows });
  } catch (err) {
    console.error('/api/tanach/search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/tanach/gematria-matches — exact, within-verse gematria ranges. */
app.get('/api/tanach/gematria-matches', requireAuth, async (req, res) => {
  const parsed = parseGematriaSearchQuery(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const scopeError = await validateTanachGematriaScope(pool, parsed);
    if (scopeError) return res.status(400).json({ error: scopeError });
    res.json(await searchTanachGematria(pool, parsed));
  } catch (err) {
    console.error('/api/tanach/gematria-matches error:', err.message);
    res.status(500).json({ error: 'tanach_gematria_search_failed' });
  }
});

/** GET /api/multiples — exact multiplication relationships in saved values. */
app.get('/api/multiples', requireAuth, async (req, res) => {
  const parsed = parseMultipleDiscoveryQuery(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    res.json(await searchSavedMultiples(pool, parsed.value));
  } catch (err) {
    console.error('/api/multiples error:', err.message);
    res.status(500).json({ error: 'multiple_discovery_failed' });
  }
});

/**
 * GET /api/matches
 * Query: normalizedText
 * Returns one result per saved entry with every applicable match reason.
 */
app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const { normalizedText } = req.query;
    const current = computeAll(typeof normalizedText === 'string' ? normalizedText : '');
    const g = current?.fullGematria || 0;
    const initialsTextCandidates = [...new Set(
      [current?.normalizedText, current?.initials]
        .filter(Boolean)
        .map(value => normalize(value).replace(/\s+/g, ''))
    )];

    const entryMatches = new Map();
    let isAlreadySaved = false;

    if (g > 0) {
      // Check if current phrase is already saved
      if (current?.normalizedText) {
        const hasTanachReference = typeof req.query.bookSlug === 'string' && req.query.bookSlug !== '';
        let chk;
        if (hasTanachReference) {
          const chapter = Number(req.query.chapter);
          const verse = Number(req.query.verse);
          const start = Number(req.query.start);
          const end = Number(req.query.end);
          if (!Number.isInteger(chapter) || !Number.isInteger(verse)
              || !Number.isInteger(start) || !Number.isInteger(end)
              || chapter < 1 || verse < 1 || start < 0 || end < start) {
            return res.status(400).json({ error: 'invalid_tanach_context' });
          }
          chk = await pool.query(
            `SELECT id FROM saved_entries
             WHERE tanach_book_slug = $1 AND tanach_chapter = $2
               AND tanach_verse = $3 AND tanach_start = $4 AND tanach_end = $5`,
            [req.query.bookSlug, chapter, verse, start, end]
          );
        } else {
          chk = await pool.query(
            `SELECT id FROM saved_entries
             WHERE tanach_book_slug IS NULL AND normalized_text = $1`,
            [current.normalizedText]
          );
        }
        isAlreadySaved = chk.rows.length > 0;
      }

      // Fetch every entry matching at least one entry-level criterion.
      const entriesRes = await pool.query(
        `SELECT id, original_text, normalized_text,
                full_gematria, full_gematria_hebrew,
                initials, initials_gematria, initials_gematria_hebrew,
                created_at
         FROM saved_entries
         WHERE full_gematria = $1
            OR initials_gematria = $1
            OR initials = ANY($2::text[])
         ORDER BY created_at DESC`,
        [g, initialsTextCandidates]
      );

      for (const entry of entriesRes.rows) {
        const normalizedInitials = normalize(entry.initials || '').replace(/\s+/g, '');
        const matchTypes = [];

        if (entry.full_gematria === g) matchTypes.push('full_gematria');
        if (initialsTextCandidates.includes(normalizedInitials)) matchTypes.push('initials_text');
        if (entry.initials_gematria === g) matchTypes.push('initials_gematria');

        entryMatches.set(entry.id, {
          type: 'entry',
          ...entry,
          matchTypes,
          matched_words: [],
        });
      }

      // Compare the current normal gematria with saved entries' full מילוי
      // values for the one active, completely built mapping version.
      const miluiMatches = await getActiveMiluiMatches(g);
      for (const miluiMatch of miluiMatches) {
        let result = entryMatches.get(miluiMatch.id);
        if (!result) {
          result = {
            type: 'entry',
            ...miluiMatch,
            matchTypes: [],
            matched_words: [],
          };
          entryMatches.set(miluiMatch.id, result);
        }
        if (!result.matchTypes.includes('milui_gematria')) {
          result.matchTypes.push('milui_gematria');
        }
      }

      // Attach matching words to their parent entry instead of duplicating cards.
      const wordsRes = await pool.query(
        `SELECT sw.id AS word_id, sw.word, sw.gematria,
                se.id, se.original_text, se.normalized_text,
                se.full_gematria, se.full_gematria_hebrew,
                se.initials, se.initials_gematria, se.initials_gematria_hebrew,
                se.created_at
         FROM saved_words sw
         JOIN saved_entries se ON sw.entry_id = se.id
         WHERE sw.gematria = $1
         ORDER BY se.created_at DESC, sw.position ASC`,
        [g]
      );

      for (const wordMatch of wordsRes.rows) {
        let result = entryMatches.get(wordMatch.id);
        if (!result) {
          result = {
            type: 'entry',
            id: wordMatch.id,
            original_text: wordMatch.original_text,
            normalized_text: wordMatch.normalized_text,
            full_gematria: wordMatch.full_gematria,
            full_gematria_hebrew: wordMatch.full_gematria_hebrew,
            initials: wordMatch.initials,
            initials_gematria: wordMatch.initials_gematria,
            initials_gematria_hebrew: wordMatch.initials_gematria_hebrew,
            created_at: wordMatch.created_at,
            matchTypes: [],
            matched_words: [],
          };
          entryMatches.set(wordMatch.id, result);
        }

        if (!result.matchTypes.includes('saved_word')) {
          result.matchTypes.push('saved_word');
        }
        result.matched_words.push({
          id: wordMatch.word_id,
          word: wordMatch.word,
          gematria: wordMatch.gematria,
        });
      }
    }

    const priority = [
      'full_gematria',
      'initials_text',
      'initials_gematria',
      'saved_word',
      'milui_gematria',
    ];
    for (const match of entryMatches.values()) {
      match.matchTypes.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
    }
    const matches = [...entryMatches.values()].sort((a, b) => {
      const aPriority = Math.min(...a.matchTypes.map(type => priority.indexOf(type)));
      const bPriority = Math.min(...b.matchTypes.map(type => priority.indexOf(type)));
      return aPriority - bPriority;
    });

    res.json({ matches, isAlreadySaved });
  } catch (err) {
    console.error('/api/matches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/entries — save a phrase with its words.
 */
app.post('/api/entries', requireAuth, async (req, res) => {
  let client;
  try {
    const { originalText, tanachContext } = req.body;
    let canonicalOriginalText = typeof originalText === 'string' ? originalText : '';
    let calculated = computeAll(canonicalOriginalText);

    if (!calculated) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await acquireMiluiSaveLock(client);

    let verifiedContext = null;
    if (tanachContext != null) {
      const bookSlug = typeof tanachContext.bookSlug === 'string' ? tanachContext.bookSlug : '';
      const chapter = Number(tanachContext.chapter);
      const verse = Number(tanachContext.verse);
      const start = Number(tanachContext.start);
      const end = Number(tanachContext.end);
      if (!bookSlug || !Number.isInteger(chapter) || !Number.isInteger(verse)
          || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'invalid_tanach_context' });
      }
      const verseResult = await client.query(
        `SELECT v.display_text, b.hebrew_name
         FROM tanach_verses v JOIN tanach_books b ON b.slug = v.book_slug
         WHERE v.book_slug = $1 AND v.chapter = $2 AND v.verse = $3`,
        [bookSlug, chapter, verse]
      );
      if (!verseResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'invalid_tanach_context' });
      }
      const cursor = createTanachCursor(verseResult.rows[0].display_text);
      const canonicalRange = cursor.range(start, end);
      if (end >= cursor.count || normalize(canonicalRange.text) !== calculated.normalizedText) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'tanach_range_mismatch' });
      }
      // Tanach provenance is authoritative: persist and derive calculations from
      // the local pointed/cantillated corpus, never from a client display variant.
      canonicalOriginalText = canonicalRange.text;
      calculated = computeAll(canonicalOriginalText);
      const parshaId = typeof tanachContext.parshaId === 'string' ? tanachContext.parshaId : null;
      let parsha = null;
      if (parshaId) {
        const parshaResult = await client.query(
          `SELECT p.id, p.name_he
           FROM tanach_parshiot p
           JOIN tanach_books start_book ON start_book.slug = p.start_book_slug
           JOIN tanach_books end_book ON end_book.slug = p.end_book_slug
           JOIN tanach_books current_book ON current_book.slug = $2
           WHERE p.id = $1
             AND (current_book.canonical_order, current_book.segment_order, $3::int, $4::int)
               >= (start_book.canonical_order, start_book.segment_order, p.start_chapter, p.start_verse)
             AND (current_book.canonical_order, current_book.segment_order, $3::int, $4::int)
               <= (end_book.canonical_order, end_book.segment_order, p.end_chapter, p.end_verse)`,
          [parshaId, bookSlug, chapter, verse]
        );
        if (!parshaResult.rowCount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'invalid_tanach_context' });
        }
        parsha = { id: parshaResult.rows[0].id, name: parshaResult.rows[0].name_he };
      }
      verifiedContext = {
        bookSlug, bookLabel: verseResult.rows[0].hebrew_name, chapter, verse, start, end,
        parshaId: parsha?.id || null, parshaName: parsha?.name || null,
      };
    }

    const exists = verifiedContext
      ? await client.query(
        `SELECT id FROM saved_entries
         WHERE tanach_book_slug = $1 AND tanach_chapter = $2
           AND tanach_verse = $3 AND tanach_start = $4 AND tanach_end = $5`,
        [
          verifiedContext.bookSlug,
          verifiedContext.chapter,
          verifiedContext.verse,
          verifiedContext.start,
          verifiedContext.end,
        ]
      )
      : await client.query(
        `SELECT id FROM saved_entries
         WHERE tanach_book_slug IS NULL AND normalized_text = $1`,
        [calculated.normalizedText]
      );
    if (exists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'already_saved', id: exists.rows[0].id });
    }

    const entryRes = await client.query(
      `INSERT INTO saved_entries
          (original_text, normalized_text, full_gematria, full_gematria_hebrew,
           initials, initials_gematria, initials_gematria_hebrew,
            tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse, tanach_start, tanach_end, parsha_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        canonicalOriginalText,
        calculated.normalizedText,
        calculated.fullGematria,
        calculated.fullHebrewNumber,
        calculated.initials,
        calculated.initialsGematria,
        calculated.initialsHebrewNumber,
        verifiedContext?.bookSlug || null,
        verifiedContext?.bookLabel || null,
        verifiedContext?.chapter || null,
        verifiedContext?.verse || null,
        verifiedContext?.start ?? null,
        verifiedContext?.end ?? null,
        verifiedContext?.parshaId || null,
      ]
    );
    const entryId = entryRes.rows[0].id;

    for (const w of calculated.words) {
      await client.query(
        `INSERT INTO saved_words (entry_id, word, normalized_word, gematria, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [entryId, w.word, w.word, w.gematria, w.position]
      );
    }

    await client.query('COMMIT');
    try {
      await indexSavedEntryForCurrentVersions(entryId);
    } catch (indexError) {
      invalidateMiluiCoverageCheck();
      console.error(`Saved entry ${entryId}, but מילוי indexing failed:`, indexError.message);
    }
    res.json({ id: entryId, success: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'already_saved' });
    }
    console.error('/api/entries POST error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client?.release();
  }
});

/**
 * GET /api/entries — list saved entries with optional search.
 */
app.get('/api/entries', requireAuth, async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 100);
    const off = parseInt(offset) || 0;

    let rows, countVal;

    if (search && !isNaN(search) && search.trim() !== '') {
      const g = parseInt(search);
      const r = await pool.query(
        `SELECT se.id, se.original_text, se.normalized_text, se.full_gematria,
                se.full_gematria_hebrew, se.initials, se.initials_gematria,
                 se.initials_gematria_hebrew, se.created_at,
                 se.tanach_book_slug, se.tanach_book_label, se.tanach_chapter,
                 se.tanach_verse, se.tanach_start, se.tanach_end, se.parsha_id,
                 (SELECT name_he FROM tanach_parshiot WHERE id = se.parsha_id) AS parsha_name,
                COALESCE(json_agg(sw ORDER BY sw.position) FILTER (WHERE sw.id IS NOT NULL), '[]') AS words
         FROM saved_entries se
         LEFT JOIN saved_words sw ON sw.entry_id = se.id
         WHERE se.full_gematria = $1
         GROUP BY se.id ORDER BY se.created_at DESC LIMIT $2 OFFSET $3`,
        [g, lim, off]
      );
      const c = await pool.query('SELECT COUNT(*) FROM saved_entries WHERE full_gematria = $1', [g]);
      rows = r.rows; countVal = parseInt(c.rows[0].count);
    } else if (search) {
      const r = await pool.query(
        `SELECT se.id, se.original_text, se.normalized_text, se.full_gematria,
                se.full_gematria_hebrew, se.initials, se.initials_gematria,
                 se.initials_gematria_hebrew, se.created_at,
                 se.tanach_book_slug, se.tanach_book_label, se.tanach_chapter,
                 se.tanach_verse, se.tanach_start, se.tanach_end, se.parsha_id,
                 (SELECT name_he FROM tanach_parshiot WHERE id = se.parsha_id) AS parsha_name,
                COALESCE(json_agg(sw ORDER BY sw.position) FILTER (WHERE sw.id IS NOT NULL), '[]') AS words
         FROM saved_entries se
         LEFT JOIN saved_words sw ON sw.entry_id = se.id
         WHERE se.original_text ILIKE $1 OR se.normalized_text ILIKE $1
         GROUP BY se.id ORDER BY se.created_at DESC LIMIT $2 OFFSET $3`,
        [`%${search}%`, lim, off]
      );
      const c = await pool.query(
        'SELECT COUNT(*) FROM saved_entries WHERE original_text ILIKE $1 OR normalized_text ILIKE $1',
        [`%${search}%`]
      );
      rows = r.rows; countVal = parseInt(c.rows[0].count);
    } else {
      const r = await pool.query(
        `SELECT se.id, se.original_text, se.normalized_text, se.full_gematria,
                se.full_gematria_hebrew, se.initials, se.initials_gematria,
                 se.initials_gematria_hebrew, se.created_at,
                 se.tanach_book_slug, se.tanach_book_label, se.tanach_chapter,
                 se.tanach_verse, se.tanach_start, se.tanach_end, se.parsha_id,
                 (SELECT name_he FROM tanach_parshiot WHERE id = se.parsha_id) AS parsha_name,
                COALESCE(json_agg(sw ORDER BY sw.position) FILTER (WHERE sw.id IS NOT NULL), '[]') AS words
         FROM saved_entries se
         LEFT JOIN saved_words sw ON sw.entry_id = se.id
         GROUP BY se.id ORDER BY se.created_at DESC LIMIT $1 OFFSET $2`,
        [lim, off]
      );
      const c = await pool.query('SELECT COUNT(*) FROM saved_entries');
      rows = r.rows; countVal = parseInt(c.rows[0].count);
    }

    res.json({ entries: rows, total: countVal });
  } catch (err) {
    console.error('/api/entries GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/entries/:id
 */
app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  let client;
  try {
    const id = parseInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    client = await pool.connect();
    await client.query('BEGIN');
    await acquireMiluiSaveLock(client);
    await client.query(
      'SELECT id FROM saved_entries WHERE id = $1 FOR UPDATE',
      [id]
    );
    await deleteMiluiIndexRows(client, id);
    await client.query('DELETE FROM saved_entries WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('/api/entries DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client?.release();
  }
});
