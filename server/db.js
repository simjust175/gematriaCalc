import pg from 'pg';
import { computeAll } from '../src/composables/useGematria.js';
import { TANACH_PARSHIOT } from './tanachParshiot.js';
import { UXLC_REPRESENTATION_VERSION } from './uxlcText.js';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function seedTanachParshiot(db = pool) {
  const availableBooks = await db.query(
    `SELECT COUNT(*)::int AS count FROM tanach_books
     WHERE slug = ANY($1::text[])`,
    [['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']]
  );
  if (availableBooks.rows[0].count !== 5) return false;

  for (const parsha of TANACH_PARSHIOT) {
    const boundaries = [parsha.start, parsha.end];
    for (const boundary of boundaries) {
      const verse = await db.query(
        `SELECT 1 FROM tanach_verses
         WHERE book_slug = $1 AND chapter = $2 AND verse = $3`,
        [boundary.bookSlug, boundary.chapter, boundary.verse]
      );
      if (!verse.rowCount) {
        throw new Error(`Parashah boundary missing from imported corpus: ${parsha.nameHe}`);
      }
    }

    await db.query(
      `INSERT INTO tanach_parshiot
         (id, canonical_order, name_he, start_book_slug, start_chapter, start_verse,
          end_book_slug, end_chapter, end_verse)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET canonical_order = EXCLUDED.canonical_order,
         name_he = EXCLUDED.name_he, start_book_slug = EXCLUDED.start_book_slug,
         start_chapter = EXCLUDED.start_chapter, start_verse = EXCLUDED.start_verse,
         end_book_slug = EXCLUDED.end_book_slug, end_chapter = EXCLUDED.end_chapter,
         end_verse = EXCLUDED.end_verse`,
      [
        parsha.id, parsha.canonicalOrder, parsha.nameHe,
        parsha.start.bookSlug, parsha.start.chapter, parsha.start.verse,
        parsha.end.bookSlug, parsha.end.chapter, parsha.end.verse,
      ]
    );
  }
  return true;
}

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
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      representation_version INTEGER NOT NULL DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS tanach_parshiot (
      id TEXT PRIMARY KEY,
      canonical_order INTEGER NOT NULL UNIQUE CHECK (canonical_order BETWEEN 1 AND 54),
      name_he TEXT NOT NULL UNIQUE,
      start_book_slug TEXT NOT NULL REFERENCES tanach_books(slug),
      start_chapter INTEGER NOT NULL CHECK (start_chapter > 0),
      start_verse INTEGER NOT NULL CHECK (start_verse > 0),
      end_book_slug TEXT NOT NULL REFERENCES tanach_books(slug),
      end_chapter INTEGER NOT NULL CHECK (end_chapter > 0),
      end_verse INTEGER NOT NULL CHECK (end_verse > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_tanach_parshiot_order ON tanach_parshiot(canonical_order);

    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_book_slug TEXT;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_book_label TEXT;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_chapter INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_verse INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_start INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS tanach_end INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS parsha_id TEXT REFERENCES tanach_parshiot(id);
    ALTER TABLE tanach_sources ADD COLUMN IF NOT EXISTS representation_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE saved_entries DROP CONSTRAINT IF EXISTS saved_entries_normalized_text_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_entries_manual_text_unique
      ON saved_entries(normalized_text) WHERE tanach_book_slug IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_entries_tanach_occurrence_unique
      ON saved_entries(tanach_book_slug, tanach_chapter, tanach_verse, tanach_start, tanach_end)
      WHERE tanach_book_slug IS NOT NULL;
  `);

  await seedTanachParshiot();

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

export async function needsTanachRepresentationImport(db = pool) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS verse_count,
            COALESCE(MIN(s.representation_version), 1)::int AS representation_version
     FROM tanach_verses v
     JOIN tanach_sources s ON s.id = v.source_id`
  );
  const row = result.rows[0];
  return row.verse_count > 0 && row.representation_version < UXLC_REPRESENTATION_VERSION;
}
