ALTER TABLE saved_entries
  ADD COLUMN IF NOT EXISTS finals TEXT,
  ADD COLUMN IF NOT EXISTS finals_gematria INTEGER,
  ADD COLUMN IF NOT EXISTS finals_gematria_hebrew TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_finals ON saved_entries(finals);
CREATE INDEX IF NOT EXISTS idx_entries_finals_gematria ON saved_entries(finals_gematria);