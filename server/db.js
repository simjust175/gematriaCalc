import pg from 'pg';
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

