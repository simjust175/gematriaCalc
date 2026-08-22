#!/usr/bin/env bash
set -euo pipefail

# Keep task merges reproducible: restore the lockfile dependency tree, then
# fail early if the merged frontend cannot build. The API initializes its own
# database schema when the application workflow starts.
npm ci --ignore-scripts
npm run build