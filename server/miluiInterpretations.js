import { createHash } from 'node:crypto';
import {
  calculateMiluiVariant,
  getCommonMiluiForms,
  getMiluiVariantOccurrences,
  normalizeMiluiMapping,
} from '../src/utils/milui.js';
import { computeAll } from '../src/composables/useGematria.js';
import { verifyTanachSaveContext } from './tanachSaveContext.js';
import { ensureMiluiOwnerState } from './miluiIndex.js';

const MODE = 'full_milui';

function requireOwnerId(ownerId) {
  if (!Number.isSafeInteger(Number(ownerId)) || Number(ownerId) <= 0) {
    throw new Error('A valid account ownerId is required for מילוי operations');
  }
  return Number(ownerId);
}

export async function ensureMiluiInterpretationSchema(db) {
  if (db?.databaseRole !== 'multi-user') {
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
      CREATE TABLE IF NOT EXISTS saved_entry_milui_save_modes (
        saved_entry_id INTEGER PRIMARY KEY REFERENCES saved_entries(id) ON DELETE CASCADE,
        save_mode TEXT NOT NULL CHECK (save_mode IN ('primary_only', 'all_forms')),
        form_ids JSONB NOT NULL DEFAULT '["primary"]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS saved_entry_milui_form_index (
        saved_entry_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE CASCADE,
        form_id TEXT NOT NULL,
        full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
        expanded_text TEXT NOT NULL,
        interpretation_id BIGINT REFERENCES explicit_milui_interpretations(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (saved_entry_id, form_id)
      );
      CREATE INDEX IF NOT EXISTS idx_saved_entry_milui_form_total
        ON saved_entry_milui_form_index(full_milui_gematria, saved_entry_id);
    `);
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS explicit_milui_interpretations (
      id BIGSERIAL PRIMARY KEY,
      owner_id BIGINT NOT NULL,
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
      UNIQUE(owner_id, normalized_text, calculation_mode, selection_fingerprint, full_milui_gematria)
    );
    CREATE INDEX IF NOT EXISTS idx_explicit_milui_total
      ON explicit_milui_interpretations(calculation_mode, full_milui_gematria, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_explicit_milui_normalized
      ON explicit_milui_interpretations(normalized_text, created_at DESC);
    CREATE TABLE IF NOT EXISTS saved_entry_milui_save_modes (
      owner_id BIGINT NOT NULL,
      saved_entry_id INTEGER PRIMARY KEY REFERENCES saved_entries(id) ON DELETE CASCADE,
      save_mode TEXT NOT NULL CHECK (save_mode IN ('primary_only', 'all_forms')),
      form_ids JSONB NOT NULL DEFAULT '["primary"]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS saved_entry_milui_form_index (
      owner_id BIGINT NOT NULL,
      saved_entry_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE CASCADE,
      form_id TEXT NOT NULL,
      full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
      expanded_text TEXT NOT NULL,
      interpretation_id BIGINT REFERENCES explicit_milui_interpretations(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (saved_entry_id, form_id)
    );
    CREATE INDEX IF NOT EXISTS idx_saved_entry_milui_form_total
      ON saved_entry_milui_form_index(full_milui_gematria, saved_entry_id);
  `);
}

async function getActiveMapping(db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  await ensureMiluiOwnerState(db, ownerId);
  const result = await db.query(
    `SELECT state.active_version AS mapping_version, version.mapping
     FROM milui_index_state state
     JOIN milui_mapping_versions version ON version.version = state.active_version
      WHERE state.id = 'private-default' AND state.owner_id = $1
        AND version.owner_id = $1 AND version.status = 'active'`,
    [ownerId]
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

export async function createMiluiInterpretation(input, db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const originalText = typeof input?.originalText === 'string' ? input.originalText : '';
  const { mapping, mappingVersion } = await getActiveMapping(db, ownerId);
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
      WHERE owner_id = $2 AND tanach_book_slug IS NULL AND normalized_text = $1
     ORDER BY id ASC LIMIT 1`,
    [calculation.normalizedText, ownerId]
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
       (owner_id, original_text, normalized_text, full_milui_gematria, filling_only_gematria,
        expanded_text, selections, mapping_snapshot, mapping_version, registry_version,
        selection_fingerprint, linked_saved_entry_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
      ON CONFLICT (owner_id, normalized_text, calculation_mode, selection_fingerprint, full_milui_gematria)
     DO NOTHING
     RETURNING id, original_text, normalized_text, calculation_mode,
       full_milui_gematria, filling_only_gematria, expanded_text, selections,
       mapping_snapshot, mapping_version, registry_version, linked_saved_entry_id, created_at`,
     [ownerId, ...values]
  );
  if (inserted.rowCount) return { created: true, interpretation: inserted.rows[0] };

  const existing = await db.query(
    `SELECT id, original_text, normalized_text, calculation_mode,
            full_milui_gematria, filling_only_gematria, expanded_text, selections,
            mapping_snapshot, mapping_version, registry_version, linked_saved_entry_id, created_at
     FROM explicit_milui_interpretations
      WHERE owner_id = $1 AND normalized_text = $2 AND calculation_mode = $3
        AND selection_fingerprint = $4 AND full_milui_gematria = $5`,
    [ownerId, calculation.normalizedText, MODE, fingerprint, calculation.fullGematria]
  );
  return { created: false, interpretation: existing.rows[0] };
}

export async function recordMiluiSaveMode(savedEntryId, mode, formIds, db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const normalizedMode = mode === 'all_forms' ? 'all_forms' : 'primary_only';
  const existing = await db.query(
    `SELECT save_mode, form_ids FROM saved_entry_milui_save_modes
     WHERE saved_entry_id = $1 AND owner_id = $2`,
    [savedEntryId, ownerId]
  );
  if (existing.rows[0]?.save_mode === 'all_forms') return;
  const normalizedFormIds = [...new Set([
    'primary',
    ...(Array.isArray(existing.rows[0]?.form_ids) ? existing.rows[0].form_ids : []),
    ...(Array.isArray(formIds) ? formIds : []),
  ])];
  await db.query(
    `INSERT INTO saved_entry_milui_save_modes
       (owner_id, saved_entry_id, save_mode, form_ids)
      VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (saved_entry_id) DO UPDATE
       SET save_mode = CASE
             WHEN saved_entry_milui_save_modes.save_mode = 'all_forms' THEN 'all_forms'
             ELSE EXCLUDED.save_mode
           END,
           form_ids = CASE
             WHEN saved_entry_milui_save_modes.save_mode = 'all_forms'
               THEN saved_entry_milui_save_modes.form_ids
             ELSE EXCLUDED.form_ids
           END,
           updated_at = NOW()`,
     [ownerId, savedEntryId, normalizedMode, JSON.stringify(normalizedFormIds)]
  );
}

async function ensureSavedEntry(verified, db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const { originalText, calculated, context } = verified;
  const existing = context
    ? await db.query(
      `SELECT id FROM saved_entries
        WHERE owner_id = $6 AND tanach_book_slug = $1 AND tanach_chapter = $2
         AND tanach_verse = $3 AND tanach_start = $4 AND tanach_end = $5`,
      [context.bookSlug, context.chapter, context.verse, context.start, context.end, ownerId]
    )
    : await db.query(
      `SELECT id FROM saved_entries
        WHERE owner_id = $2 AND tanach_book_slug IS NULL AND normalized_text = $1
       ORDER BY id ASC LIMIT 1`,
      [calculated.normalizedText, ownerId]
    );
  if (existing.rowCount) return { id: existing.rows[0].id, created: false };

  const inserted = await db.query(
    `INSERT INTO saved_entries
       (owner_id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
        initials, initials_gematria, initials_gematria_hebrew,
        finals, finals_gematria, finals_gematria_hebrew,
        tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse,
        tanach_start, tanach_end, parsha_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
       ownerId,
       originalText,
      calculated.normalizedText,
      calculated.fullGematria,
      calculated.fullHebrewNumber,
      calculated.initials,
      calculated.initialsGematria,
      calculated.initialsHebrewNumber,
      calculated.finals,
      calculated.finalsGematria,
      calculated.finalsHebrewNumber,
      context?.bookSlug || null,
      context?.bookLabel || null,
      context?.chapter || null,
      context?.verse || null,
      context?.start ?? null,
      context?.end ?? null,
      context?.parshaId || null,
    ]
  );
  if (!inserted.rowCount) {
    const concurrent = context
      ? await db.query(
         `SELECT id FROM saved_entries
          WHERE owner_id = $6 AND tanach_book_slug = $1 AND tanach_chapter = $2
           AND tanach_verse = $3 AND tanach_start = $4 AND tanach_end = $5`,
        [context.bookSlug, context.chapter, context.verse, context.start, context.end, ownerId]
      )
      : await db.query(
         `SELECT id FROM saved_entries
          WHERE owner_id = $2 AND tanach_book_slug IS NULL AND normalized_text = $1
         ORDER BY id ASC LIMIT 1`,
        [calculated.normalizedText, ownerId]
      );
    if (concurrent.rowCount) return { id: concurrent.rows[0].id, created: false };
    const error = new Error('Saved entry conflict could not be resolved');
    error.code = 'SAVE_CONFLICT';
    throw error;
  }
  const entryId = inserted.rows[0].id;
  for (const word of calculated.words) {
    await db.query(
      `INSERT INTO saved_words
         (owner_id, entry_id, word, normalized_word, gematria, position)
        VALUES ($1,$2,$3,$4,$5,$6)`,
      [ownerId, entryId, word.word, word.word, word.gematria, word.position]
    );
  }
  return { id: entryId, created: true };
}

export async function saveAllCommonMiluiForms(
  originalText,
  db,
  { tanachContext = null, ownerId } = {}
) {
  ownerId = requireOwnerId(ownerId);
  const verified = await verifyTanachSaveContext(originalText, tanachContext, db);
  if (verified.calculated.inputMode === 'numeric') {
    const error = new Error('Numeric entries cannot be saved');
    error.code = 'NUMERIC_ENTRY_NOT_SUPPORTED';
    throw error;
  }
  originalText = verified.originalText;
  const { mapping } = await getActiveMapping(db, ownerId);
  const occurrences = getMiluiVariantOccurrences(originalText, mapping);
  const savedEntry = await ensureSavedEntry(verified, db, ownerId);
  if (!occurrences.length) {
    await recordMiluiSaveMode(savedEntry.id, 'all_forms', ['primary'], db, ownerId);
    return {
      savedEntry,
      formIds: ['primary'],
      created: 0,
      existing: 0,
      interpretations: [],
    };
  }

  const forms = getCommonMiluiForms(originalText, mapping);
  const uniqueForms = [...new Map(forms.map(form => [
    JSON.stringify(form.calculation.selections.map(selection => [
      selection.sourceIndex,
      selection.selectedSpelling,
    ])),
    form,
  ])).values()];
  const results = [];
  const resultBySelections = new Map();
  for (const form of uniqueForms) {
    const result = await createMiluiInterpretation({
      originalText,
      selections: form.calculation.selections,
      expectedTotal: form.calculation.fullGematria,
    }, db, ownerId);
    results.push({ ...result, formId: form.id, label: form.label });
    resultBySelections.set(
      JSON.stringify(form.calculation.selections.map(selection => [
        selection.sourceIndex,
        selection.selectedSpelling,
      ])),
      result
    );
  }
  await db.query(
    `UPDATE explicit_milui_interpretations
     SET linked_saved_entry_id = $1
      WHERE owner_id = $3 AND normalized_text = $2
       AND (linked_saved_entry_id IS NULL OR linked_saved_entry_id = $1)`,
    [savedEntry.id, forms[0].calculation.normalizedText, ownerId]
  );
  for (const form of forms) {
    const selectionKey = JSON.stringify(form.calculation.selections.map(selection => [
      selection.sourceIndex,
      selection.selectedSpelling,
    ]));
    const interpretation = resultBySelections.get(selectionKey)?.interpretation;
    await db.query(
      `INSERT INTO saved_entry_milui_form_index
         (owner_id, saved_entry_id, form_id, full_milui_gematria, expanded_text, interpretation_id)
        VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (saved_entry_id, form_id) DO UPDATE
         SET full_milui_gematria = EXCLUDED.full_milui_gematria,
             expanded_text = EXCLUDED.expanded_text,
             interpretation_id = EXCLUDED.interpretation_id`,
      [
       ownerId,
       savedEntry.id,
        form.id,
        form.calculation.fullGematria,
        form.calculation.expandedText,
        interpretation?.id || null,
      ]
    );
  }
  await recordMiluiSaveMode(
    savedEntry.id,
    'all_forms',
    forms.map(form => form.id),
     db,
     ownerId
  );
  return {
    savedEntry,
    formIds: forms.map(form => form.id),
    created: results.filter(result => result.created).length,
    existing: results.filter(result => !result.created).length,
    interpretations: results.map(result => result.interpretation),
  };
}

export async function saveSelectedCommonMiluiForms(
  originalText,
  formIds,
  db,
  { tanachContext = null, ownerId } = {}
) {
  ownerId = requireOwnerId(ownerId);
  const selectedIds = [...new Set(Array.isArray(formIds) ? formIds : [])];
  if (
    selectedIds.length < 1
    || selectedIds.some(id => typeof id !== 'string' || !id || id === 'primary')
  ) {
    const error = new Error('Select one or more additional מילוי forms');
    error.code = 'INVALID_MILUI_FORM_SELECTION';
    throw error;
  }

  const verified = await verifyTanachSaveContext(originalText, tanachContext, db);
  if (verified.calculated.inputMode === 'numeric') {
    const error = new Error('Numeric entries cannot be saved');
    error.code = 'NUMERIC_ENTRY_NOT_SUPPORTED';
    throw error;
  }
  originalText = verified.originalText;
  const { mapping } = await getActiveMapping(db, ownerId);
  const forms = getCommonMiluiForms(originalText, mapping);
  const selectedForms = selectedIds.map(id => forms.find(form => form.id === id));
  if (selectedForms.some(form => !form)) {
    const error = new Error('Unknown מילוי form');
    error.code = 'INVALID_MILUI_FORM_SELECTION';
    throw error;
  }

  const savedEntry = await ensureSavedEntry(verified, db, ownerId);
  const results = [];
  for (const form of selectedForms) {
    const result = await createMiluiInterpretation({
      originalText,
      selections: form.calculation.selections,
      expectedTotal: form.calculation.fullGematria,
    }, db, ownerId);
    results.push({ ...result, formId: form.id, label: form.label });
    await db.query(
      `UPDATE explicit_milui_interpretations
       SET linked_saved_entry_id = $1
       WHERE owner_id = $3 AND id = $2
         AND (linked_saved_entry_id IS NULL OR linked_saved_entry_id = $1)`,
      [savedEntry.id, result.interpretation.id, ownerId]
    );
    await db.query(
      `INSERT INTO saved_entry_milui_form_index
         (owner_id, saved_entry_id, form_id, full_milui_gematria, expanded_text, interpretation_id)
        VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (saved_entry_id, form_id) DO UPDATE
         SET full_milui_gematria = EXCLUDED.full_milui_gematria,
             expanded_text = EXCLUDED.expanded_text,
             interpretation_id = EXCLUDED.interpretation_id`,
      [
       ownerId,
       savedEntry.id,
        form.id,
        form.calculation.fullGematria,
        form.calculation.expandedText,
        result.interpretation.id,
      ]
    );
  }
  await recordMiluiSaveMode(
    savedEntry.id,
    'primary_only',
    ['primary', ...selectedIds],
     db,
     ownerId
  );
  return {
    savedEntry,
    formIds: ['primary', ...selectedIds],
    created: results.filter(result => result.created).length,
    existing: results.filter(result => !result.created).length,
    interpretations: results.map(result => result.interpretation),
  };
}

export async function getExplicitMiluiMatches(total, db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  if (!Number.isInteger(total) || total <= 0) return [];
  try {
    const result = await db.query(
      `SELECT interpretation.id AS interpretation_id,
              interpretation.original_text AS interpretation_original_text,
              interpretation.full_milui_gematria,
              interpretation.expanded_text AS interpretation_expanded_text,
              saved.id, saved.original_text, saved.normalized_text,
              saved.full_gematria, saved.full_gematria_hebrew,
              saved.initials, saved.initials_gematria, saved.initials_gematria_hebrew,
              saved.created_at
       FROM explicit_milui_interpretations interpretation
       LEFT JOIN LATERAL (
         SELECT entry.*
         FROM saved_entries entry
           WHERE entry.owner_id = $3
             AND (
               entry.id = interpretation.linked_saved_entry_id
               OR (entry.tanach_book_slug IS NULL
                   AND entry.normalized_text = interpretation.normalized_text)
             )
         ORDER BY (entry.id = interpretation.linked_saved_entry_id) DESC, entry.id ASC
         LIMIT 1
       ) saved ON TRUE
        WHERE interpretation.owner_id = $3
          AND interpretation.calculation_mode = $1
          AND interpretation.full_milui_gematria = $2
       ORDER BY interpretation.created_at DESC, interpretation.id DESC`,
       [MODE, total, ownerId]
    );
    return result.rows;
  } catch (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
}

export function registerMiluiInterpretationRoutes(app, {
  pool,
  requireAuth,
  acquireSaveLock = async () => {},
  indexSavedEntry = async () => {},
  invalidateCoverage = () => {},
}) {
  app.post('/api/milui-interpretations/save-selected', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await acquireSaveLock(client);
      const result = await saveSelectedCommonMiluiForms(
        req.body?.originalText,
        req.body?.formIds,
        client,
        { tanachContext: req.body?.tanachContext, ownerId: req.account.id }
      );
      await client.query('COMMIT');
      if (result.savedEntry.created) {
        try {
           await indexSavedEntry(result.savedEntry.id, req.account.id);
        } catch (indexError) {
           invalidateCoverage(req.account.id);
          console.error(`Saved entry ${result.savedEntry.id}, but מילוי indexing failed:`, indexError.message);
        }
      }
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === 'MISSING_FIELDS') return res.status(400).json({ error: 'missing_fields' });
      if (error.code === 'NUMERIC_ENTRY_NOT_SUPPORTED') {
        return res.status(400).json({ error: 'numeric_entry_not_supported' });
      }
      if (error.code === 'INVALID_MILUI_FORM_SELECTION') {
        return res.status(400).json({ error: 'invalid_milui_form_selection' });
      }
      if (error.code === 'INVALID_TANACH_CONTEXT') {
        return res.status(400).json({ error: 'invalid_tanach_context' });
      }
      if (error.code === 'TANACH_RANGE_MISMATCH') {
        return res.status(400).json({ error: 'tanach_range_mismatch' });
      }
      console.error('/api/milui-interpretations/save-selected POST error:', error.message);
      return res.status(500).json({ error: 'milui_interpretation_save_selected_failed' });
    } finally {
      client.release();
    }
  });

  app.post('/api/milui-interpretations/save-all', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await acquireSaveLock(client);
      const result = await saveAllCommonMiluiForms(req.body?.originalText, client, {
        tanachContext: req.body?.tanachContext,
        ownerId: req.account.id,
      });
      await client.query('COMMIT');
      if (result.savedEntry.created) {
        try {
           await indexSavedEntry(result.savedEntry.id, req.account.id);
        } catch (indexError) {
           invalidateCoverage(req.account.id);
          console.error(`Saved entry ${result.savedEntry.id}, but מילוי indexing failed:`, indexError.message);
        }
      }
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === 'MISSING_FIELDS') {
        return res.status(400).json({ error: 'missing_fields' });
      }
      if (error.code === 'NUMERIC_ENTRY_NOT_SUPPORTED') {
        return res.status(400).json({ error: 'numeric_entry_not_supported' });
      }
      if (error.code === 'INVALID_TANACH_CONTEXT') {
        return res.status(400).json({ error: 'invalid_tanach_context' });
      }
      if (error.code === 'TANACH_RANGE_MISMATCH') {
        return res.status(400).json({ error: 'tanach_range_mismatch' });
      }
      console.error('/api/milui-interpretations/save-all POST error:', error.message);
      return res.status(500).json({ error: 'milui_interpretation_save_all_failed' });
    } finally {
      client.release();
    }
  });

  app.post('/api/milui-interpretations', requireAuth, async (req, res) => {
    try {
       const result = await createMiluiInterpretation(req.body, pool, req.account.id);
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
       const params = [req.account.id];
       const where = ['owner_id = $1'];
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