---
name: UXLC representation upgrades
description: The shared pointed qere policy and its corpus/cache upgrade contract.
---

Use the imported, pointed qere display representation as the single source for
the Tanach reader, gematria discovery, highlighting, and provenance saves.

**Why:** A legacy UXLC import omitted qere readings and could retain editorial
payloads, which made the displayed verse, discovery ranges, and save validation
disagree. Corpus refreshes can also invalidate previously cached letter indexes.

**How to apply:** Any future importer or representation change must advance the
stored representation version, complete the upgrade before serving requests, and
make all corpus-derived caches revision-aware.