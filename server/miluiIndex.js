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
const coverageCheckPromises = new Map();
const lastCoverageCheckAt = new Map();

function requireOwnerId(ownerId) {
  if (!Number.isSafeInteger(Number(ownerId)) || Number(ownerId) <= 0) {
    throw new Error('A valid account ownerId is required for מילוי operations');
  }
  return Number(ownerId);
}

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
  if (db?.databaseRole !== 'multi-user') {
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
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS milui_mapping_versions (
      version BIGSERIAL PRIMARY KEY,
      owner_id BIGINT NOT NULL,
      preset_name TEXT NOT NULL,
      mapping JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'inactive', 'failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ
    );
    ALTER TABLE milui_mapping_versions ADD COLUMN IF NOT EXISTS owner_id BIGINT;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_mapping_one_active
      ON milui_mapping_versions(owner_id) WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_mapping_one_pending
      ON milui_mapping_versions(owner_id) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS milui_index_state (
      id TEXT NOT NULL CHECK (id = 'private-default'),
      owner_id BIGINT NOT NULL,
      active_version BIGINT REFERENCES milui_mapping_versions(version) ON DELETE RESTRICT,
      matching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, owner_id)
    );
    ALTER TABLE milui_index_state ADD COLUMN IF NOT EXISTS owner_id BIGINT;

    CREATE TABLE IF NOT EXISTS saved_entry_milui_index (
      owner_id BIGINT NOT NULL,
      saved_entry_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE RESTRICT,
      mapping_version BIGINT NOT NULL REFERENCES milui_mapping_versions(version) ON DELETE RESTRICT,
      full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (saved_entry_id, mapping_version)
    );
    ALTER TABLE saved_entry_milui_index ADD COLUMN IF NOT EXISTS owner_id BIGINT;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_state_owner_unique
      ON milui_index_state(owner_id);
    CREATE INDEX IF NOT EXISTS idx_saved_entry_milui_lookup
      ON saved_entry_milui_index(owner_id, mapping_version, full_milui_gematria);
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

async function getPreference(db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const result = await db.query(
    `SELECT preset_name, mapping
     FROM milui_preferences
      WHERE owner_id = $1
      ORDER BY id
      LIMIT 1`,
    [ownerId]
  );
  const row = result.rows[0];
  const checked = normalizeMiluiMapping(row?.mapping || MILUI_DEFAULT_MAPPING);
  if (!checked.valid) throw new Error('Stored מילוי mapping is invalid');
  return {
    presetName: row?.preset_name || MILUI_PRESET_NAME,
    mapping: checked.mapping,
  };
}

async function getPreferenceRowId(db, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const result = await db.query(
    `SELECT id FROM milui_preferences
     WHERE owner_id = $1
     ORDER BY id
     LIMIT 1`,
    [ownerId]
  );
  return result.rows[0]?.id || `${MILUI_STATE_ID}-${ownerId}`;
}

async function getVersion(db, version, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const result = await db.query(
    `SELECT version, preset_name, mapping, status
     FROM milui_mapping_versions
      WHERE version = $1 AND owner_id = $2`,
    [version, ownerId]
  );
  return result.rows[0] || null;
}

async function indexMissingRows(db, version, mapping, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const missing = await db.query(
    `SELECT se.id, se.original_text
     FROM saved_entries se
      LEFT JOIN saved_entry_milui_index idx
        ON idx.saved_entry_id = se.id
       AND idx.mapping_version = $1
       AND idx.owner_id = $2
      WHERE se.owner_id = $2
        AND idx.saved_entry_id IS NULL
     ORDER BY se.id`,
    [version, ownerId]
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
           (owner_id, saved_entry_id, mapping_version, full_milui_gematria)
         SELECT $4, id, $2, $3
         FROM saved_entries
          WHERE id = $1 AND owner_id = $4
         ON CONFLICT (saved_entry_id, mapping_version) DO NOTHING`,
        [entry.id, version, calculation.fullGematria, ownerId]
      );
      indexed += inserted.rowCount;
    } catch (error) {
      failed += 1;
      console.error(`Failed to index saved entry ${entry.id} for מילוי version ${version}:`, error.message);
    }
  }
  return { indexed, failed };
}

async function getCoverage(db, version, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const result = await db.query(
    `SELECT
        (SELECT COUNT(*)::int FROM saved_entries WHERE owner_id = $2) AS saved_entries,
       (SELECT COUNT(*)::int
        FROM saved_entry_milui_index
         WHERE mapping_version = $1 AND owner_id = $2) AS indexed_entries`,
    [version, ownerId]
  );
  const row = result.rows[0];
  return {
    savedEntries: row.saved_entries,
    indexedEntries: row.indexed_entries,
    missing: row.saved_entries - row.indexed_entries,
    complete: row.saved_entries === row.indexed_entries,
  };
}

async function activateVersion(client, version, mapping, presetName, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const coverage = await getCoverage(client, version, ownerId);
  if (!coverage.complete) {
    throw new Error(
      `Cannot activate incomplete מילוי index version ${version}: ${coverage.missing} missing`
    );
  }

  const preferenceId = await getPreferenceRowId(client, ownerId);
  await client.query(
    `UPDATE milui_mapping_versions
     SET status = 'inactive'
      WHERE owner_id = $2 AND status = 'active' AND version <> $1`,
    [version, ownerId]
  );
  await client.query(
    `UPDATE milui_mapping_versions
     SET status = 'active', activated_at = NOW()
      WHERE version = $1 AND owner_id = $2 AND status IN ('pending', 'active')`,
    [version, ownerId]
  );
  await client.query(
    `INSERT INTO milui_index_state (id, owner_id, active_version, matching_enabled, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id, owner_id) DO UPDATE SET
       active_version = EXCLUDED.active_version,
        matching_enabled = EXCLUDED.matching_enabled,
        updated_at = NOW()
      WHERE milui_index_state.owner_id = EXCLUDED.owner_id`,
    [MILUI_STATE_ID, ownerId, version, runtimeMatchingEnabled]
  );
  await client.query(
    `INSERT INTO milui_preferences (id, owner_id, preset_name, mapping, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
       preset_name = EXCLUDED.preset_name,
       mapping = EXCLUDED.mapping,
        updated_at = NOW()
      WHERE milui_preferences.owner_id = EXCLUDED.owner_id`,
    [preferenceId, ownerId, presetName, mappingJson(mapping)]
  );
  return coverage;
}

async function createInitialVersion(db = pool, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const staged = await withTransaction(db, async client => {
    await acquireExclusiveCutoverLock(client);
    const existingState = await client.query(
       `SELECT active_version FROM milui_index_state
        WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [MILUI_STATE_ID, ownerId]
    );
    if (existingState.rowCount) return null;

    const existingPending = await client.query(
      `SELECT version, preset_name, mapping
       FROM milui_mapping_versions
        WHERE owner_id = $1 AND status = 'pending'
       ORDER BY version DESC
       LIMIT 1`
      , [ownerId]
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

     const preference = await getPreference(client, ownerId);
    const versionResult = await client.query(
       `INSERT INTO milui_mapping_versions (owner_id, preset_name, mapping, status)
        VALUES ($1, $2, $3::jsonb, 'pending')
       RETURNING version`,
       [ownerId, preference.presetName, mappingJson(preference.mapping)]
    );
    return {
      version: versionResult.rows[0].version,
      presetName: preference.presetName,
      mapping: preference.mapping,
    };
  });
  if (!staged) return null;

   const build = await indexMissingRows(db, staged.version, staged.mapping, ownerId);
  return withTransaction(db, async client => {
    await acquireExclusiveCutoverLock(client);
    await client.query('LOCK TABLE saved_entries IN SHARE MODE');
    const existingState = await client.query(
       `SELECT active_version FROM milui_index_state
        WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [MILUI_STATE_ID, ownerId]
    );
    if (existingState.rowCount) return null;
     const version = await getVersion(client, staged.version, ownerId);
    if (!version || version.status !== 'pending') {
      throw new Error(`Milui version ${staged.version} is no longer pending`);
    }
     const catchUp = await indexMissingRows(client, staged.version, staged.mapping, ownerId);
    const coverage = await activateVersion(
      client,
      staged.version,
      staged.mapping,
       staged.presetName,
       ownerId
    );
    return { version: staged.version, build, catchUp, coverage };
  });
}

async function repairActiveVersion(db = pool, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const stateResult = await db.query(
    `SELECT state.active_version, versions.mapping
     FROM milui_index_state state
     JOIN milui_mapping_versions versions ON versions.version = state.active_version
      WHERE state.id = $1 AND state.owner_id = $2
        AND versions.owner_id = $2`,
    [MILUI_STATE_ID, ownerId]
  );
  const state = stateResult.rows[0];
  if (!state) return null;
  const checked = normalizeMiluiMapping(state.mapping);
  if (!checked.valid) throw new Error('Active מילוי mapping is invalid');
  const build = await indexMissingRows(db, state.active_version, checked.mapping, ownerId);
  const coverage = await getCoverage(db, state.active_version, ownerId);
  await db.query(
    `UPDATE milui_index_state
     SET matching_enabled = $3, updated_at = NOW()
       WHERE id = $1 AND owner_id = $2`,
    [MILUI_STATE_ID, ownerId, runtimeMatchingEnabled && coverage.complete]
  );
  return { version: state.active_version, build, coverage };
}

export async function initializeMiluiMatching({
  db = pool,
  ownerId,
  allowSchemaChanges = process.env.NODE_ENV !== 'production',
} = {}) {
  ownerId = requireOwnerId(ownerId);
  if (allowSchemaChanges) {
    await ensureMiluiMatchingSchema(db);
  } else if (!(await detectSchema(db))) {
    console.warn('Milui matching schema is not published; matching remains disabled');
    return { schemaAvailable: false, matchingEnabled: false };
  }

  const initial = await createInitialVersion(db, ownerId);
  const repaired = initial || await repairActiveVersion(db, ownerId);
  lastCoverageCheckAt.set(ownerId, Date.now());
  return {
    schemaAvailable: true,
    matchingEnabled: runtimeMatchingEnabled && repaired?.coverage.complete === true,
    ...repaired,
  };
}

// A newly authenticated account has no private mapping rows yet.  Initialize
// it on first use rather than making account creation depend on index startup.
export async function ensureMiluiOwnerState(db = pool, ownerId) {
  ownerId = requireOwnerId(ownerId);
  const state = await db.query(
    `SELECT active_version FROM milui_index_state
     WHERE id = $1 AND owner_id = $2`,
    [MILUI_STATE_ID, ownerId]
  );
  if (state.rowCount) return state.rows[0];
  if (typeof db.connect === 'function') {
    await initializeMiluiMatching({ db, ownerId });
    const initialized = await db.query(
      `SELECT active_version FROM milui_index_state
       WHERE id = $1 AND owner_id = $2`,
      [MILUI_STATE_ID, ownerId]
    );
    return initialized.rows[0] || null;
  }

  const preference = await getPreference(db, ownerId);
  const version = await db.query(
    `INSERT INTO milui_mapping_versions (owner_id, preset_name, mapping, status)
     VALUES ($1, $2, $3::jsonb, 'active')
     RETURNING version`,
    [ownerId, preference.presetName, mappingJson(preference.mapping)]
  );
  const preferenceId = await getPreferenceRowId(db, ownerId);
  await db.query(
    `INSERT INTO milui_preferences (id, owner_id, preset_name, mapping, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id, preset_name = EXCLUDED.preset_name,
       mapping = EXCLUDED.mapping, updated_at = NOW()`,
    [preferenceId, ownerId, preference.presetName, mappingJson(preference.mapping)]
  );
  await db.query(
    `INSERT INTO milui_index_state
       (id, owner_id, active_version, matching_enabled, updated_at)
     VALUES ($1, $2, $3, TRUE, NOW())`,
    [MILUI_STATE_ID, ownerId, version.rows[0].version]
  );
  return { active_version: version.rows[0].version };
}

async function createPendingVersion(db, mapping, presetName, ownerId) {
  ownerId = requireOwnerId(ownerId);
  return withTransaction(db, async client => {
    await acquireExclusiveCutoverLock(client);
    await client.query(
      `UPDATE milui_mapping_versions
       SET status = 'failed'
       WHERE owner_id = $1 AND status = 'pending'
         AND created_at < NOW() - INTERVAL '15 minutes'`
      , [ownerId]
    );
    const pending = await client.query(
       `SELECT version FROM milui_mapping_versions
        WHERE owner_id = $1 AND status = 'pending'`,
       [ownerId]
    );
    if (pending.rowCount) {
      const error = new Error('A מילוי index rebuild is already in progress');
      error.code = 'MILUI_REBUILD_IN_PROGRESS';
      throw error;
    }
    const inserted = await client.query(
      `INSERT INTO milui_mapping_versions (owner_id, preset_name, mapping, status)
        VALUES ($1, $2, $3::jsonb, 'pending')
       RETURNING version`,
      [ownerId, presetName, mappingJson(mapping)]
    );
    return inserted.rows[0].version;
  });
}

async function markVersionFailed(db, version, ownerId) {
  ownerId = requireOwnerId(ownerId);
  await db.query(
    `UPDATE milui_mapping_versions
     SET status = 'failed'
      WHERE version = $1 AND owner_id = $2 AND status = 'pending'`,
    [version, ownerId]
  );
}

export async function rebuildAndActivateMiluiMapping(
  mapping,
  {
    db = pool,
    ownerId,
    presetName = MILUI_PRESET_NAME,
    afterPendingCreated,
    afterInitialBuild,
  } = {}
) {
  ownerId = requireOwnerId(ownerId);
  if (!schemaAvailable && !(await detectSchema(db))) {
    throw new Error('Milui matching schema is unavailable');
  }
  const checked = normalizeMiluiMapping(mapping);
  if (!checked.valid) {
    const error = new Error(checked.error);
    error.code = 'INVALID_MILUI_MAPPING';
    throw error;
  }

  const version = await createPendingVersion(db, checked.mapping, presetName, ownerId);
  try {
    await afterPendingCreated?.({ version, ownerId });
    const initialBuild = await indexMissingRows(db, version, checked.mapping, ownerId);
    await afterInitialBuild?.({ version, initialBuild, ownerId });

    const activated = await withTransaction(db, async client => {
      await acquireExclusiveCutoverLock(client);
      // This short lock coordinates the cutover even with an older live app
      // version that does not yet participate in the advisory-lock protocol.
      await client.query('LOCK TABLE saved_entries IN SHARE MODE');
       const row = await getVersion(client, version, ownerId);
      if (!row || row.status !== 'pending') {
        throw new Error(`Milui version ${version} is no longer pending`);
      }
       const catchUp = await indexMissingRows(client, version, checked.mapping, ownerId);
       const coverage = await activateVersion(
         client, version, checked.mapping, presetName, ownerId
       );
      return { catchUp, coverage };
    });
    lastCoverageCheckAt.set(ownerId, Date.now());
    return {
      version,
      initialBuild,
      catchUp: activated.catchUp,
      coverage: activated.coverage,
      presetName,
      mapping: checked.mapping,
    };
  } catch (error) {
    await markVersionFailed(db, version, ownerId).catch(markError => {
      console.error(`Failed to mark מילוי version ${version} failed:`, markError.message);
    });
    throw error;
  }
}

export async function indexSavedEntryForCurrentVersions(entryId, ownerId, db = pool) {
  if (typeof ownerId === 'object' && ownerId !== null) {
    [db, ownerId] = [ownerId, arguments[2]];
  }
  ownerId = requireOwnerId(ownerId);
  if (!schemaAvailable && !(await detectSchema(db))) return { indexed: 0, skipped: true };
  const entryResult = await db.query(
      `SELECT id, original_text FROM saved_entries WHERE id = $1 AND owner_id = $2`,
    [entryId, ownerId]
  );
  const entry = entryResult.rows[0];
  if (!entry) return { indexed: 0, skipped: true };

  const versions = await db.query(
    `SELECT version, mapping
     FROM milui_mapping_versions
      WHERE owner_id = $1 AND status IN ('active', 'pending')
      ORDER BY version`,
    [ownerId]
  );
  let indexed = 0;
  for (const version of versions.rows) {
    const checked = normalizeMiluiMapping(version.mapping);
    if (!checked.valid) throw new Error(`Milui version ${version.version} has an invalid mapping`);
    const calculation = calculateMilui(entry.original_text, checked.mapping);
    if (!calculation?.fullGematria) continue;
    const result = await db.query(
      `INSERT INTO saved_entry_milui_index
         (owner_id, saved_entry_id, mapping_version, full_milui_gematria)
        VALUES ($1, $2, $3, $4)
       ON CONFLICT (saved_entry_id, mapping_version) DO NOTHING`,
       [ownerId, entry.id, version.version, calculation.fullGematria]
    );
    indexed += result.rowCount;
  }
  lastCoverageCheckAt.set(ownerId, 0);
  return { indexed, skipped: false };
}

export function invalidateMiluiCoverageCheck(ownerId) {
  ownerId = requireOwnerId(ownerId);
  lastCoverageCheckAt.set(ownerId, 0);
}

export async function ensureActiveMiluiCoverage(db = pool, ownerId, { force = false } = {}) {
  ownerId = requireOwnerId(ownerId);
  if (!runtimeMatchingEnabled) return null;
  if (!schemaAvailable && !(await detectSchema(db))) return null;
  await ensureMiluiOwnerState(db, ownerId);
  const checkedAt = lastCoverageCheckAt.get(ownerId) || 0;
  if (!force && Date.now() - checkedAt < COVERAGE_CHECK_INTERVAL_MS) return null;
  if (coverageCheckPromises.has(ownerId)) return coverageCheckPromises.get(ownerId);
  const coverageCheckPromise = repairActiveVersion(db, ownerId)
    .then(result => {
      lastCoverageCheckAt.set(ownerId, Date.now());
      return result;
    })
    .finally(() => {
      coverageCheckPromises.delete(ownerId);
    });
  coverageCheckPromises.set(ownerId, coverageCheckPromise);
  return coverageCheckPromise;
}

export async function getActiveMiluiMatches(currentValue, ownerId, db = pool) {
  if (typeof ownerId === 'object' && ownerId !== null) {
    [db, ownerId] = [ownerId, arguments[2]];
  }
  ownerId = requireOwnerId(ownerId);
  if (!runtimeMatchingEnabled || !Number.isInteger(currentValue) || currentValue <= 0) return [];
  if (!schemaAvailable && !(await detectSchema(db))) return [];
  await ensureActiveMiluiCoverage(db, ownerId);
  const readHealth = () => db.query(
    `SELECT state.matching_enabled,
            (SELECT COUNT(*)::int FROM saved_entries WHERE owner_id = $2) AS saved_entries,
            (SELECT COUNT(*)::int
             FROM saved_entry_milui_index
              WHERE mapping_version = state.active_version
                AND owner_id = $2) AS indexed_entries
     FROM milui_index_state state
      WHERE state.id = $1 AND state.owner_id = $2`,
    [MILUI_STATE_ID, ownerId]
  );
  let healthRow = (await readHealth()).rows[0];
  if (!healthRow
      || !healthRow.matching_enabled
      || healthRow.saved_entries !== healthRow.indexed_entries) {
    await ensureActiveMiluiCoverage(db, ownerId, { force: true });
    healthRow = (await readHealth()).rows[0];
  }
  if (!healthRow
      || !healthRow.matching_enabled
      || healthRow.saved_entries !== healthRow.indexed_entries) {
    const error = new Error('Milui matching index is unavailable');
    error.code = 'MILUI_INDEX_UNAVAILABLE';
    throw error;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshotResult = await db.query(
      `SELECT state.active_version, versions.mapping
       FROM milui_index_state state
        JOIN milui_mapping_versions versions
          ON versions.version = state.active_version AND versions.owner_id = $2
        WHERE state.id = $1 AND state.owner_id = $2
         AND state.matching_enabled = TRUE`,
       [MILUI_STATE_ID, ownerId]
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) {
      const error = new Error('Milui matching index is unavailable');
      error.code = 'MILUI_INDEX_UNAVAILABLE';
      throw error;
    }

    const checked = normalizeMiluiMapping(snapshot.mapping);
    if (!checked.valid) {
      const error = new Error('Active מילוי mapping is invalid');
      error.code = 'MILUI_INDEX_UNAVAILABLE';
      throw error;
    }

    const result = await db.query(
      `WITH matching_variants AS (
         SELECT idx.saved_entry_id,
                idx.full_milui_gematria AS value,
                NULL::bigint AS interpretation_id,
                NULL::text AS expanded_text,
                'primary'::text AS source
         FROM saved_entry_milui_index idx
          WHERE idx.owner_id = $3
            AND idx.mapping_version = $1
            AND idx.full_milui_gematria = $2
         UNION ALL
         SELECT mode.saved_entry_id,
                form.full_milui_gematria AS value,
                form.interpretation_id,
                form.expanded_text,
                form.form_id AS source
         FROM saved_entry_milui_save_modes mode
         JOIN saved_entry_milui_form_index form
           ON form.saved_entry_id = mode.saved_entry_id
          WHERE mode.owner_id = $3
            AND form.owner_id = $3
            AND mode.save_mode = 'all_forms'
             AND form.full_milui_gematria = $2
       )
       SELECT se.id, se.original_text, se.normalized_text,
              se.full_gematria, se.full_gematria_hebrew,
              se.initials, se.initials_gematria, se.initials_gematria_hebrew,
                se.created_at, $2::int AS full_milui_gematria,
              jsonb_agg(
                jsonb_build_object(
                  'value', variant.value,
                  'expandedText', variant.expanded_text,
                  'interpretationId', variant.interpretation_id,
                  'source', variant.source
                )
                ORDER BY variant.interpretation_id NULLS FIRST
              ) AS matched_milui_variants
       FROM matching_variants variant
        JOIN saved_entries se ON se.id = variant.saved_entry_id
          AND se.owner_id = $3
       GROUP BY se.id
       ORDER BY se.created_at DESC`,
       [snapshot.active_version, currentValue, ownerId]
    );
    const currentState = await db.query(
      `SELECT active_version
       FROM milui_index_state
        WHERE id = $1 AND owner_id = $2`,
       [MILUI_STATE_ID, ownerId]
    );
    if (String(currentState.rows[0]?.active_version) === String(snapshot.active_version)) {
      return result.rows;
    }
  }

  const error = new Error('Milui mapping changed during matching');
  error.code = 'MILUI_INDEX_UNAVAILABLE';
  throw error;
}

export async function getActiveMiluiMultipleSources(currentValue, ownerId, db = pool) {
  if (typeof ownerId === 'object' && ownerId !== null) {
    [db, ownerId] = [ownerId, arguments[2]];
  }
  ownerId = requireOwnerId(ownerId);
  if (!runtimeMatchingEnabled || currentValue <= 0) return [];
  if (!schemaAvailable && !(await detectSchema(db))) return [];
  await ensureActiveMiluiCoverage(db, ownerId);

  const readHealth = () => db.query(
    `SELECT state.matching_enabled,
            (SELECT COUNT(*)::int FROM saved_entries WHERE owner_id = $2) AS saved_entries,
            (SELECT COUNT(*)::int
             FROM saved_entry_milui_index
              WHERE mapping_version = state.active_version
                AND owner_id = $2) AS indexed_entries
     FROM milui_index_state state
      WHERE state.id = $1 AND state.owner_id = $2`,
    [MILUI_STATE_ID, ownerId]
  );
  let healthRow = (await readHealth()).rows[0];
  if (!healthRow
      || !healthRow.matching_enabled
      || healthRow.saved_entries !== healthRow.indexed_entries) {
    await ensureActiveMiluiCoverage(db, ownerId, { force: true });
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
    `SELECT se.id AS entry_id, se.original_text, se.created_at,
            'milui_gematria'::text AS source_type,
            idx.full_milui_gematria AS source_value,
            NULL::text AS source_word
     FROM milui_index_state state
      JOIN saved_entry_milui_index idx
        ON idx.mapping_version = state.active_version AND idx.owner_id = $2
      JOIN saved_entries se ON se.id = idx.saved_entry_id AND se.owner_id = $2
      WHERE state.id = $1 AND state.owner_id = $2
       AND state.matching_enabled = TRUE
       AND idx.full_milui_gematria > 1
        AND idx.full_milui_gematria <> $3::bigint
       AND (
          ($3::bigint > idx.full_milui_gematria AND $3::bigint % idx.full_milui_gematria = 0)
          OR (idx.full_milui_gematria > $3::bigint
              AND idx.full_milui_gematria % $3::bigint = 0)
       )`,
     [MILUI_STATE_ID, ownerId, currentValue]
  );
  return result.rows;
}

export async function deleteMiluiIndexRows(client, entryId, ownerId) {
  ownerId = requireOwnerId(ownerId);
  if (!schemaAvailable && !(await detectSchema(client))) return;
  await client.query(
    `DELETE FROM saved_entry_milui_index
     WHERE saved_entry_id = $1 AND owner_id = $2`,
    [entryId, ownerId]
  );
  lastCoverageCheckAt.set(ownerId, 0);
}

export async function getMiluiIndexReport(db = pool, ownerId) {
  ownerId = requireOwnerId(ownerId);
  if (!schemaAvailable && !(await detectSchema(db))) {
    return { schemaAvailable: false };
  }
  const result = await db.query(
    `SELECT state.active_version,
            state.matching_enabled,
             (SELECT COUNT(*)::int FROM saved_entries WHERE owner_id = $2) AS saved_entries,
            (SELECT COUNT(*)::int
             FROM saved_entry_milui_index
              WHERE mapping_version = state.active_version
                AND owner_id = $2) AS indexed_entries
     FROM milui_index_state state
      WHERE state.id = $1 AND state.owner_id = $2`,
    [MILUI_STATE_ID, ownerId]
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