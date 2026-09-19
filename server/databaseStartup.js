import { assertMultiUserPool } from './databaseRouter.js';

async function readSchemaState(db) {
  const result = await db.query(`
    SELECT
      to_regclass('public.saved_entries') IS NOT NULL AS saved_entries,
      to_regclass('public.session') IS NOT NULL AS session,
      to_regclass('public.app_accounts') IS NOT NULL AS accounts,
      to_regclass('public.tefillot_units') IS NOT NULL AS tefillot,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved_entries'
          AND column_name = 'owner_id'
      ) AS ownership
  `);
  return result.rows[0] || {};
}

export async function validateLegacyDatabase(db) {
  const state = await readSchemaState(db);
  if (!state.saved_entries || !state.session) {
    throw new Error('Legacy database is missing its required existing schema');
  }
  if (state.accounts || state.ownership) {
    throw new Error('Legacy database must remain free of owner/account schema');
  }
  return state;
}

export async function validateMultiUserDatabase(db) {
  assertMultiUserPool(db);
  const state = await readSchemaState(db);
  if (!state.saved_entries || !state.session || !state.accounts
      || !state.ownership || !state.tefillot) {
    const error = new Error(
      'Multi-user database is not initialized; run npm run setup:multi-user and npm run import:tefillot explicitly'
    );
    error.code = 'MULTI_USER_DATABASE_NOT_READY';
    throw error;
  }
  return state;
}

/**
 * Initialize the two database roles independently. Missing multi-user
 * configuration is intentionally non-fatal for the legacy client.
 */
export async function initializeDatabaseRoles({
  legacyDb,
  multiUserDb,
}) {
  if (!legacyDb) throw new Error('Legacy database is not configured');

  await validateLegacyDatabase(legacyDb);

  if (!multiUserDb) {
    return { legacyReady: true, multiUserReady: false };
  }

  await validateMultiUserDatabase(multiUserDb);
  return { legacyReady: true, multiUserReady: true };
}
