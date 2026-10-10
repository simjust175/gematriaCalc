import { computeAll, normalize } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { isTefillotAvailable } from './tefillot.js';

function saveError(code) {
  return Object.assign(new Error(code), { code });
}

export async function tefillotSaveSchemaReady(db) {
  const result = await db.query(`
    SELECT to_regclass('curated_tefillot_matches') IS NOT NULL
      AND (SELECT COUNT(*) = 3 FROM pg_attribute
        WHERE attrelid = to_regclass('saved_entries')
          AND attname IN ('tefillot_unit_id', 'tefillot_start', 'tefillot_end')
          AND NOT attisdropped) AS ready
  `);
  return result.rows[0]?.ready === true;
}

export function serializeTefillotContext(row) {
  return {
    unitId: Number(row.tefillot_unit_id ?? row.id),
    start: row.tefillot_start, end: row.tefillot_end,
    occasionSlug: row.occasion_slug, occasionLabel: row.occasion_label,
    serviceSlug: row.service_slug, serviceLabel: row.service_label,
    sectionKey: row.section_key, sectionLabel: row.section_label,
    subsection: row.subsection, sourceReference: row.source_reference,
    sourceWork: row.source_work, sourceVersion: row.source_version,
    license: row.license, sourceUrl: row.source_url, versionSource: row.version_source,
  };
}

export async function verifyTefillotSaveContext(originalText, context, db) {
  if (!await tefillotSaveSchemaReady(db)) throw saveError('tefillot_save_schema_required');
  if (!await isTefillotAvailable(db)) throw saveError('tefillot_unavailable');
  if (!context || typeof context !== 'object'
      || [context.unitId, context.start, context.end].some(value => value == null || value === '' || typeof value === 'boolean')) {
    throw saveError('invalid_tefillot_context');
  }
  const unitId = Number(context.unitId);
  const start = Number(context.start);
  const end = Number(context.end);
  if (!Number.isSafeInteger(unitId) || unitId < 1
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw saveError('invalid_tefillot_context');
  }
  const result = await db.query(`
    SELECT u.*, s.source_url, s.version_source
    FROM tefillot_units u JOIN tefillot_sources s ON s.id = u.source_id
    WHERE u.id = $1`, [unitId]);
  const unit = result.rows[0];
  if (!unit) throw saveError('invalid_tefillot_context');
  const cursor = createTanachCursor(unit.hebrew_text);
  if (end >= cursor.count) throw saveError('tefillot_range_mismatch');
  const text = cursor.range(start, end).text;
  if (typeof originalText !== 'string' || normalize(text) !== normalize(originalText)) {
    throw saveError('tefillot_range_mismatch');
  }
  return {
    originalText: text, calculated: computeAll(text),
    context: serializeTefillotContext({ ...unit, tefillot_start: start, tefillot_end: end }),
  };
}

export function tefillotSaveErrorStatus(error) {
  if (['tefillot_save_schema_required', 'tefillot_unavailable'].includes(error.code)) return 503;
  if (['invalid_tefillot_context', 'tefillot_range_mismatch'].includes(error.code)) return 400;
  return null;
}

// Keep existing deployments usable before the reviewed migration is applied.
// Row-to-JSON reads a missing column as NULL without referencing it in SQL.
export function manualEntryCondition(alias = 'saved_entries') {
  return `${alias}.tanach_book_slug IS NULL AND (to_jsonb(${alias})->>'tefillot_unit_id') IS NULL`;
}

export async function hydrateTefillotEntries(entries, db) {
  if (!await tefillotSaveSchemaReady(db) || !entries.length) return entries;
  const ids = entries.map(entry => entry.id);
  const ranges = await db.query(`
    SELECT se.id AS entry_id, se.tefillot_unit_id, se.tefillot_start, se.tefillot_end,
      u.*, s.source_url, s.version_source
    FROM saved_entries se JOIN tefillot_units u ON u.id = se.tefillot_unit_id
    JOIN tefillot_sources s ON s.id = u.source_id WHERE se.id = ANY($1::int[])`, [ids]);
  const children = await db.query(`
    SELECT cm.*, u.occasion_slug, u.occasion_label, u.service_slug, u.service_label,
      u.section_key, u.section_label, u.subsection, u.source_reference,
      u.source_work, u.source_version, u.license, s.source_url, s.version_source
    FROM curated_tefillot_matches cm JOIN tefillot_units u ON u.id = cm.tefillot_unit_id
    JOIN tefillot_sources s ON s.id = u.source_id
    WHERE cm.parent_id = ANY($1::int[]) ORDER BY cm.id`, [ids]);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  for (const row of ranges.rows) {
    Object.assign(byId.get(row.entry_id), { sourceType: 'tefillot', tefillotContext: serializeTefillotContext(row) });
  }
  for (const row of children.rows) {
    const entry = byId.get(row.parent_id);
    entry.curated_matches.push({
      id: row.id, sourceType: 'tefillot', originalText: row.original_text,
      reasonCodes: row.reason_codes, tefillotContext: serializeTefillotContext(row),
    });
    entry.curated_match_count = entry.curated_matches.length;
  }
  return entries;
}
