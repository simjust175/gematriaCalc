async function readSchemaState(db) {
  const result = await db.query(`
    SELECT
      to_regclass('public.saved_entries') IS NOT NULL AS saved_entries,
      to_regclass('public.session') IS NOT NULL AS session
  `);
  return result.rows[0] || {};
}

export async function validatePrivateDatabase(db) {
  if (!db) throw new Error('Private database is not configured');
  const state = await readSchemaState(db);
  if (!state.saved_entries || !state.session) {
    throw new Error('Private database is missing its required existing schema');
  }
  return state;
}
