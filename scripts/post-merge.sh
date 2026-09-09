#!/usr/bin/env bash
set -euo pipefail

# Replit runs this setup only after a task merge against the development
# environment. Production schema changes are applied separately by Publish.
npm ci --ignore-scripts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/20260307_add_base_words.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/20260906_add_explicit_milui_interpretations.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/20260906_add_milui_save_modes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/20260906_add_finals.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/20260909_add_curated_matches.sql
npm run build
