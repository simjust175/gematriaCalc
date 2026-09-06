import { createHash } from 'node:crypto';
import {
  calculateMiluiVariant,
  getMiluiVariantOccurrences,
  normalizeMiluiMapping,
} from '../src/utils/milui.js';

const MODE = 'full_milui';

export async function ensureMiluiInterpretationSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS explicit_milui_interpretations (
      id BIGSERIAL PRIMARY KEY,
      original_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      calculation_mode TEXT NOT NULL DEFAULT 'full_milui'
        CHECK (calculation_mode = 'full_milui'),
      full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
      filling_only_gematria INTEGER NOT NULL CHECK (filling_only_gematria >= 0),
      expanded_text TEXT NOT NULL,
      selections JSONB NOT NULL,
      mapping_snapshot JSONB NOT NULL,
      mapping_version BIGINT,
      registry_version TEXT NOT NULL,
      selection_fingerprint TEXT NOT NULL,
      linked_saved_entry_id INTEGER REFERENCES saved_entries(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(normalized_text, calculation_mode, selection_fingerprint, full_milui_gematria)
    );
    CREATE INDEX IF NOT EXISTS idx_explicit_milui_total
      ON explicit_milui_interpretations(calculation_mode, full_milui_gematria, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_explicit_milui_normalized
      ON explicit_milui_interpretations(normalized_text, created_at DESC);
  `);
}

async function getActiveMapping(db) {
  const result = await db.query(
    `SELECT state.active_version AS mapping_version, version.mapping
     FROM milui_index_state state
     JOIN milui_mapping_versions version ON version.version = state.active_version
     WHERE state.id = 'private-default' AND version.status = 'active'`
  );
  if (!result.rowCount) throw new Error('Active מילוי mapping is unavailable');
  const checked = normalizeMiluiMapping(result.rows[0].mapping);
  if (!checked.valid) throw new Error('Active מילוי mapping is invalid');
  return {
    mapping: checked.mapping,
    mappingVersion: Number(result.rows[0].mapping_version),
  };
}

function canonicalSelectionFingerprint(normalizedText, selections) {
  return createHash('sha256').update(JSON.stringify({
    normalizedText,
    mode: MODE,
    selections: selections.map(({ sourceIndex, letter, selectedSpelling }) => ({
      sourceIndex,
      letter,
      selectedSpelling,
    })),
  })).digest('hex');
}

function validateCompleteSelections(occurrences, selections) {
  if (!Array.isArray(selections) || selections.length !== occurrences.length) return false;
  const uniqueIndexes = new Set(selections.map(selection => Number(selection?.sourceIndex)));
  return uniqueIndexes.size === occurrences.length
    && occurrences.every(occurrence => uniqueIndexes.has(occurrence.sourceIndex));
}

export async function createMiluiInterpretation(input, db) {
  const originalText = typeof input?.originalText === 'string' ? input.originalText : '';
  const { mapping, mappingVersion } = await getActiveMapping(db);
  const occurrences = getMiluiVariantOccurrences(originalText, mapping);
  if (!occurrences.length) {
    const error = new Error('No accepted מילוי variants exist for this text');
    error.code = 'NO_MILUI_VARIANTS';
    throw error;
  }
  if (!validateCompleteSelections(occurrences, input?.selections)) {
    const error = new Error('Incomplete מילוי occurrence selections');
    error.code = 'INVALID_MILUI_SELECTIONS';
    throw error;
  }

  let calculation;
  try {
    calculation = calculateMiluiVariant(originalText, mapping, input.selections);
  } catch (cause) {
    const error = new Error(cause.message);
    error.code = 'INVALID_MILUI_SELECTIONS';
    throw error;
  }
  const expectedTotal = Number(input?.expectedTotal);
  if (Number.isInteger(expectedTotal) && expectedTotal !== calculation.fullGematria) {
    const error = new Error('The active מילוי mapping changed');
    error.code = 'MILUI_INTERPRETATION_CHANGED';
    throw error;
  }

  const fingerprint = canonicalSelectionFingerprint(
    calculation.normalizedText,
    calculation.selections
  );
  const linked = await db.query(
    `SELECT id FROM saved_entries
     WHERE tanach_book_slug IS NULL AND normalized_text = $1
     ORDER BY id ASC LIMIT 1`,
    [calculation.normalizedText]
  );
  const values = [
    originalText,
    calculation.normalizedText,
    calculation.fullGematria,
    calculation.fillingOnlyGematria,
    calculation.expandedText,
    JSON.stringify(calculation.selections),
    JSON.stringify(mapping),
    mappingVersion,
    calculation.registryVersion,
    fingerprint,
    linked.rows[0]?.id || null,
  ];
  const inserted = await db.query(
    `INSERT INTO explicit_milui_interpretations
       (original_text, normalized_text, full_milui_gematria, filling_only_gematria,
        expanded_text, selections, mapping_snapshot, mapping_version, registry_version,
        selection_fingerprint, linked_saved_entry_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
     ON CONFLICT (normalized_text, calculation_mode, selection_fingerprint, full_milui_gematria)
     DO NOTHING
     RETURNING id, original_text, normalized_text, calculation_mode,
       full_milui_gematria, filling_only_gematria, expanded_text, selections,
       mapping_snapshot, mapping_version, registry_version, linked_saved_entry_id, created_at`,
    values
  );
  if (inserted.rowCount) return { created: true, interpretation: inserted.rows[0] };

  const existing = await db.query(
    `SELECT id, original_text, normalized_text, calculation_mode,
            full_milui_gematria, filling_only_gematria, expanded_text, selections,
            mapping_snapshot, mapping_version, registry_version, linked_saved_entry_id, created_at
     FROM explicit_milui_interpretations
     WHERE normalized_text = $1 AND calculation_mode = $2
       AND selection_fingerprint = $3 AND full_milui_gematria = $4`,
    [calculation.normalizedText, MODE, fingerprint, calculation.fullGematria]
  );
  return { created: false, interpretation: existing.rows[0] };
}

export async function getExplicitMiluiMatches(total, db) {
  if (!Number.isInteger(total) || total <= 0) return [];
  try {
    const result = await db.query(
      `SELECT interpretation.id AS interpretation_id,
              interpretation.original_text AS interpretation_original_text,
              interpretation.full_milui_gematria,
              saved.id, saved.original_text, saved.normalized_text,
              saved.full_gematria, saved.full_gematria_hebrew,
              saved.initials, saved.initials_gematria, saved.initials_gematria_hebrew,
              saved.created_at
       FROM explicit_milui_interpretations interpretation
       LEFT JOIN LATERAL (
         SELECT entry.*
         FROM saved_entries entry
         WHERE entry.id = interpretation.linked_saved_entry_id
            OR (entry.tanach_book_slug IS NULL
                AND entry.normalized_text = interpretation.normalized_text)
         ORDER BY (entry.id = interpretation.linked_saved_entry_id) DESC, entry.id ASC
         LIMIT 1
       ) saved ON TRUE
       WHERE interpretation.calculation_mode = $1
         AND interpretation.full_milui_gematria = $2
       ORDER BY interpretation.created_at DESC, interpretation.id DESC`,
      [MODE, total]
    );
    return result.rows;
  } catch (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
}

export function registerMiluiInterpretationRoutes(app, { pool, requireAuth }) {
  app.post('/api/milui-interpretations', requireAuth, async (req, res) => {
    try {
      const result = await createMiluiInterpretation(req.body, pool);
      if (!result.created) {
        return res.status(409).json({
          error: 'interpretation_already_exists',
          interpretation: result.interpretation,
        });
      }
      return res.status(201).json(result.interpretation);
    } catch (error) {
      if ([
        'NO_MILUI_VARIANTS',
        'INVALID_MILUI_SELECTIONS',
      ].includes(error.code)) {
        return res.status(400).json({ error: error.code.toLowerCase() });
      }
      if (error.code === 'MILUI_INTERPRETATION_CHANGED') {
        return res.status(409).json({ error: 'milui_interpretation_changed' });
      }
      console.error('/api/milui-interpretations POST error:', error.message);
      return res.status(500).json({ error: 'milui_interpretation_save_failed' });
    }
  });

  app.get('/api/milui-interpretations', requireAuth, async (req, res) => {
    try {
      const normalizedText = typeof req.query.normalizedText === 'string'
        ? req.query.normalizedText.trim()
        : '';
      const params = [];
      const where = [];
      if (normalizedText) {
        params.push(normalizedText);
        where.push(`normalized_text = $${params.length}`);
      }
      const result = await pool.query(
        `SELECT id, original_text, normalized_text, calculation_mode,
                full_milui_gematria, filling_only_gematria, expanded_text, selections,
                mapping_snapshot, mapping_version, registry_version,
                linked_saved_entry_id, created_at
         FROM explicit_milui_interpretations
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
        params
      );
      return res.json({ interpretations: result.rows });
    } catch (error) {
      console.error('/api/milui-interpretations GET error:', error.message);
      return res.status(500).json({ error: 'milui_interpretation_list_failed' });
    }
  });
}