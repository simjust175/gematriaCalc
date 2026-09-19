import { computeAll, normalize } from '../src/composables/useGematria.js';

export const MAX_BASE_WORD_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const SOURCE_TYPES = new Set(['manual', 'calculator', 'tanach']);

function serializeBaseWord(row) {
  return {
    id: row.id,
    originalText: row.original_text,
    normalizedText: row.normalized_text,
    fullGematria: row.full_gematria,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function calculateBaseWord(originalText) {
  if (typeof originalText !== 'string') return { error: 'invalid_base_word' };
  const normalizedText = normalize(originalText);
  const calculated = computeAll(normalizedText);
  if (!calculated) return { error: 'invalid_base_word' };
  if (
    !Number.isSafeInteger(calculated.fullGematria)
    || calculated.fullGematria < 1
    || calculated.fullGematria > MAX_POSTGRES_INTEGER
  ) {
    return { error: 'invalid_base_word_gematria' };
  }
  return {
    originalText,
    normalizedText: calculated.normalizedText,
    fullGematria: calculated.fullGematria,
  };
}

function baseWordId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sourceType(value) {
  if (value == null) return 'manual';
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return SOURCE_TYPES.has(normalized) ? normalized : null;
}

function isDuplicateError(error) {
  return error?.code === '23505';
}

/**
 * Register the canonical, deliberately separate base-word collection routes.
 * These routes never read or write the saved library, derived מילוי data, or
 * Tanach corpus.
 */
export function registerBaseWordRoutes(app, { pool, requireAuth }) {
  app.get('/api/base-words', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, original_text, normalized_text, full_gematria, source_type, created_at, updated_at
         FROM base_words
         WHERE owner_id = $1
         ORDER BY created_at ASC, id ASC`
        ,
        [req.account.id]
      );
      res.json({ items: result.rows.map(serializeBaseWord) });
    } catch (err) {
      console.error('/api/base-words GET error:', err.message);
      res.status(500).json({ error: 'base_words_list_failed' });
    }
  });

  app.post('/api/base-words', requireAuth, async (req, res) => {
    const calculated = calculateBaseWord(req.body?.originalText);
    if (calculated.error) return res.status(400).json({ error: calculated.error });
    const suppliedSourceType = sourceType(req.body?.sourceType);
    if (!suppliedSourceType) return res.status(400).json({ error: 'invalid_source_type' });

    try {
      const result = await pool.query(
        `INSERT INTO base_words
           (owner_id, original_text, normalized_text, full_gematria, source_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, original_text, normalized_text, full_gematria, source_type, created_at, updated_at`,
        [
          req.account.id,
          calculated.originalText,
          calculated.normalizedText,
          calculated.fullGematria,
          suppliedSourceType,
        ]
      );
      res.status(201).json({ item: serializeBaseWord(result.rows[0]) });
    } catch (err) {
      if (isDuplicateError(err)) return res.status(409).json({ error: 'base_word_exists' });
      console.error('/api/base-words POST error:', err.message);
      res.status(500).json({ error: 'base_word_create_failed' });
    }
  });

  app.patch('/api/base-words/:id', requireAuth, async (req, res) => {
    const id = baseWordId(req.params.id);
    const calculated = calculateBaseWord(req.body?.originalText);
    if (!id) return res.status(404).json({ error: 'base_word_not_found' });
    if (calculated.error) return res.status(400).json({ error: calculated.error });

    try {
      const result = await pool.query(
        `UPDATE base_words
         SET original_text = $1, normalized_text = $2, full_gematria = $3, updated_at = NOW()
         WHERE id = $4 AND owner_id = $5
         RETURNING id, original_text, normalized_text, full_gematria, source_type, created_at, updated_at`,
        [calculated.originalText, calculated.normalizedText, calculated.fullGematria, id, req.account.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'base_word_not_found' });
      res.json({ item: serializeBaseWord(result.rows[0]) });
    } catch (err) {
      if (isDuplicateError(err)) return res.status(409).json({ error: 'base_word_exists' });
      console.error('/api/base-words PATCH error:', err.message);
      res.status(500).json({ error: 'base_word_update_failed' });
    }
  });

  app.delete('/api/base-words/:id', requireAuth, async (req, res) => {
    const id = baseWordId(req.params.id);
    if (!id) return res.status(404).json({ error: 'base_word_not_found' });
    try {
      const result = await pool.query(
        'DELETE FROM base_words WHERE id = $1 AND owner_id = $2',
        [id, req.account.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'base_word_not_found' });
      res.status(204).end();
    } catch (err) {
      console.error('/api/base-words DELETE error:', err.message);
      res.status(500).json({ error: 'base_word_delete_failed' });
    }
  });

  app.get('/api/base-words/matches', requireAuth, async (req, res) => {
    const value = Number(req.query.value);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BASE_WORD_VALUE) {
      return res.status(400).json({ error: 'invalid_base_word_value' });
    }
    try {
      const result = await pool.query(
        `SELECT id, original_text, full_gematria, ($1::bigint / full_gematria) AS times
         FROM base_words
          WHERE owner_id = $2
            AND full_gematria > 0
           AND $1::bigint % full_gematria = 0
         ORDER BY created_at ASC, id ASC`,
        [value, req.account.id]
      );
      res.json({
        results: result.rows.map(row => ({
          id: row.id,
          originalText: row.original_text,
          fullGematria: row.full_gematria,
          times: Number(row.times),
        })),
      });
    } catch (err) {
      console.error('/api/base-words/matches GET error:', err.message);
      res.status(500).json({ error: 'base_word_match_failed' });
    }
  });
}