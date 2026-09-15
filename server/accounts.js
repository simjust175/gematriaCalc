import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { assertMultiUserPool } from './databaseRouter.js';

const scrypt = promisify(scryptCallback);
export const LEGACY_ACCOUNT_KEY = 'legacy-private-client';
export const SIGNUP_ENABLED = process.env.PUBLIC_SIGNUP_ENABLED === 'true';

const PRIVATE_TABLES = [
  ['saved_entries', 'id'],
  ['saved_words', 'id'],
  ['base_words', 'id'],
  ['curated_matches', 'id'],
  ['explicit_milui_interpretations', 'id'],
  ['saved_entry_milui_save_modes', 'saved_entry_id'],
  ['saved_entry_milui_form_index', 'saved_entry_id, form_id'],
  ['saved_entry_milui_index', 'saved_entry_id, mapping_version'],
  ['milui_preferences', 'id'],
  ['milui_mapping_versions', 'version'],
  ['milui_index_state', 'id'],
];

async function tableExists(db, tableName) {
  const result = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [tableName]);
  return result.rows[0]?.present === true;
}

async function snapshotPrivateData(db) {
  const snapshot = {};
  for (const [tableName, orderBy] of PRIVATE_TABLES) {
    if (!(await tableExists(db, tableName))) continue;
    const result = await db.query(
      `SELECT COUNT(*)::int AS row_count,
              md5(COALESCE(string_agg((to_jsonb(row_data) - 'owner_id')::text, '|'
                ORDER BY ${orderBy}), '')) AS content_fingerprint
       FROM ${tableName} row_data`
    );
    snapshot[tableName] = result.rows[0];
  }
  return snapshot;
}

function assertSnapshotsUnchanged(before, after) {
  for (const [tableName, previous] of Object.entries(before)) {
    const current = after[tableName];
    if (!current
        || previous.row_count !== current.row_count
        || previous.content_fingerprint !== current.content_fingerprint) {
      throw new Error(`Private data changed unexpectedly while assigning ownership: ${tableName}`);
    }
  }
}

async function addOwnerColumn(db, tableName) {
  if (!(await tableExists(db, tableName))) return false;
  await db.query(
    `ALTER TABLE ${tableName}
       ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES app_accounts(id) ON DELETE CASCADE`
  );
  return true;
}

async function setOwnerNotNull(db, tableName) {
  if (!(await tableExists(db, tableName))) return;
  await db.query(`ALTER TABLE ${tableName} ALTER COLUMN owner_id SET NOT NULL`);
}

export async function getLegacyAccount(db) {
  if (db?.databaseRole === 'legacy') {
    return {
      id: 0,
      account_key: LEGACY_ACCOUNT_KEY,
      account_type: 'legacy_client',
      email: null,
      is_hidden: true,
      plan_code: 'legacy_unlimited',
      entitlement_status: 'active',
      is_unlimited: true,
      billing_exempt: true,
    };
  }
  assertMultiUserPool(db);
  const result = await db.query(
    `SELECT account.id, account.account_key, account.account_type, account.is_hidden,
            entitlement.plan_code, entitlement.status AS entitlement_status,
            entitlement.is_unlimited, entitlement.billing_exempt
     FROM app_accounts account
     JOIN account_entitlements entitlement ON entitlement.account_id = account.id
     WHERE account.account_key = $1 AND account.account_type = 'legacy_client'`,
    [LEGACY_ACCOUNT_KEY]
  );
  if (result.rowCount !== 1) throw new Error('Exactly one legacy client account is required');
  return result.rows[0];
}

export async function getAccountById(db, accountId) {
  assertMultiUserPool(db);
  const result = await db.query(
    `SELECT account.id, account.account_key, account.account_type, account.email,
            account.is_hidden, entitlement.plan_code,
            entitlement.status AS entitlement_status,
            entitlement.is_unlimited, entitlement.billing_exempt
     FROM app_accounts account
     JOIN account_entitlements entitlement ON entitlement.account_id = account.id
     WHERE account.id = $1 AND account.disabled_at IS NULL`,
    [accountId]
  );
  return result.rows[0] || null;
}

export async function ensureMultiUserFoundation(db, { allowSchemaChanges = false } = {}) {
  assertMultiUserPool(db);
  if (!allowSchemaChanges) {
    const required = await db.query(
      `SELECT to_regclass('app_accounts') IS NOT NULL AS accounts,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'saved_entries'
                  AND column_name = 'owner_id'
              ) AS ownership`
    );
    if (!required.rows[0]?.accounts || !required.rows[0]?.ownership) {
      throw new Error('Multi-user schema is unavailable; apply the reviewed development schema through Publish');
    }
    return { legacyAccount: await getLegacyAccount(db), backfilled: {}, before: {}, after: {} };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [89461320]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_accounts (
        id BIGSERIAL PRIMARY KEY,
        account_key TEXT NOT NULL UNIQUE,
        account_type TEXT NOT NULL
          CHECK (account_type IN ('legacy_client', 'standard')),
        email TEXT,
        password_hash TEXT,
        is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        disabled_at TIMESTAMPTZ,
        CHECK (
          (account_type = 'legacy_client' AND email IS NULL AND password_hash IS NULL)
          OR
          (account_type = 'standard' AND email IS NOT NULL AND password_hash IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_accounts_email_unique
        ON app_accounts (LOWER(email)) WHERE email IS NOT NULL;

      CREATE TABLE IF NOT EXISTS account_entitlements (
        account_id BIGINT PRIMARY KEY REFERENCES app_accounts(id) ON DELETE CASCADE,
        plan_code TEXT NOT NULL CHECK (plan_code IN ('legacy_unlimited', 'free', 'premium')),
        status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'past_due', 'cancelled')),
        is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
        billing_exempt BOOLEAN NOT NULL DEFAULT FALSE,
        subscription_provider TEXT,
        subscription_customer_id TEXT,
        subscription_id TEXT,
        current_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const legacyInsert = await client.query(
      `INSERT INTO app_accounts (account_key, account_type, is_hidden)
       VALUES ($1, 'legacy_client', TRUE)
       ON CONFLICT (account_key) DO UPDATE
         SET account_type = 'legacy_client', is_hidden = TRUE, updated_at = NOW()
       RETURNING id`,
      [LEGACY_ACCOUNT_KEY]
    );
    const legacyId = legacyInsert.rows[0].id;
    await client.query(
      `INSERT INTO account_entitlements
         (account_id, plan_code, status, is_unlimited, billing_exempt)
       VALUES ($1, 'legacy_unlimited', 'active', TRUE, TRUE)
       ON CONFLICT (account_id) DO UPDATE
         SET plan_code = 'legacy_unlimited', status = 'active',
             is_unlimited = TRUE, billing_exempt = TRUE, updated_at = NOW()`,
      [legacyId]
    );

    for (const [tableName] of PRIVATE_TABLES) await addOwnerColumn(client, tableName);
    const before = await snapshotPrivateData(client);
    const backfilled = {};
    const assign = async (tableName, sql, params = null) => {
      if (!(await tableExists(client, tableName))) return;
      const queryParams = params ?? (sql.includes('$1') ? [legacyId] : []);
      const result = await client.query(sql, queryParams);
      backfilled[tableName] = result.rowCount;
    };

    await assign('saved_entries',
      'UPDATE saved_entries SET owner_id = $1 WHERE owner_id IS NULL');
    await assign('saved_words',
      `UPDATE saved_words word SET owner_id = entry.owner_id
       FROM saved_entries entry
       WHERE word.entry_id = entry.id AND word.owner_id IS NULL`);
    await assign('base_words',
      'UPDATE base_words SET owner_id = $1 WHERE owner_id IS NULL');
    await assign('curated_matches',
      `UPDATE curated_matches match SET owner_id = entry.owner_id
       FROM saved_entries entry
       WHERE match.parent_id = entry.id AND match.owner_id IS NULL`);
    await assign('explicit_milui_interpretations',
      `UPDATE explicit_milui_interpretations interpretation
       SET owner_id = entry.owner_id
       FROM saved_entries entry
       WHERE interpretation.linked_saved_entry_id = entry.id
         AND interpretation.owner_id IS NULL`);
    await assign('explicit_milui_interpretations',
      `UPDATE explicit_milui_interpretations
       SET owner_id = $1
       WHERE owner_id IS NULL`);
    for (const tableName of [
      'saved_entry_milui_save_modes',
      'saved_entry_milui_form_index',
      'saved_entry_milui_index',
    ]) {
      await assign(tableName,
        `UPDATE ${tableName} child SET owner_id = entry.owner_id
         FROM saved_entries entry
         WHERE child.saved_entry_id = entry.id AND child.owner_id IS NULL`);
    }
    for (const tableName of [
      'milui_preferences',
      'milui_mapping_versions',
      'milui_index_state',
    ]) {
      await assign(tableName, `UPDATE ${tableName} SET owner_id = $1 WHERE owner_id IS NULL`);
    }

    const after = await snapshotPrivateData(client);
    assertSnapshotsUnchanged(before, after);

    for (const [tableName] of PRIVATE_TABLES) await setOwnerNotNull(client, tableName);
    await client.query(`
      DROP INDEX IF EXISTS idx_saved_entries_manual_text_unique;
      DROP INDEX IF EXISTS idx_saved_entries_tanach_occurrence_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_entries_owner_manual_text_unique
        ON saved_entries(owner_id, normalized_text) WHERE tanach_book_slug IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_entries_owner_tanach_occurrence_unique
        ON saved_entries(owner_id, tanach_book_slug, tanach_chapter, tanach_verse, tanach_start, tanach_end)
        WHERE tanach_book_slug IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_saved_entries_owner_created
        ON saved_entries(owner_id, created_at DESC, id DESC);

      ALTER TABLE base_words DROP CONSTRAINT IF EXISTS base_words_normalized_text_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_base_words_owner_text_unique
        ON base_words(owner_id, normalized_text);

      ALTER TABLE explicit_milui_interpretations
        DROP CONSTRAINT IF EXISTS explicit_milui_interpretations_normalized_text_calculation__key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_explicit_milui_owner_selection_unique
        ON explicit_milui_interpretations
          (owner_id, normalized_text, calculation_mode, selection_fingerprint, full_milui_gematria);

      DROP INDEX IF EXISTS idx_milui_mapping_one_active;
      DROP INDEX IF EXISTS idx_milui_mapping_one_pending;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_mapping_owner_one_active
        ON milui_mapping_versions(owner_id) WHERE status = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_mapping_owner_one_pending
        ON milui_mapping_versions(owner_id) WHERE status = 'pending';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_preferences_owner_unique
        ON milui_preferences(owner_id);
      ALTER TABLE milui_index_state DROP CONSTRAINT IF EXISTS milui_index_state_pkey;
      ALTER TABLE milui_index_state
        ADD CONSTRAINT milui_index_state_pkey PRIMARY KEY (id, owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_milui_state_owner_unique
        ON milui_index_state(owner_id);
      CREATE INDEX IF NOT EXISTS idx_saved_entry_milui_owner_lookup
        ON saved_entry_milui_index(owner_id, mapping_version, full_milui_gematria);
    `);
    await client.query('COMMIT');

    const legacyAccount = await getLegacyAccount(db);
    console.log(
      `Multi-user ownership verified: legacy account ${legacyAccount.id}; `
      + `backfilled ${JSON.stringify(backfilled)}; deleted 0; content modified 0`
    );
    return { legacyAccount, backfilled, before, after };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('base64')}:${Buffer.from(derived).toString('base64')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const [scheme, saltValue, hashValue] = encoded.split(':');
  if (scheme !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64');
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, 'base64'), expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createStandardAccount(db, { email, password }) {
  assertMultiUserPool(db);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error('Invalid email');
    error.code = 'INVALID_EMAIL';
    throw error;
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    const error = new Error('Password must contain at least 12 characters');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }
  const passwordHash = await hashPassword(password);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO app_accounts
         (account_key, account_type, email, password_hash, is_hidden)
       VALUES ($1, 'standard', $2, $3, FALSE)
       RETURNING id`,
      [`user:${normalizedEmail}`, normalizedEmail, passwordHash]
    );
    await client.query(
      `INSERT INTO account_entitlements
         (account_id, plan_code, status, is_unlimited, billing_exempt)
       VALUES ($1, 'free', 'active', FALSE, FALSE)`,
      [account.rows[0].id]
    );
    await client.query('COMMIT');
    return getAccountById(db, account.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') error.code = 'ACCOUNT_EXISTS';
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateStandardAccount(db, { email, password }) {
  assertMultiUserPool(db);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const result = await db.query(
    `SELECT id, password_hash
     FROM app_accounts
     WHERE account_type = 'standard' AND LOWER(email) = $1 AND disabled_at IS NULL`,
    [normalizedEmail]
  );
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  return getAccountById(db, row.id);
}

export function serializeAccount(account) {
  return {
    id: Number(account.id),
    accountType: account.account_type,
    planCode: account.plan_code,
    entitlementStatus: account.entitlement_status,
    unlimited: account.is_unlimited,
    billingExempt: account.billing_exempt,
    hidden: account.is_hidden,
  };
}