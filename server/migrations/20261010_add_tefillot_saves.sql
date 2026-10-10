-- Prepared only: never execute at startup or post-merge.
-- Apply explicitly after review. Does not alter existing saved content.
BEGIN;
ALTER TABLE saved_entries
  ADD COLUMN tefillot_unit_id BIGINT REFERENCES tefillot_units(id) ON DELETE RESTRICT,
  ADD COLUMN tefillot_start INTEGER,
  ADD COLUMN tefillot_end INTEGER,
  ADD CONSTRAINT saved_entries_tefillot_context CHECK (
    (tefillot_unit_id IS NULL AND tefillot_start IS NULL AND tefillot_end IS NULL)
    OR (tefillot_unit_id IS NOT NULL AND tefillot_start IS NOT NULL
      AND tefillot_end IS NOT NULL AND tefillot_start >= 0
      AND tefillot_end >= tefillot_start AND tanach_book_slug IS NULL)
  );
-- LIKE INCLUDING ALL (used by the isolated harness) generates index names,
-- so identify the old manual-only predicate rather than assuming its name.
DO $$
DECLARE old_index RECORD;
BEGIN
  FOR old_index IN
    SELECT index_class.relname AS name
    FROM pg_index i JOIN pg_class index_class ON index_class.oid = i.indexrelid
    WHERE i.indrelid = 'saved_entries'::regclass AND i.indisunique
      AND pg_get_expr(i.indpred, i.indrelid) = '(tanach_book_slug IS NULL)'
      AND pg_get_indexdef(i.indexrelid) LIKE '%(normalized_text)%'
  LOOP
    EXECUTE format('DROP INDEX %I.%I', current_schema(), old_index.name);
  END LOOP;
END $$;
CREATE UNIQUE INDEX idx_saved_entries_manual_text_unique
  ON saved_entries (normalized_text)
  WHERE tanach_book_slug IS NULL AND tefillot_unit_id IS NULL;
CREATE UNIQUE INDEX idx_saved_entries_tefillot_occurrence_unique
  ON saved_entries (tefillot_unit_id, tefillot_start, tefillot_end)
  WHERE tefillot_unit_id IS NOT NULL;
CREATE TABLE curated_tefillot_matches (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE CASCADE,
  tefillot_unit_id BIGINT NOT NULL REFERENCES tefillot_units(id) ON DELETE RESTRICT,
  tefillot_start INTEGER NOT NULL CHECK (tefillot_start >= 0),
  tefillot_end INTEGER NOT NULL CHECK (tefillot_end >= tefillot_start),
  original_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, tefillot_unit_id, tefillot_start, tefillot_end)
);
COMMIT;
