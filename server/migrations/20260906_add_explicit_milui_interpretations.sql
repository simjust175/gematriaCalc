-- Additive storage for deliberate, occurrence-level מילוי interpretations.
-- Ordinary saved entries, words, Tanach, base words, and derived indexes are untouched.
CREATE TABLE IF NOT EXISTS explicit_milui_interpretations (
  id BIGSERIAL PRIMARY KEY,
  original_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  calculation_mode TEXT NOT NULL DEFAULT 'full_milui'
    CHECK (calculation_mode = 'full_milui'),
  full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
  filling_only_gematria INTEGER NOT NULL CHECK (filling_only_gematria >= 0),
  expanded_text TEXT NOT NULL,
  selections JSONB NOT NULL,
  mapping_snapshot JSONB NOT NULL,
  mapping_version BIGINT,
  registry_version TEXT NOT NULL,
  selection_fingerprint TEXT NOT NULL,
  linked_saved_entry_id INTEGER REFERENCES saved_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(normalized_text, calculation_mode, selection_fingerprint, full_milui_gematria)
);

CREATE INDEX IF NOT EXISTS idx_explicit_milui_total
  ON explicit_milui_interpretations(calculation_mode, full_milui_gematria, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_explicit_milui_normalized
  ON explicit_milui_interpretations(normalized_text, created_at DESC);