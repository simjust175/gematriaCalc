import { getActiveMiluiMultipleSources } from './miluiIndex.js';

export const MAX_MULTIPLE_VALUE = Number.MAX_SAFE_INTEGER;

export const MULTIPLE_SOURCE_META = Object.freeze({
  full_gematria: { label: 'גימטריה מלאה', priority: 0 },
  saved_word: { label: 'תיבה', priority: 1 },
  initials_gematria: { label: 'גימטריית ר״ת', priority: 2 },
  milui_gematria: { label: 'גימטריית מילוי', priority: 3 },
});

const GROUP_META = Object.freeze({
  into_current: { label: 'נכנס בערך הנוכחי', priority: 0 },
  current_into_saved: { label: 'הערך הנוכחי נכנס ב־', priority: 1 },
});

export function parseMultipleDiscoveryQuery(query = {}) {
  const value = Number(query.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MULTIPLE_VALUE) {
    return { error: 'invalid_multiple_value' };
  }
  return { value };
}

export function calculateExactMultiple(sourceValue, currentValue) {
  if (
    !Number.isSafeInteger(sourceValue)
    || !Number.isSafeInteger(currentValue)
    || sourceValue <= 1
    || currentValue <= 0
    || sourceValue === currentValue
  ) {
    return null;
  }

  if (sourceValue < currentValue && currentValue % sourceValue === 0) {
    return {
      direction: 'into_current',
      multiplier: currentValue / sourceValue,
    };
  }

  if (sourceValue > currentValue && sourceValue % currentValue === 0) {
    return {
      direction: 'current_into_saved',
      multiplier: sourceValue / currentValue,
    };
  }

  return null;
}

function sourcePriority(sourceType) {
  return MULTIPLE_SOURCE_META[sourceType]?.priority ?? 99;
}

function compareRelationships(left, right) {
  return left.multiplier - right.multiplier
    || sourcePriority(left.sourceType) - sourcePriority(right.sourceType)
    || left.sourceValue - right.sourceValue
    || String(left.sourceWord || '').localeCompare(String(right.sourceWord || ''));
}

function compareEntries(left, right) {
  const leftRelationship = left.relationships[0];
  const rightRelationship = right.relationships[0];
  return compareRelationships(leftRelationship, rightRelationship)
    || new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    || left.entryId - right.entryId;
}

/**
 * Convert flat source rows into one card per saved entry per direction.
 * This is deliberately pure so all arithmetic, deduplication, and ranking can
 * be tested without a database or browser.
 */
export function groupExactMultiples(rows, currentValue) {
  const groups = new Map(
    Object.keys(GROUP_META).map(key => [key, new Map()])
  );

  for (const row of rows) {
    const entryId = Number(row.entry_id ?? row.entryId);
    const sourceValue = Number(row.source_value ?? row.sourceValue);
    const relationship = calculateExactMultiple(sourceValue, currentValue);
    if (!Number.isSafeInteger(entryId) || !relationship) continue;

    const sourceType = String(row.source_type ?? row.sourceType ?? '');
    const sourceMeta = MULTIPLE_SOURCE_META[sourceType];
    if (!sourceMeta) continue;

    const directionEntries = groups.get(relationship.direction);
    const entryKey = String(entryId);
    let entry = directionEntries.get(entryKey);
    if (!entry) {
      entry = {
        entryId,
        originalText: row.original_text ?? row.originalText ?? '',
        createdAt: row.created_at ?? row.createdAt ?? null,
        relationships: [],
      };
      directionEntries.set(entryKey, entry);
    }

    const sourceWord = row.source_word ?? row.sourceWord ?? null;
    const relationshipKey = [
      sourceType,
      sourceValue,
      String(sourceWord || ''),
    ].join('|');
    if (entry.relationships.some(item => item.key === relationshipKey)) continue;

    entry.relationships.push({
      key: relationshipKey,
      sourceType,
      sourceLabel: sourceMeta.label,
      sourceValue,
      sourceWord: sourceWord || null,
      multiplier: relationship.multiplier,
    });
  }

  return Object.entries(GROUP_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    entries: [...groups.get(key).values()]
      .map(entry => ({
        ...entry,
        relationships: entry.relationships
          .sort(compareRelationships)
          .map(({ key: _key, ...relationship }) => relationship),
      }))
      .filter(entry => entry.relationships.length > 0)
      .sort(compareEntries),
  }));
}

async function readBaseSources(db, currentValue) {
  const result = await db.query(
    `WITH source_values AS (
       SELECT id AS entry_id, original_text, created_at,
              'full_gematria'::text AS source_type,
              full_gematria AS source_value,
              NULL::text AS source_word
       FROM saved_entries
       UNION ALL
       SELECT se.id, se.original_text, se.created_at,
              'saved_word'::text,
              sw.gematria,
              sw.word
       FROM saved_words sw
       JOIN saved_entries se ON se.id = sw.entry_id
       UNION ALL
       SELECT id, original_text, created_at,
              'initials_gematria'::text,
              initials_gematria,
              NULL::text
       FROM saved_entries
     )
     SELECT entry_id, original_text, created_at, source_type, source_value, source_word
     FROM source_values
     WHERE source_value > 1
       AND source_value <> $1::bigint
       AND (
         ($1::bigint > source_value AND $1::bigint % source_value = 0)
         OR (source_value > $1::bigint AND source_value % $1::bigint = 0)
       )`,
    [currentValue]
  );
  return result.rows;
}

export async function searchSavedMultiples(db, currentValue) {
  const baseRows = await readBaseSources(db, currentValue);
  const miluiRows = await getActiveMiluiMultipleSources(currentValue, db);
  const groups = groupExactMultiples([...baseRows, ...miluiRows], currentValue);
  return { currentValue, groups };
}