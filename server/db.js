import pg from 'pg';
import { computeAll } from '../src/composables/useGematria.js';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_entries (
      id SERIAL PRIMARY KEY,
      original_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      full_gematria INTEGER NOT NULL,
      full_gematria_hebrew TEXT NOT NULL,
      initials TEXT NOT NULL,
      initials_gematria INTEGER NOT NULL,
      initials_gematria_hebrew TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(normalized_text)
    );

    CREATE TABLE IF NOT EXISTS saved_words (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      gematria INTEGER NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_gematria ON saved_entries(full_gematria);
    CREATE INDEX IF NOT EXISTS idx_entries_initials_gematria ON saved_entries(initials_gematria);
    CREATE INDEX IF NOT EXISTS idx_words_gematria ON saved_words(gematria);
  `);

  // Backfill derived ראשי תיבות data for entries created before these fields
  // became part of the saved-entry contract.
  const existing = await pool.query(
    'SELECT id, original_text FROM saved_entries ORDER BY id'
  );
  for (const entry of existing.rows) {
    const calculated = computeAll(entry.original_text);
    if (!calculated) continue;
    await pool.query(
      `UPDATE saved_entries
       SET normalized_text = $1,
           full_gematria = $2,
           full_gematria_hebrew = $3,
           initials = $4,
           initials_gematria = $5,
           initials_gematria_hebrew = $6
       WHERE id = $7`,
      [
        calculated.normalizedText,
        calculated.fullGematria,
        calculated.fullHebrewNumber,
        calculated.initials,
        calculated.initialsGematria,
        calculated.initialsHebrewNumber,
        entry.id,
      ]
    );
  }

  console.log('Database initialized');
}
