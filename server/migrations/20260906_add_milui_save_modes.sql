-- Additive provenance for distinguishing primary-only and all-form מילוי saves.
CREATE TABLE IF NOT EXISTS saved_entry_milui_save_modes (
  saved_entry_id INTEGER PRIMARY KEY REFERENCES saved_entries(id) ON DELETE CASCADE,
  save_mode TEXT NOT NULL CHECK (save_mode IN ('primary_only', 'all_forms')),
  form_ids JSONB NOT NULL DEFAULT '["primary"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);