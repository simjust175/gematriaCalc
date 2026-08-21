/**
 * server/app.js — Express application (exported for testing).
 * Does NOT call app.listen() — that lives in server/index.js.
 */
import express from 'express';
import session from 'express-session';
import { pool } from './db.js';

export const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());

// Session — signed with SESSION_SECRET, httpOnly, sameSite strict.
// No external CORS headers: all API access is same-origin through the Vite proxy.
app.use(session({
  secret: process.env.SESSION_SECRET || (() => {
    throw new Error('SESSION_SECRET environment variable must be set');
  })(),
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

/**
 * GET /api/matches
 * Query: gematria, initialsGematria, normalizedText
 * Returns primary (full gematria) and secondary (ראשי תיבות) matches.
 */
app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const { gematria, initialsGematria, normalizedText } = req.query;
    const g  = parseInt(gematria)         || 0;
    const ig = parseInt(initialsGematria) || 0;

    let primary = [];
    let secondary = [];
    let isAlreadySaved = false;

    if (g > 0) {
      // Check if current phrase is already saved
      if (normalizedText) {
        const chk = await pool.query(
          'SELECT id FROM saved_entries WHERE normalized_text = $1',
          [normalizedText]
        );
        isAlreadySaved = chk.rows.length > 0;
      }

      // Entries whose full gematria matches
      const entriesRes = await pool.query(
        `SELECT id, original_text, normalized_text, full_gematria
         FROM saved_entries WHERE full_gematria = $1
         ORDER BY created_at DESC LIMIT 20`,
        [g]
      );

      // Individual words whose gematria matches
      const wordsRes = await pool.query(
        `SELECT sw.word, sw.gematria, se.original_text AS entry_text, se.id AS entry_id
         FROM saved_words sw
         JOIN saved_entries se ON sw.entry_id = se.id
         WHERE sw.gematria = $1
         ORDER BY se.created_at DESC LIMIT 20`,
        [g]
      );

      const entryIds = new Set(entriesRes.rows.map(e => e.id));
      primary = [
        ...entriesRes.rows.map(e => ({ type: 'entry', ...e })),
        ...wordsRes.rows
          .filter(w => !entryIds.has(w.entry_id))
          .map(w => ({ type: 'word', ...w })),
      ];
    }

    if (ig > 0) {
      const secRes = await pool.query(
        `SELECT id, original_text, initials, initials_gematria
         FROM saved_entries WHERE initials_gematria = $1
         ORDER BY created_at DESC LIMIT 10`,
        [ig]
      );
      secondary = secRes.rows.map(e => ({ type: 'entry', ...e }));
    }

    res.json({ primary, secondary, isAlreadySaved });
  } catch (err) {
    console.error('/api/matches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/entries — save a phrase with its words.
 */
app.post('/api/entries', requireAuth, async (req, res) => {
  try {
    const {
      originalText, normalizedText, fullGematria, fullGematriaHebrew,
      initials, initialsGematria, initialsGematriaHebrew, words,
    } = req.body;

    if (!normalizedText || !fullGematria) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const exists = await pool.query(
      'SELECT id FROM saved_entries WHERE normalized_text = $1',
      [normalizedText]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'already_saved', id: exists.rows[0].id });
    }

    const entryRes = await pool.query(
      `INSERT INTO saved_entries
         (original_text, normalized_text, full_gematria, full_gematria_hebrew,
          initials, initials_gematria, initials_gematria_hebrew)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [originalText, normalizedText, fullGematria, fullGematriaHebrew,
       initials, initialsGematria, initialsGematriaHebrew]
    );
    const entryId = entryRes.rows[0].id;

    for (const w of (words || [])) {
      await pool.query(
        `INSERT INTO saved_words (entry_id, word, normalized_word, gematria, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [entryId, w.word, w.word, w.gematria, w.position]
      );
    }

    res.json({ id: entryId, success: true });
  } catch (err) {
    console.error('/api/entries POST error:', err.message);
    res.status(500).json({ error: err.message });
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
  try {
    const id = parseInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    await pool.query('DELETE FROM saved_entries WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('/api/entries DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
