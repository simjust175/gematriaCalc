/**
 * server/app.js — Express application (exported for testing).
 * Does NOT call app.listen() — that lives in server/index.js.
 */
import express from 'express';
import session from 'express-session';
import { timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { multiUserPool, routedPool } from './databaseRouter.js';
import { setRequestDatabase } from './requestDatabase.js';
import { RoleRoutedSessionStore, LEGACY_PREFIX, MULTI_USER_PREFIX } from './sessionStore.js';
import {
  SIGNUP_ENABLED,
  authenticateStandardAccount,
  createStandardAccount,
  getAccountById,
  getLegacyAccount,
  serializeAccount,
} from './accounts.js';
import { computeAll, normalize } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { verifyTanachSaveContext } from './tanachSaveContext.js';
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
import { registerBaseWordRoutes } from './baseWords.js';
import {
  getExplicitMiluiMatches,
  recordMiluiSaveMode,
  registerMiluiInterpretationRoutes,
} from './miluiInterpretations.js';
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
  ensureMiluiOwnerState,
  getActiveMiluiMatches,
  indexSavedEntryForCurrentVersions,
  invalidateMiluiCoverageCheck,
  rebuildAndActivateMiluiMapping,
} from './miluiIndex.js';
import {
  createDerivedLetterProfile,
  matchesAnyDerivedLetterProfile,
} from './derivedLetterMatching.js';

export const app = express();
// Private CRUD remains on the legacy path in this authentication/session-only
// step. Route-level database selection is intentionally deferred.
// Every authenticated route receives its database through AsyncLocalStorage.
// This alias is request-routed and never falls back across account roles.
const pool = routedPool;

// ── Middleware ───────────────────────────────────────────────────────────────

// The deployment terminates TLS before forwarding requests to the app. Trusting
// that proxy lets secure session cookies be issued in production.
app.set('trust proxy', 1);
app.use(express.json());
app.use(requireApplicationReady);

function sessionIdFromRequest(req) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)connect\.sid=([^;]+)/)?.[1];
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie).replace(/^s:/, '').split('.')[0];
  } catch {
    return null;
  }
}

app.use((req, res, next) => {
  const sid = sessionIdFromRequest(req);
  if (sid?.startsWith(MULTI_USER_PREFIX) && !multiUserPool) {
    return res.status(503).json({ error: 'multi_user_unavailable' });
  }
  next();
});

// Sessions live in PostgreSQL so autoscaled instances share the same login
// state. No external CORS headers: all API access is same-origin through Vite.
app.use(session({
  secret: process.env.SESSION_SECRET || (() => {
    throw new Error('SESSION_SECRET environment variable must be set');
  })(),
  genid: req => (
    req.session?.databaseRole === 'multi-user'
      || req.path === '/api/auth/account-login'
      || req.path === '/api/auth/signup'
      ? `${MULTI_USER_PREFIX}${randomUUID()}`
      : `${LEGACY_PREFIX}${randomUUID()}`
  ),
  store: new RoleRoutedSessionStore({ legacyPool, multiUserPool }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

// ── Public auth routes ───────────────────────────────────────────────────────

/** GET /api/health — readiness signal for diagnostics and deployment checks. */
app.get('/api/health', (_req, res) => {
  res.json({ ready: isApplicationReady() });
});

/** POST /api/auth/login — validate APP_PASSWORD and create session. */
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return res.status(503).json({
      error: 'app_not_configured',
      message: 'APP_PASSWORD secret is not set. Add it in Replit Secrets.',
    });
  }
  const suppliedBuffer = Buffer.from(typeof password === 'string' ? password : '');
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length
      || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'invalid_password' });
  }

  try {
      const account = await getLegacyAccount(legacyPool);
    req.session.regenerate(error => {
      if (error) return res.status(500).json({ error: 'session_error' });
      req.session.authenticated = true;
        req.session.databaseRole = 'legacy';
      req.session.accountId = Number(account.id);
      req.session.save(err => {
        if (err) return res.status(500).json({ error: 'session_error' });
        res.json({ success: true });
      });
    });
  } catch (error) {
    console.error('/api/auth/login account error:', error.message);
    res.status(500).json({ error: 'session_error' });
  }
});

async function resolveSessionAccount(req) {
  if (req.session?.authenticated !== true) return null;
  const role = req.session.databaseRole || 'legacy';
  if (role === 'multi-user' && !multiUserPool) {
    const error = new Error('Multi-user database is unavailable');
    error.code = 'MULTI_USER_DATABASE_UNAVAILABLE';
    throw error;
  }
  let account = role === 'multi-user'
    ? (req.session.accountId
      ? await getAccountById(multiUserPool, req.session.accountId)
      : null)
    : await getLegacyAccount(legacyPool);
  // Preserve existing authenticated client sessions created before account
  // identity was introduced by resolving them once to the hidden legacy account.
  if (!account && !req.session.accountId) {
    account = await getLegacyAccount(legacyPool);
    req.session.databaseRole = 'legacy';
    req.session.accountId = Number(account.id);
    await new Promise((resolve, reject) => req.session.save(error => (
      error ? reject(error) : resolve()
    )));
  }
  return account;
}

/** GET /api/auth/check — returns current authentication state. */
app.get('/api/auth/check', async (req, res) => {
  try {
    const account = await resolveSessionAccount(req);
    res.json({
      authenticated: Boolean(account),
      ...(account ? { account: serializeAccount(account) } : {}),
    });
  } catch (error) {
    console.error('/api/auth/check error:', error.message);
    res.status(500).json({ error: 'session_error' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  if (!SIGNUP_ENABLED) return res.status(404).json({ error: 'not_found' });
  if (!multiUserPool) return res.status(503).json({ error: 'multi_user_unavailable' });
  try {
    const account = await createStandardAccount(multiUserPool, req.body || {});
    req.session.regenerate(error => {
      if (error) return res.status(500).json({ error: 'session_error' });
      req.session.authenticated = true;
      req.session.databaseRole = 'multi-user';
      req.session.accountId = Number(account.id);
      req.session.save(err => {
        if (err) return res.status(500).json({ error: 'session_error' });
        res.status(201).json({ success: true, account: serializeAccount(account) });
      });
    });
  } catch (error) {
    if (error.code === 'INVALID_EMAIL' || error.code === 'INVALID_PASSWORD') {
      return res.status(400).json({ error: error.code.toLowerCase() });
    }
    if (error.code === 'ACCOUNT_EXISTS') {
      return res.status(409).json({ error: 'account_exists' });
    }
    console.error('/api/auth/signup error:', error.message);
    res.status(500).json({ error: 'account_create_failed' });
  }
});

app.post('/api/auth/account-login', async (req, res) => {
  if (!multiUserPool) return res.status(503).json({ error: 'multi_user_unavailable' });
  try {
    const account = await authenticateStandardAccount(multiUserPool, req.body || {});
    if (!account) return res.status(401).json({ error: 'invalid_credentials' });
    req.session.regenerate(error => {
      if (error) return res.status(500).json({ error: 'session_error' });
      req.session.authenticated = true;
      req.session.databaseRole = 'multi-user';
      req.session.accountId = Number(account.id);
      req.session.save(err => {
        if (err) return res.status(500).json({ error: 'session_error' });
        res.json({ success: true, account: serializeAccount(account) });
      });
    });
  } catch (error) {
    console.error('/api/auth/account-login error:', error.message);
    res.status(500).json({ error: 'account_login_failed' });
  }
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
async function requireAuth(req, res, next) {
  try {
    const account = await resolveSessionAccount(req);
    if (!account) return res.status(401).json({ error: 'not_authenticated' });
    req.account = account;
    req.databaseRole = req.session.databaseRole || 'legacy';
    req.database = req.databaseRole === 'multi-user' ? multiUserPool : legacyPool;
    if (!req.database) return res.status(503).json({ error: 'multi_user_unavailable' });
    setRequestDatabase(req.database);
    next();
  } catch (error) {
    next(error);
  }
}

// ── Protected API routes ─────────────────────────────────────────────────────

registerBaseWordRoutes(app, { pool, requireAuth });
registerMiluiInterpretationRoutes(app, {
  pool,
  requireAuth,
  acquireSaveLock: acquireMiluiSaveLock,
  indexSavedEntry: indexSavedEntryForCurrentVersions,
  invalidateCoverage: invalidateMiluiCoverageCheck,
});

/** GET /api/settings/milui — retrieve the current private מילוי preference. */
app.get('/api/settings/milui', requireAuth, async (req, res) => {
  try {
    await ensureMiluiOwnerState(pool, req.account.id);
    const result = await pool.query(
      `SELECT preset_name, mapping
       FROM milui_preferences
       WHERE owner_id = $1`,
      [req.account.id]
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
    const activated = await rebuildAndActivateMiluiMapping(checked.mapping, {
      presetName: MILUI_PRESET_NAME,
      ownerId: req.account.id,
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
    res.json(await searchSavedMultiples(pool, parsed.value, req.account.id));
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
    // ראשי/סופי text matching always uses the complete entered target.
    // Do not also use the target phrase's own derived edge letters: for a
    // one-word target such as שבת that would reduce the target to ש/ת and
    // incorrectly accept a one-word saved candidate.
    const textTarget = normalize(current?.normalizedText || '').replace(/\s+/g, '');
    const initialsTextCandidates = textTarget ? [textTarget] : [];
    const finalsTextCandidates = textTarget ? [textTarget] : [];
    const initialsProfiles = initialsTextCandidates
      .map(value => createDerivedLetterProfile(value, 'initials'));
    const finalsProfiles = finalsTextCandidates
      .map(value => createDerivedLetterProfile(value, 'finals'));
    const initialsCandidateGematria = [...new Set(initialsProfiles.map(profile => profile.gematria))];
    const finalsCandidateGematria = [...new Set(finalsProfiles.map(profile => profile.gematria))];

    const entryMatches = new Map();
    let isAlreadySaved = false;
    let allMiluiFormsSaved = false;

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
            `SELECT entry.id, mode.save_mode
             FROM saved_entries entry
             LEFT JOIN saved_entry_milui_save_modes mode
                ON mode.saved_entry_id = entry.id AND mode.owner_id = entry.owner_id
             WHERE entry.tanach_book_slug = $1 AND entry.tanach_chapter = $2
                AND entry.tanach_verse = $3 AND entry.tanach_start = $4 AND entry.tanach_end = $5
                AND entry.owner_id = $6`,
            [req.query.bookSlug, chapter, verse, start, end, req.account.id]
          );
        } else {
          chk = await pool.query(
            `SELECT entry.id, mode.save_mode
             FROM saved_entries entry
             LEFT JOIN saved_entry_milui_save_modes mode
                ON mode.saved_entry_id = entry.id AND mode.owner_id = entry.owner_id
              WHERE entry.tanach_book_slug IS NULL AND entry.normalized_text = $1
                AND entry.owner_id = $2`,
            [current.normalizedText, req.account.id]
          );
        }
        isAlreadySaved = chk.rows.length > 0;
        allMiluiFormsSaved = chk.rows.some(row => row.save_mode === 'all_forms');
      }

      // Fetch every entry matching at least one entry-level criterion.
      const entriesRes = await pool.query(
        `SELECT id, original_text, normalized_text,
                full_gematria, full_gematria_hebrew,
                 initials, initials_gematria, initials_gematria_hebrew,
                 finals, finals_gematria, finals_gematria_hebrew,
                created_at
         FROM saved_entries
          WHERE owner_id = $6
            AND (full_gematria = $1
             OR initials_gematria = $1
             OR initials = ANY($2::text[])
             OR initials_gematria = ANY($4::integer[])
             OR finals_gematria = $1
             OR finals = ANY($3::text[])
             OR finals_gematria = ANY($5::integer[]))
         ORDER BY created_at DESC`,
        [
          g,
          initialsTextCandidates,
          finalsTextCandidates,
          initialsCandidateGematria,
          finalsCandidateGematria,
          req.account.id,
        ]
      );

      for (const entry of entriesRes.rows) {
        const normalizedInitials = normalize(entry.initials || '').replace(/\s+/g, '');
        const normalizedFinals = normalize(entry.finals || '').replace(/\s+/g, '');
        const matchTypes = [];

        if (entry.full_gematria === g) matchTypes.push('full_gematria');
        if (matchesAnyDerivedLetterProfile(normalizedInitials, initialsProfiles, 'initials')) {
          matchTypes.push('initials_text');
        }
        if (entry.initials_gematria === g) matchTypes.push('initials_gematria');
        if (matchesAnyDerivedLetterProfile(normalizedFinals, finalsProfiles, 'finals')) {
          matchTypes.push('finals_text');
        }
        if (entry.finals_gematria === g) matchTypes.push('finals_gematria');

        if (!matchTypes.length) continue;
        entryMatches.set(entry.id, {
          type: 'entry',
          ...entry,
          matchTypes,
          matched_words: [],
        });
      }

      // Compare the current ordinary full gematria with the active primary
      // מילוי index and every explicitly persisted all-form interpretation.
      let miluiMatches = [];
      try {
        miluiMatches = await getActiveMiluiMatches(g, pool, req.account.id);
      } catch (miluiError) {
        console.error('Milui matching temporarily unavailable:', miluiError.message);
      }
      for (const miluiMatch of miluiMatches) {
        let result = entryMatches.get(miluiMatch.id);
        if (!result) {
          result = {
            type: 'entry',
            ...miluiMatch,
            matchTypes: [],
            matched_words: [],
            matched_milui_variants: [],
          };
          entryMatches.set(miluiMatch.id, result);
        }
        if (!result.matchTypes.includes('milui_gematria')) {
          result.matchTypes.push('milui_gematria');
        }
        result.full_milui_gematria = miluiMatch.full_milui_gematria;
        result.matched_milui_variants = [
          ...(result.matched_milui_variants || []),
          ...(miluiMatch.matched_milui_variants || []),
        ];
      }

      const explicitMiluiTotal = Number(req.query.explicitMiluiTotal);
      if (Number.isInteger(explicitMiluiTotal) && explicitMiluiTotal > 0) {
        const explicitMatches = await getExplicitMiluiMatches(
          explicitMiluiTotal,
          pool,
          req.account.id
        );
        for (const explicitMatch of explicitMatches) {
          const resultKey = explicitMatch.id || `milui-${explicitMatch.interpretation_id}`;
          let result = entryMatches.get(resultKey);
          if (!result) {
            result = {
              type: explicitMatch.id ? 'entry' : 'milui_interpretation',
              id: resultKey,
              original_text: explicitMatch.original_text
                || explicitMatch.interpretation_original_text,
              normalized_text: explicitMatch.normalized_text,
              full_gematria: explicitMatch.full_gematria,
              full_gematria_hebrew: explicitMatch.full_gematria_hebrew,
              initials: explicitMatch.initials,
              initials_gematria: explicitMatch.initials_gematria,
              initials_gematria_hebrew: explicitMatch.initials_gematria_hebrew,
              created_at: explicitMatch.created_at,
              matchTypes: [],
              matched_words: [],
            };
            entryMatches.set(resultKey, result);
          }
          if (!result.matchTypes.includes('milui_gematria')) {
            result.matchTypes.push('milui_gematria');
          }
          result.full_milui_gematria = explicitMatch.full_milui_gematria;
          result.matched_milui_variants = [
            ...(result.matched_milui_variants || []),
            {
              value: explicitMatch.full_milui_gematria,
              expandedText: explicitMatch.interpretation_expanded_text,
              interpretationId: explicitMatch.interpretation_id,
              source: 'selected_variant',
            },
          ];
          result.explicit_milui_interpretation_ids = [
            ...new Set([
              ...(result.explicit_milui_interpretation_ids || []),
              explicitMatch.interpretation_id,
            ]),
          ];
        }
      }

      // Attach matching words to their parent entry instead of duplicating cards.
      const wordsRes = await pool.query(
        `SELECT sw.id AS word_id, sw.word, sw.gematria,
                se.id, se.original_text, se.normalized_text,
                se.full_gematria, se.full_gematria_hebrew,
                se.initials, se.initials_gematria, se.initials_gematria_hebrew,
                se.finals, se.finals_gematria, se.finals_gematria_hebrew,
                se.created_at
         FROM saved_words sw
         JOIN saved_entries se ON sw.entry_id = se.id
          WHERE sw.gematria = $1
            AND sw.owner_id = $2
            AND se.owner_id = $2
         ORDER BY se.created_at DESC, sw.position ASC`,
        [g, req.account.id]
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
            finals: wordMatch.finals,
            finals_gematria: wordMatch.finals_gematria,
            finals_gematria_hebrew: wordMatch.finals_gematria_hebrew,
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
      'finals_text',
      'finals_gematria',
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

    res.json({ matches, isAlreadySaved, allMiluiFormsSaved });
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
    if (calculated.inputMode === 'numeric') {
      return res.status(400).json({ error: 'numeric_entry_not_supported' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await acquireMiluiSaveLock(client);

    let verifiedContext = null;
    if (tanachContext != null) {
      try {
        const verified = await verifyTanachSaveContext(canonicalOriginalText, tanachContext, client);
        canonicalOriginalText = verified.originalText;
        calculated = verified.calculated;
        verifiedContext = verified.context;
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === 'INVALID_TANACH_CONTEXT') {
          return res.status(400).json({ error: 'invalid_tanach_context' });
        }
        if (error.code === 'TANACH_RANGE_MISMATCH') {
          return res.status(400).json({ error: 'tanach_range_mismatch' });
        }
        throw error;
      }
    }

    const exists = verifiedContext
      ? await client.query(
        `SELECT id FROM saved_entries
         WHERE tanach_book_slug = $1 AND tanach_chapter = $2
            AND tanach_verse = $3 AND tanach_start = $4 AND tanach_end = $5
            AND owner_id = $6`,
        [
          verifiedContext.bookSlug,
          verifiedContext.chapter,
          verifiedContext.verse,
          verifiedContext.start,
          verifiedContext.end,
          req.account.id,
        ]
      )
      : await client.query(
        `SELECT id FROM saved_entries
         WHERE tanach_book_slug IS NULL AND normalized_text = $1 AND owner_id = $2`,
        [calculated.normalizedText, req.account.id]
      );
    if (exists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'already_saved', id: exists.rows[0].id });
    }

    const entryRes = await client.query(
      `INSERT INTO saved_entries
           (owner_id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
           initials, initials_gematria, initials_gematria_hebrew,
           finals, finals_gematria, finals_gematria_hebrew,
             tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse, tanach_start, tanach_end, parsha_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        req.account.id,
        canonicalOriginalText,
        calculated.normalizedText,
        calculated.fullGematria,
        calculated.fullHebrewNumber,
        calculated.initials,
        calculated.initialsGematria,
        calculated.initialsHebrewNumber,
        calculated.finals,
        calculated.finalsGematria,
        calculated.finalsHebrewNumber,
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
        `INSERT INTO saved_words (owner_id, entry_id, word, normalized_word, gematria, position)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.account.id, entryId, w.word, w.word, w.gematria, w.position]
      );
    }
    await recordMiluiSaveMode(entryId, 'primary_only', ['primary'], client, req.account.id);

    await client.query('COMMIT');
    try {
      await indexSavedEntryForCurrentVersions(entryId, pool, req.account.id);
    } catch (indexError) {
      invalidateMiluiCoverageCheck(req.account.id);
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

const CURATED_REASON_CODES = new Set([
  'full_gematria', 'initials_text', 'initials_gematria',
  'finals_text', 'finals_gematria', 'saved_word', 'milui_gematria',
]);

function serializeCuratedMatch(row) {
  return {
    id: row.id,
    originalText: row.original_text,
    tanachContext: {
      bookSlug: row.tanach_book_slug,
      bookLabel: row.tanach_book_label,
      chapter: row.tanach_chapter,
      verse: row.tanach_verse,
      start: row.tanach_start,
      end: row.tanach_end,
    },
    reasonCodes: row.reason_codes || [],
  };
}

/**
 * Save discovery results beneath a manually saved parent. Unlike ordinary
 * entry saves, repeated coordinates are intentionally idempotent and merge
 * their explanation codes.
 */
app.post('/api/entries/curated-matches', requireAuth, async (req, res) => {
  let client;
  try {
    const { parentOriginalText, matches } = req.body || {};
    if (typeof parentOriginalText !== 'string' || !parentOriginalText.trim()
        || !Array.isArray(matches) || !matches.length) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const parentCalculated = computeAll(parentOriginalText);
    if (!parentCalculated || parentCalculated.inputMode === 'numeric') {
      return res.status(400).json({ error: 'invalid_parent' });
    }
    for (const match of matches) {
      if (!match || typeof match.originalText !== 'string'
          || !match.tanachContext || !CURATED_REASON_CODES.has(match.reasonCode)) {
        return res.status(400).json({ error: 'invalid_match' });
      }
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await acquireMiluiSaveLock(client);
    const parentResult = await client.query(
      `SELECT id FROM saved_entries
       WHERE tanach_book_slug IS NULL AND normalized_text = $1 AND owner_id = $2
       FOR UPDATE`,
      [parentCalculated.normalizedText, req.account.id]
    );
    let parentId;
    let parentCreated = false;
    if (parentResult.rowCount) {
      parentId = parentResult.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO saved_entries
          (owner_id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
           initials, initials_gematria, initials_gematria_hebrew,
           finals, finals_gematria, finals_gematria_hebrew)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (owner_id, normalized_text) WHERE tanach_book_slug IS NULL DO NOTHING
         RETURNING id`,
        [req.account.id, parentOriginalText, parentCalculated.normalizedText, parentCalculated.fullGematria,
          parentCalculated.fullHebrewNumber, parentCalculated.initials,
          parentCalculated.initialsGematria, parentCalculated.initialsHebrewNumber,
          parentCalculated.finals, parentCalculated.finalsGematria,
          parentCalculated.finalsHebrewNumber]
      );
      if (inserted.rowCount) {
        parentId = inserted.rows[0].id;
        parentCreated = true;
        for (const word of parentCalculated.words) {
          await client.query(
            `INSERT INTO saved_words (owner_id, entry_id, word, normalized_word, gematria, position)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.account.id, parentId, word.word, word.word, word.gematria, word.position]
          );
        }
        await recordMiluiSaveMode(parentId, 'primary_only', ['primary'], client, req.account.id);
      } else {
        const existing = await client.query(
          `SELECT id FROM saved_entries
            WHERE tanach_book_slug IS NULL AND normalized_text = $1 AND owner_id = $2
           FOR UPDATE`,
          [parentCalculated.normalizedText, req.account.id]
        );
        parentId = existing.rows[0].id;
      }
    }

    const saved = new Map();
    for (const match of matches) {
      let verified;
      try {
        verified = await verifyTanachSaveContext(match.originalText, match.tanachContext, client);
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === 'INVALID_TANACH_CONTEXT') {
          return res.status(400).json({ error: 'invalid_tanach_context' });
        }
        if (error.code === 'TANACH_RANGE_MISMATCH') {
          return res.status(400).json({ error: 'tanach_range_mismatch' });
        }
        throw error;
      }
      const context = verified.context;
      const result = await client.query(
        `INSERT INTO curated_matches
          (owner_id, parent_id, original_text, normalized_text, tanach_book_slug, tanach_book_label, tanach_chapter,
           tanach_verse, tanach_start, tanach_end, reason_codes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT (parent_id, tanach_book_slug, tanach_chapter, tanach_verse, tanach_start, tanach_end)
         DO UPDATE SET reason_codes = (
           SELECT jsonb_agg(DISTINCT value ORDER BY value)
           FROM jsonb_array_elements_text(curated_matches.reason_codes || EXCLUDED.reason_codes) AS values(value)
         )
         RETURNING *`,
        [req.account.id, parentId, verified.originalText, verified.calculated.normalizedText,
          context.bookSlug, context.bookLabel, context.chapter, context.verse, context.start, context.end,
          JSON.stringify([match.reasonCode])]
      );
      saved.set(result.rows[0].id, serializeCuratedMatch(result.rows[0]));
    }
    await client.query('COMMIT');
    if (parentCreated) {
      try {
        await indexSavedEntryForCurrentVersions(parentId, pool, req.account.id);
      } catch (indexError) {
        invalidateMiluiCoverageCheck(req.account.id);
        console.error(`Saved entry ${parentId}, but מילוי indexing failed:`, indexError.message);
      }
    }
    res.json({ success: true, parentId, parentCreated, matches: [...saved.values()] });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'already_saved' });
    console.error('/api/entries/curated-matches POST error:', err.message);
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
    const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const limitParam = Number.parseInt(req.query.limit, 10);
    const offsetParam = Number.parseInt(req.query.offset, 10);
    const lim = Math.min(Math.max(Number.isInteger(limitParam) ? limitParam : 50, 1), 100);
    const off = Math.max(Number.isInteger(offsetParam) ? offsetParam : 0, 0);
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'recent';
    const grouped = req.query.grouped === 'true';
    const orderBy = {
      recent: 'se.created_at DESC, se.id DESC',
      oldest: 'se.created_at ASC, se.id ASC',
      gematria: 'se.full_gematria ASC, se.created_at DESC, se.id DESC',
      alphabetical: 'se.normalized_text ASC, se.created_at DESC, se.id DESC',
    }[sort] || 'se.created_at DESC, se.id DESC';
    const groupOrderBy = {
      recent: 'MAX(se.created_at) DESC, MAX(se.id) DESC',
      oldest: 'MIN(se.created_at) ASC, MIN(se.id) ASC',
      gematria: 'se.full_gematria ASC',
      alphabetical: 'MIN(se.normalized_text) ASC, MIN(se.id) ASC',
    }[sort] || 'MAX(se.created_at) DESC, MAX(se.id) DESC';

    let whereSql = 'WHERE se.owner_id = $1';
    let searchParams = [req.account.id];
    if (rawSearch) {
      if (/^\d+$/.test(rawSearch)) {
        const value = Number(rawSearch);
        whereSql += ` AND (se.full_gematria = $2
          OR se.initials_gematria = $2
          OR se.finals_gematria = $2)`;
        searchParams.push(value);
      } else {
        const normalizedSearch = normalize(rawSearch);
        const compactInitials = normalizedSearch.replace(/\s+/g, '');
        whereSql += ` AND (se.original_text ILIKE $2
             OR se.normalized_text ILIKE $3
             OR se.initials ILIKE $2
             OR REPLACE(se.initials, ' ', '') = $4
             OR se.finals ILIKE $2
             OR REPLACE(se.finals, ' ', '') = $4)`;
        searchParams.push(
          `%${rawSearch}%`,
          `%${normalizedSearch || rawSearch}%`,
          compactInitials,
        );
      }
    }

    const entrySelect = `SELECT se.id, se.original_text, se.normalized_text, se.full_gematria,
              se.full_gematria_hebrew, se.initials, se.initials_gematria,
              se.initials_gematria_hebrew, se.finals, se.finals_gematria,
              se.finals_gematria_hebrew, se.created_at,
              se.tanach_book_slug, se.tanach_book_label, se.tanach_chapter,
              se.tanach_verse, se.tanach_start, se.tanach_end, se.parsha_id,
              (SELECT name_he FROM tanach_parshiot WHERE id = se.parsha_id) AS parsha_name,
               COUNT(*) OVER (PARTITION BY se.full_gematria)::int AS value_entry_count,
               COALESCE(json_agg(sw ORDER BY sw.position) FILTER (WHERE sw.id IS NOT NULL), '[]') AS words,
                (SELECT COUNT(*)::int FROM curated_matches cm
                  WHERE cm.parent_id = se.id AND cm.owner_id = se.owner_id) AS curated_match_count,
               COALESCE((SELECT json_agg(json_build_object(
                 'id', cm.id, 'originalText', cm.original_text,
                 'tanachContext', json_build_object('bookSlug', cm.tanach_book_slug,
                   'bookLabel', cm.tanach_book_label,
                   'chapter', cm.tanach_chapter, 'verse', cm.tanach_verse,
                   'start', cm.tanach_start, 'end', cm.tanach_end),
                 'reasonCodes', cm.reason_codes) ORDER BY cm.id)
                  FROM curated_matches cm
                  WHERE cm.parent_id = se.id AND cm.owner_id = se.owner_id), '[]') AS curated_matches
       FROM saved_entries se`;
    const paginationParams = [...searchParams, lim, off];
    const rows = grouped
      ? await pool.query(
        `WITH page_values AS (
           SELECT se.full_gematria,
                  ROW_NUMBER() OVER (ORDER BY ${groupOrderBy}) AS group_rank
           FROM saved_entries se
           ${whereSql}
           GROUP BY se.full_gematria
           ORDER BY ${groupOrderBy}
           LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}
         )
         ${entrySelect}
         JOIN page_values pv ON pv.full_gematria = se.full_gematria
         LEFT JOIN saved_words sw ON sw.entry_id = se.id AND sw.owner_id = se.owner_id
         GROUP BY se.id, pv.group_rank
         ORDER BY pv.group_rank, ${orderBy}`,
        paginationParams
      )
      : await pool.query(
        `${entrySelect}
         LEFT JOIN saved_words sw ON sw.entry_id = se.id AND sw.owner_id = se.owner_id
         ${whereSql}
         GROUP BY se.id
         ORDER BY ${orderBy}
         LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}`,
        paginationParams
      );

    const stats = await pool.query(
      `WITH filtered AS (
         SELECT se.full_gematria
         FROM saved_entries se
         ${whereSql}
       ),
       value_groups AS (
         SELECT full_gematria, COUNT(*)::int AS entry_count
         FROM filtered
         GROUP BY full_gematria
       )
       SELECT COALESCE(SUM(entry_count), 0)::int AS saved_count,
              COUNT(*)::int AS distinct_values,
              COUNT(*) FILTER (WHERE entry_count > 1)::int AS shared_values
       FROM value_groups`,
      searchParams
    );
    const summary = stats.rows[0];
    const libraryStats = {
      saved: summary.saved_count,
      distinctValues: summary.distinct_values,
      sharedValues: summary.shared_values,
    };
    const pageCount = grouped
      ? new Set(rows.rows.map(entry => entry.full_gematria)).size
      : rows.rows.length;
    const paginationTotal = grouped ? libraryStats.distinctValues : libraryStats.saved;

    res.json({
      entries: rows.rows,
      total: libraryStats.saved,
      stats: libraryStats,
      pagination: {
        unit: grouped ? 'groups' : 'entries',
        pageCount,
        nextOffset: off + pageCount,
        hasMore: off + pageCount < paginationTotal,
      },
    });
  } catch (err) {
    console.error('/api/entries GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/entries/:parentId/curated-matches/:matchId
 */
app.delete('/api/entries/:parentId/curated-matches/:matchId', requireAuth, async (req, res) => {
  const parentId = Number.parseInt(req.params.parentId, 10);
  const matchId = Number.parseInt(req.params.matchId, 10);
  if (!Number.isInteger(parentId) || parentId <= 0 || !Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const result = await pool.query(
      `DELETE FROM curated_matches
       WHERE id = $1 AND parent_id = $2 AND owner_id = $3
       RETURNING id`,
      [matchId, parentId, req.account.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ success: true });
  } catch (err) {
    console.error('/api/entries curated match DELETE error:', err.message);
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
    const owned = await client.query(
      'SELECT id FROM saved_entries WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [id, req.account.id]
    );
    if (!owned.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found' });
    }
    await deleteMiluiIndexRows(client, id, req.account.id);
    await client.query(
      'DELETE FROM saved_entries WHERE id = $1 AND owner_id = $2',
      [id, req.account.id]
    );
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
