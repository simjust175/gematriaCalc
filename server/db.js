import pg from 'pg';
import { MILUI_DEFAULT_MAPPING, MILUI_PRESET_NAME } from '../src/utils/milui.js';
import { TANACH_PARSHIOT } from './tanachParshiot.js';
import { UXLC_REPRESENTATION_VERSION } from './uxlcText.js';
import { computeAll } from '../src/composables/useGematria.js';
import { ensureMultiUserFoundation } from './accounts.js';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

let miluiPreferencesReady = null;

export async function ensureFinalsDerived(db = pool) {
  const before = await db.query(
    `SELECT COUNT(*)::int AS entries,
            md5(COALESCE(string_agg(id::text || ':' || original_text, '|' ORDER BY id), '')) AS text_fingerprint
     FROM saved_entries`
  );
  const missing = await db.query(
    `SELECT id, original_text
     FROM saved_entries
     WHERE finals IS NULL OR finals_gematria IS NULL OR finals_gematria_hebrew IS NULL
     ORDER BY id`
  );
  for (const entry of missing.rows) {
    const calculated = computeAll(entry.original_text);
    if (!calculated) continue;
    await db.query(
      `UPDATE saved_entries
       SET finals = $1, finals_gematria = $2, finals_gematria_hebrew = $3
       WHERE id = $4
         AND (finals IS NULL OR finals_gematria IS NULL OR finals_gematria_hebrew IS NULL)`,
      [
        calculated.finals,
        calculated.finalsGematria,
        calculated.finalsHebrewNumber,
        entry.id,
      ]
    );
  }
  const after = await db.query(
    `SELECT COUNT(*)::int AS entries,
            md5(COALESCE(string_agg(id::text || ':' || original_text, '|' ORDER BY id), '')) AS text_fingerprint
     FROM saved_entries`
  );
  if (before.rows[0].entries !== after.rows[0].entries
      || before.rows[0].text_fingerprint !== after.rows[0].text_fingerprint) {
    throw new Error('Saved entry count or text changed while adding סופי תיבות');
  }
  console.log(
    `Finals backfill verified: saved_entries ${before.rows[0].entries}; `
    + `backfilled ${missing.rowCount}, deleted 0, text modified 0`
  );
}

export function ensureMiluiPreferences(db = pool) {
  if (miluiPreferencesReady) return miluiPreferencesReady;
  miluiPreferencesReady = (async () => {
    const before = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM saved_entries) AS saved_entries,
        (SELECT COUNT(*)::int FROM saved_words) AS saved_words
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS milui_preferences (
        id TEXT PRIMARY KEY,
        preset_name TEXT NOT NULL,
        mapping JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const ownership = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'milui_preferences'
           AND column_name = 'owner_id'
       ) AS available`
    );
    if (ownership.rows[0].available) {
      await db.query(
        `INSERT INTO milui_preferences (id, owner_id, preset_name, mapping)
         SELECT 'private-default', id, $1, $2::jsonb
         FROM app_accounts
         WHERE account_key = 'legacy-private-client'
         ON CONFLICT (id) DO NOTHING`,
        [MILUI_PRESET_NAME, JSON.stringify(MILUI_DEFAULT_MAPPING)]
      );
    } else {
      await db.query(
        `INSERT INTO milui_preferences (id, preset_name, mapping)
         VALUES ('private-default', $1, $2::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [MILUI_PRESET_NAME, JSON.stringify(MILUI_DEFAULT_MAPPING)]
      );
    }
    const after = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM saved_entries) AS saved_entries,
        (SELECT COUNT(*)::int FROM saved_words) AS saved_words
    `);
    if (
      before.rows[0].saved_entries !== after.rows[0].saved_entries
      || before.rows[0].saved_words !== after.rows[0].saved_words
    ) {
      throw new Error('Saved data changed while adding מילוי preferences');
    }
    console.log(
      `Milui preference migration verified: saved_entries ${before.rows[0].saved_entries}, `
      + `saved_words ${before.rows[0].saved_words}; deleted 0, modified 0`
    );
  })().catch(error => {
    miluiPreferencesReady = null;
    throw error;
  });
  return miluiPreferencesReady;
}

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
      finals TEXT,
      finals_gematria INTEGER,
      finals_gematria_hebrew TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_entries_finals ON saved_entries(finals);
    CREATE INDEX IF NOT EXISTS idx_entries_finals_gematria ON saved_entries(finals_gematria);
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
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS finals TEXT;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS finals_gematria INTEGER;
    ALTER TABLE saved_entries ADD COLUMN IF NOT EXISTS finals_gematria_hebrew TEXT;
    ALTER TABLE tanach_sources ADD COLUMN IF NOT EXISTS representation_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE saved_entries DROP CONSTRAINT IF EXISTS saved_entries_normalized_text_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_entries_manual_text_unique
      ON saved_entries(normalized_text) WHERE tanach_book_slug IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_entries_tanach_occurrence_unique
      ON saved_entries(tanach_book_slug, tanach_chapter, tanach_verse, tanach_start, tanach_end)
      WHERE tanach_book_slug IS NOT NULL;
  `);

  await ensureFinalsDerived(db);
  await seedTanachParshiot(db);

  await ensureMiluiPreferences(db);

  if (initializeMultiUser) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS curated_matches (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE CASCADE,
        original_text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        tanach_book_slug TEXT NOT NULL,
        tanach_book_label TEXT NOT NULL,
        tanach_chapter INTEGER NOT NULL,
        tanach_verse INTEGER NOT NULL,
        tanach_start INTEGER NOT NULL,
        tanach_end INTEGER NOT NULL,
        reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (parent_id, tanach_book_slug, tanach_chapter, tanach_verse, tanach_start, tanach_end)
      );
      CREATE INDEX IF NOT EXISTS idx_curated_matches_parent ON curated_matches(parent_id);
    `);
    const { ensureMiluiInterpretationSchema } = await import('./miluiInterpretations.js');
    await ensureMiluiInterpretationSchema(db);
    const { ensureMiluiMatchingSchema } = await import('./miluiIndex.js');
    await ensureMiluiMatchingSchema(db);

    const ownership = await ensureMultiUserFoundation(db, {
      allowSchemaChanges: process.env.NODE_ENV !== 'production',
    });
    const { initializeMiluiMatching } = await import('./miluiIndex.js');
    const miluiIndex = await initializeMiluiMatching({
      allowSchemaChanges: process.env.NODE_ENV !== 'production',
      ownerId: ownership.legacyAccount.id,
      db,
    });
    if (miluiIndex.schemaAvailable) {
      console.log(
        `Milui matching index ready: version ${miluiIndex.version}, `
        + `${miluiIndex.coverage.indexedEntries}/${miluiIndex.coverage.savedEntries} entries`
      );
    }
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
  return row.verse_count === 0 || row.representation_version < UXLC_REPRESENTATION_VERSION;
}
