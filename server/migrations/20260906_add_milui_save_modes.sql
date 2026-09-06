-- Additive provenance for distinguishing primary-only and all-form מילוי saves.
CREATE TABLE IF NOT EXISTS saved_entry_milui_save_modes (
  saved_entry_id INTEGER PRIMARY KEY REFERENCES saved_entries(id) ON DELETE CASCADE,
  save_mode TEXT NOT NULL CHECK (save_mode IN ('primary_only', 'all_forms')),
  form_ids JSONB NOT NULL DEFAULT '["primary"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_entry_milui_form_index (
  saved_entry_id INTEGER NOT NULL REFERENCES saved_entries(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  full_milui_gematria INTEGER NOT NULL CHECK (full_milui_gematria > 0),
  expanded_text TEXT NOT NULL,
  interpretation_id BIGINT REFERENCES explicit_milui_interpretations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (saved_entry_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_entry_milui_form_total
  ON saved_entry_milui_form_index(full_milui_gematria, saved_entry_id);