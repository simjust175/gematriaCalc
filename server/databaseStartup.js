import { assertMultiUserPool } from './databaseRouter.js';

/**
 * Initialize the two database roles independently. Missing multi-user
 * configuration is intentionally non-fatal for the legacy client.
 */
export async function initializeDatabaseRoles({
  legacyDb,
  multiUserDb,
  initializeDb,
}) {
  if (!legacyDb) throw new Error('Legacy database is not configured');

  await initializeDb({ db: legacyDb, initializeMultiUser: false });

  if (!multiUserDb) {
    return { legacyReady: true, multiUserReady: false };
  }

  assertMultiUserPool(multiUserDb);
  await initializeDb({ db: multiUserDb, initializeMultiUser: true });
  return { legacyReady: true, multiUserReady: true };
}
