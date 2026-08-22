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

    CREATE TABLE IF NOT EXISTS tanach_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      build TEXT NOT NULL,
      published_at TEXT NOT NULL,
      attribution TEXT NOT NULL,
      license TEXT NOT NULL,
      source_url TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tanach_books (
      slug TEXT PRIMARY KEY,
      canonical_order INTEGER NOT NULL CHECK (canonical_order BETWEEN 1 AND 24),
      segment_order INTEGER NOT NULL,
      canonical_name TEXT NOT NULL,
      hebrew_name TEXT NOT NULL,
      english_name TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      chapter_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tanach_verses (
      id BIGSERIAL PRIMARY KEY,
      book_slug TEXT NOT NULL REFERENCES tanach_books(slug) ON DELETE CASCADE,
      chapter INTEGER NOT NULL CHECK (chapter > 0),
      verse INTEGER NOT NULL CHECK (verse > 0),
      display_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES tanach_sources(id),
      UNIQUE(book_slug, chapter, verse)
    );

    CREATE INDEX IF NOT EXISTS idx_tanach_verses_book_chapter ON tanach_verses(book_slug, chapter, verse);
    CREATE INDEX IF NOT EXISTS idx_tanach_books_canonical ON tanach_books(canonical_order, segment_order);
    CREATE INDEX IF NOT EXISTS idx_tanach_verses_search
      ON tanach_verses USING GIN (to_tsvector('simple', normalized_text));

    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_book_slug TEXT;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_book_label TEXT;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_chapter INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_verse INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_start INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_end INTEGER;
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
