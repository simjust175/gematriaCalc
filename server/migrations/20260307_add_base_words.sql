-- Additive canonical collection for explicitly curated מילות יסוד.
-- This migration intentionally does not read, alter, or migrate saved/Tanach data.
CREATE TABLE IF NOT EXISTS base_words (
  id SERIAL PRIMARY KEY,
  original_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL UNIQUE,
  full_gematria INTEGER NOT NULL CHECK (full_gematria > 0),
  source_type TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_base_words_created_at ON base_words(created_at, id);