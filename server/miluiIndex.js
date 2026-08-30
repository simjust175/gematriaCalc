import { pool } from './db.js';
import {
  MILUI_DEFAULT_MAPPING,
  MILUI_PRESET_NAME,
  calculateMilui,
  normalizeMiluiMapping,
} from '../src/utils/milui.js';

const MILUI_STATE_ID = 'private-default';
const MILUI_INDEX_LOCK_KEY = 73194211;
const COVERAGE_CHECK_INTERVAL_MS = 30_000;
const runtimeMatchingEnabled = process.env.MILUI_MATCHING_ENABLED !== 'false';

let schemaAvailable = false;
let coverageCheckPromise = null;
let lastCoverageCheckAt = 0;

function mappingJson(mapping) {
  return JSON.stringify(mapping);
}

async function withTransaction(db, callback) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function acquireExclusiveCutoverLock(client) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [MILUI_INDEX_LOCK_KEY]);
}

export async function acquireMiluiSaveLock(client) {
  await client.query('SELECT pg_advisory_xact_lock_shared($1)', [MILUI_INDEX_LOCK_KEY]);
}

export async function ensureMiluiMatchingSchema(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS milui_mapping_versions (
      version BIGSERIAL PRIMARY KEY,
      preset_name TEXT NOT NULL,
      mapping JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'inactive', 'failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_mapping_one_active
      ON milui_mapping_versions(status) WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_mapping_one_pending
      ON milui_mapping_versions(status) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS milui_index_state (
      id TEXT PRIMARY KEY CHECK (id = 'private-default'),
      active_version BIGINT REFERENCES milui_mapping_versions(version) ON DELETE RESTRICT,
      matching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS saved_entry_milui_index (
      saved_entry_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE RESTRICT,
      mapping_version BIGINT NOT NULL REFERENCES milui_mapping_versions(version) ON DELETE RESTRICT,
      full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (saved_entry_id, mapping_version)
    );

    CREATE INDEX IF NOT EXISTS idx_saved_entry_milui_lookup
      ON saved_entry_milui_index(mapping_version, full_milui_gematria);
  `);
  schemaAvailable = true;
}

async function detectSchema(db = pool) {
  const result = await db.query(
    `SELECT to_regclass('saved_entry_milui_index') IS NOT NULL AS available`
  );
  schemaAvailable = result.rows[0]?.available === true;
  return schemaAvailable;
}

async function getPreference(db) {
  const result = await db.query(
    `SELECT preset_name, mapping
     FROM milui_preferences
     WHERE id = $1`,
    [MILUI_STATE_ID]
  );
  const row = result.rows[0];
  const checked = normalizeMiluiMapping(row?.mapping || MILUI_DEFAULT_MAPPING);
  if (!checked.valid) throw new Error('Stored מילוי mapping is invalid');
  return {
    presetName: row?.preset_name || MILUI_PRESET_NAME,
    mapping: checked.mapping,
  };
}

async function getVersion(db, version) {
  const result = await db.query(
    `SELECT version, preset_name, mapping, status
     FROM milui_mapping_versions
     WHERE version = $1`,
    [version]
  );
  return result.rows[0] || null;
}

async function indexMissingRows(db, version, mapping) {
  const missing = await db.query(
    `SELECT se.id, se.original_text
     FROM saved_entries se
     LEFT JOIN saved_entry_milui_index idx
       ON idx.saved_entry_id = se.id AND idx.mapping_version = $1
     WHERE idx.saved_entry_id IS NULL
     ORDER BY se.id`,
    [version]
  );

  let indexed = 0;
  let failed = 0;
  for (const entry of missing.rows) {
    try {
      const calculation = calculateMilui(entry.original_text, mapping);
      if (!calculation?.fullGematria) {
        failed += 1;
        continue;
      }
      const inserted = await db.query(
        `INSERT INTO saved_entry_milui_index
           (saved_entry_id, mapping_version, full_milui_gematria)
         SELECT id, $2, $3
         FROM saved_entries
         WHERE id = $1
         ON CONFLICT (saved_entry_id, mapping_version) DO NOTHING`,
        [entry.id, version, calculation.fullGematria]
      );
      indexed += inserted.rowCount;
    } catch (error) {
      failed += 1;
      console.error(`Failed to index saved entry ${entry.id} for מילוי version ${version}:`, error.message);
    }
  }
  return { indexed, failed };
}

async function getCoverage(db, version) {
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM saved_entries) AS saved_entries,
       (SELECT COUNT(*)::int
        FROM saved_entry_milui_index
        WHERE mapping_version = $1) AS indexed_entries`,
    [version]
  );
  const row = result.rows[0];
  return {
    savedEntries: row.saved_entries,
    indexedEntries: row.indexed_entries,
    missing: row.saved_entries - row.indexed_entries,
    complete: row.saved_entries === row.indexed_entries,
  };
}

async function activateVersion(client, version, mapping, presetName) {
  const coverage = await getCoverage(client, version);
  if (!coverage.complete) {
    throw new Error(
      `Cannot activate incomplete מילוי index version ${version}: ${coverage.missing} missing`
    );
  }

  await client.query(
    `UPDATE milui_mapping_versions
     SET status = 'inactive'
     WHERE status = 'active' AND version <> $1`,
    [version]
  );
  await client.query(
    `UPDATE milui_mapping_versions
     SET status = 'active', activated_at = NOW()
     WHERE version = $1 AND status IN ('pending', 'active')`,
    [version]
  );
  await client.query(
    `INSERT INTO milui_index_state (id, active_version, matching_enabled, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       active_version = EXCLUDED.active_version,
       matching_enabled = EXCLUDED.matching_enabled,
       updated_at = NOW()`,
    [MILUI_STATE_ID, version, runtimeMatchingEnabled]
  );
  await client.query(
    `INSERT INTO milui_preferences (id, preset_name, mapping, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       preset_name = EXCLUDED.preset_name,
       mapping = EXCLUDED.mapping,
       updated_at = NOW()`,
    [MILUI_STATE_ID, presetName, mappingJson(mapping)]
  );
  return coverage;
}

async function createInitialVersion(db = pool) {
  const staged = await withTransaction(db, async client => {
    await acquireExclusiveCutoverLock(client);
    const existingState = await client.query(
      `SELECT active_version FROM milui_index_state WHERE id = $1 FOR UPDATE`,
      [MILUI_STATE_ID]
    );
    if (existingState.rowCount) return null;

    const existingPending = await client.query(
      `SELECT version, preset_name, mapping
       FROM milui_mapping_versions
       WHERE status = 'pending'
       ORDER BY version DESC
       LIMIT 1`
    );
    if (existingPending.rowCount) {
      const pending = existingPending.rows[0];
      const checked = normalizeMiluiMapping(pending.mapping);
      if (!checked.valid) throw new Error('Pending מילוי mapping is invalid');
      return {
        version: pending.version,
        presetName: pending.preset_name,
        mapping: checked.mapping,
      };
    }

    const preference = await getPreference(client);
    const versionResult = await client.query(
      `INSERT INTO milui_mapping_versions (preset_name, mapping, status)
       VALUES ($1, $2::jsonb, 'pending')
       RETURNING version`,
      [preference.presetName, mappingJson(preference.mapping)]
    );
    return {
      version: versionResult.rows[0].version,
      presetName: preference.presetName,
      mapping: preference.mapping,
    };
  });
  if (!staged) return null;

  const build = await indexMissingRows(db, staged.version, staged.mapping);
  return withTransaction(db, async client => {
    await acquireExclusiveCutoverLock(client);
    await client.query('LOCK TABLE saved_entries IN SHARE MODE');
    const existingState = await client.query(
      `SELECT active_version FROM milui_index_state WHERE id = $1 FOR UPDATE`,
      [MILUI_STATE_ID]
    );
    if (existingState.rowCount) return null;
    const version = await getVersion(client, staged.version);
    if (!version || version.status !== 'pending') {
      throw new Error(`Milui version ${staged.version} is no longer pending`);
    }
    const catchUp = await indexMissingRows(client, staged.version, staged.mapping);
    const coverage = await activateVersion(
      client,
      staged.version,
      staged.mapping,
      staged.presetName
    );
    return { version: staged.version, build, catchUp, coverage };
  });
}

async function repairActiveVersion(db = pool) {
  const stateResult = await db.query(
    `SELECT state.active_version, versions.mapping
     FROM milui_index_state state
     JOIN milui_mapping_versions versions ON versions.version = state.active_version
     WHERE state.id = $1`,
    [MILUI_STATE_ID]
  );
  const state = stateResult.rows[0];
  if (!state) return null;
  const checked = normalizeMiluiMapping(state.mapping);
  if (!checked.valid) throw new Error('Active מילוי mapping is invalid');
  const build = await indexMissingRows(db, state.active_version, checked.mapping);
  const coverage = await getCoverage(db, state.active_version);
  await db.query(
    `UPDATE milui_index_state
     SET matching_enabled = $2, updated_at = NOW()
     WHERE id = $1`,
    [MILUI_STATE_ID, runtimeMatchingEnabled && coverage.complete]
  );
  return { version: state.active_version, build, coverage };
}

export async function initializeMiluiMatching({
  db = pool,
  allowSchemaChanges = process.env.NODE_ENV !== 'production',
} = {}) {
  if (allowSchemaChanges) {
    await ensureMiluiMatchingSchema(db);
  } else if (!(await detectSchema(db))) {
    console.warn('Milui matching schema is not published; matching remains disabled');
    return { schemaAvailable: false, matchingEnabled: false };
  }

  const initial = await createInitialVersion(db);
  const repaired = initial || await repairActiveVersion(db);
  lastCoverageCheckAt = Date.now();
  return {
    schemaAvailable: true,
    matchingEnabled: runtimeMatchingEnabled && repaired?.coverage.complete === true,
    ...repaired,
  };
}

async function createPendingVersion(db, mapping, presetName) {
  return withTransaction(db, async client => {
    await acquireExclusiveCutoverLock(client);
    await client.query(
      `UPDATE milui_mapping_versions
       SET status = 'failed'
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '15 minutes'`
    );
    const pending = await client.query(
      `SELECT version FROM milui_mapping_versions WHERE status = 'pending'`
    );
    if (pending.rowCount) {
      const error = new Error('A מילוי index rebuild is already in progress');
      error.code = 'MILUI_REBUILD_IN_PROGRESS';
      throw error;
    }
    const inserted = await client.query(
      `INSERT INTO milui_mapping_versions (preset_name, mapping, status)
       VALUES ($1, $2::jsonb, 'pending')
       RETURNING version`,
      [presetName, mappingJson(mapping)]
    );
    return inserted.rows[0].version;
  });
}

async function markVersionFailed(db, version) {
  await db.query(
    `UPDATE milui_mapping_versions
     SET status = 'failed'
     WHERE version = $1 AND status = 'pending'`,
    [version]
  );
}

export async function rebuildAndActivateMiluiMapping(
  mapping,
  {
    db = pool,
    presetName = MILUI_PRESET_NAME,
    afterPendingCreated,
    afterInitialBuild,
  } = {}
) {
  if (!schemaAvailable && !(await detectSchema(db))) {
    throw new Error('Milui matching schema is unavailable');
  }
  const checked = normalizeMiluiMapping(mapping);
  if (!checked.valid) {
    const error = new Error(checked.error);
    error.code = 'INVALID_MILUI_MAPPING';
    throw error;
  }

  const version = await createPendingVersion(db, checked.mapping, presetName);
  try {
    await afterPendingCreated?.({ version });
    const initialBuild = await indexMissingRows(db, version, checked.mapping);
    await afterInitialBuild?.({ version, initialBuild });

    const activated = await withTransaction(db, async client => {
      await acquireExclusiveCutoverLock(client);
      // This short lock coordinates the cutover even with an older live app
      // version that does not yet participate in the advisory-lock protocol.
      await client.query('LOCK TABLE saved_entries IN SHARE MODE');
      const row = await getVersion(client, version);
      if (!row || row.status !== 'pending') {
        throw new Error(`Milui version ${version} is no longer pending`);
      }
      const catchUp = await indexMissingRows(client, version, checked.mapping);
      const coverage = await activateVersion(client, version, checked.mapping, presetName);
      return { catchUp, coverage };
    });
    lastCoverageCheckAt = Date.now();
    return {
      version,
      initialBuild,
      catchUp: activated.catchUp,
      coverage: activated.coverage,
      presetName,
      mapping: checked.mapping,
    };
  } catch (error) {
    await markVersionFailed(db, version).catch(markError => {
      console.error(`Failed to mark מילוי version ${version} failed:`, markError.message);
    });
    throw error;
  }
}

export async function indexSavedEntryForCurrentVersions(entryId, db = pool) {
  if (!schemaAvailable && !(await detectSchema(db))) return { indexed: 0, skipped: true };
  const entryResult = await db.query(
    `SELECT id, original_text FROM saved_entries WHERE id = $1`,
    [entryId]
  );
  const entry = entryResult.rows[0];
  if (!entry) return { indexed: 0, skipped: true };

  const versions = await db.query(
    `SELECT version, mapping
     FROM milui_mapping_versions
     WHERE status IN ('active', 'pending')
     ORDER BY version`
  );
  let indexed = 0;
  for (const version of versions.rows) {
    const checked = normalizeMiluiMapping(version.mapping);
    if (!checked.valid) throw new Error(`Milui version ${version.version} has an invalid mapping`);
    const calculation = calculateMilui(entry.original_text, checked.mapping);
    if (!calculation?.fullGematria) continue;
    const result = await db.query(
      `INSERT INTO saved_entry_milui_index
         (saved_entry_id, mapping_version, full_milui_gematria)
       VALUES ($1, $2, $3)
       ON CONFLICT (saved_entry_id, mapping_version) DO NOTHING`,
      [entry.id, version.version, calculation.fullGematria]
    );
    indexed += result.rowCount;
  }
  lastCoverageCheckAt = 0;
  return { indexed, skipped: false };
}

export function invalidateMiluiCoverageCheck() {
  lastCoverageCheckAt = 0;
}

export async function ensureActiveMiluiCoverage(db = pool, { force = false } = {}) {
  if (!runtimeMatchingEnabled) return null;
  if (!schemaAvailable && !(await detectSchema(db))) return null;
  if (!force && Date.now() - lastCoverageCheckAt < COVERAGE_CHECK_INTERVAL_MS) return null;
  if (coverageCheckPromise) return coverageCheckPromise;
  coverageCheckPromise = repairActiveVersion(db)
    .then(result => {
      lastCoverageCheckAt = Date.now();
      return result;
    })
    .finally(() => {
      coverageCheckPromise = null;
    });
  return coverageCheckPromise;
}

export async function getActiveMiluiMatches(fullGematria, db = pool) {
  if (!runtimeMatchingEnabled || fullGematria <= 0) return [];
  if (!schemaAvailable && !(await detectSchema(db))) return [];
  await ensureActiveMiluiCoverage(db);
  const readHealth = () => db.query(
    `SELECT state.matching_enabled,
            (SELECT COUNT(*)::int FROM saved_entries) AS saved_entries,
            (SELECT COUNT(*)::int
             FROM saved_entry_milui_index
             WHERE mapping_version = state.active_version) AS indexed_entries
     FROM milui_index_state state
     WHERE state.id = $1`,
    [MILUI_STATE_ID]
  );
  let healthRow = (await readHealth()).rows[0];
  if (!healthRow
      || !healthRow.matching_enabled
      || healthRow.saved_entries !== healthRow.indexed_entries) {
    await ensureActiveMiluiCoverage(db, { force: true });
    healthRow = (await readHealth()).rows[0];
  }
  if (!healthRow
      || !healthRow.matching_enabled
      || healthRow.saved_entries !== healthRow.indexed_entries) {
    const error = new Error('Milui matching index is unavailable');
    error.code = 'MILUI_INDEX_UNAVAILABLE';
    throw error;
  }
  const result = await db.query(
    `SELECT se.id, se.original_text, se.normalized_text,
            se.full_gematria, se.full_gematria_hebrew,
            se.initials, se.initials_gematria, se.initials_gematria_hebrew,
            se.created_at, idx.full_milui_gematria
     FROM milui_index_state state
     JOIN saved_entry_milui_index idx ON idx.mapping_version = state.active_version
     JOIN saved_entries se ON se.id = idx.saved_entry_id
     WHERE state.id = $1
       AND state.matching_enabled = TRUE
       AND idx.full_milui_gematria = $2
     ORDER BY se.created_at DESC`,
    [MILUI_STATE_ID, fullGematria]
  );
  return result.rows;
}

export async function deleteMiluiIndexRows(client, entryId) {
  if (!schemaAvailable && !(await detectSchema(client))) return;
  await client.query(
    `DELETE FROM saved_entry_milui_index WHERE saved_entry_id = $1`,
    [entryId]
  );
  lastCoverageCheckAt = 0;
}

export async function getMiluiIndexReport(db = pool) {
  if (!schemaAvailable && !(await detectSchema(db))) {
    return { schemaAvailable: false };
  }
  const result = await db.query(
    `SELECT state.active_version,
            state.matching_enabled,
            (SELECT COUNT(*)::int FROM saved_entries) AS saved_entries,
            (SELECT COUNT(*)::int
             FROM saved_entry_milui_index
             WHERE mapping_version = state.active_version) AS indexed_entries
     FROM milui_index_state state
     WHERE state.id = $1`,
    [MILUI_STATE_ID]
  );
  const row = result.rows[0];
  if (!row) return { schemaAvailable: true, activeVersion: null };
  return {
    schemaAvailable: true,
    activeVersion: row.active_version,
    matchingEnabled: row.matching_enabled,
    savedEntries: row.saved_entries,
    indexedEntries: row.indexed_entries,
    missing: row.saved_entries - row.indexed_entries,
  };
}