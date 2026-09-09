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
ALTER TABLE curated_matches ADD COLUMN IF NOT EXISTS tanach_book_label TEXT;
UPDATE curated_matches cm
SET tanach_book_label = b.hebrew_name
FROM tanach_books b
WHERE cm.tanach_book_slug = b.slug AND cm.tanach_book_label IS NULL;
ALTER TABLE curated_matches ALTER COLUMN tanach_book_label SET NOT NULL;