#!/usr/bin/env bash
set -euo pipefail

# Replit runs this setup only after a task merge against the development
# environment. Production schema changes are applied separately by Publish.
npm ci --ignore-scripts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/20260307_add_base_words.sql
npm run build
