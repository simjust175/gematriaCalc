# גימטריה — Hebrew Gematria Calculator

A premium Hebrew gematria calculator with persistent save/match system.

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Vue 3 (Composition API) + Vite |
| Styling   | Custom CSS (light, RTL, off-white) |
| Icons     | Material Design Icons (`@mdi/font`) |
| UI lib    | Vuetify 3 (theme + icons; layout is custom CSS) |
| Backend   | Express.js (port 3001) |
| Database  | Replit PostgreSQL (via `pg`) |

## Running

```bash
npm run dev        # starts Vite (port 5000) + Express API (port 3001) concurrently
npm run test       # runs gematria math tests (28 tests, node:test)
```

The Vite dev server proxies `/api` to `http://localhost:3001`.

## Architecture

```
src/
  composables/useGematria.js   # pure math: normalize, calcGematria, toHebrewNumber, computeAll
  components/
    AppBar.vue                  # header — גימטריה logo + שמורים/מחשבון nav
    GimForm.vue                 # main calculator (live calc, save, word/letter breakdown)
    MatchPanel.vue              # live match sidebar (primary + secondary matches)
    SavedLibrary.vue            # personal library view — search, expand, delete
  plugins/vuetify.js            # light theme
  App.vue                       # root — page routing (calculator | library)

server/
  index.js                      # Express API server (port 3001)
  db.js                         # PostgreSQL pool + schema init
```

## API

| Method | Path             | Description                           |
|--------|------------------|---------------------------------------|
| GET    | /api/matches     | Live match lookup by gematria / ראשי תיבות |
| POST   | /api/entries     | Save a phrase (deduplicates on normalizedText) |
| GET    | /api/entries     | List library (supports text + numeric search) |
| DELETE | /api/entries/:id | Delete saved entry                    |

## Gematria rules

- Standard values; final letters (ך,ם,ן,ף,ץ) use their regular values (20,40,50,80,90)
- Niqqud (U+05B0–U+05C7) and cantillation (U+0591–U+05AF) are stripped before calculation
- Spaces and punctuation contribute 0
- Hebrew numeral 15 → טו, 16 → טז (avoids יה / יו)

## Database schema

- **saved_entries** — full phrase data, indexed on `full_gematria` and `initials_gematria`
- **saved_words**   — individual words from each entry, indexed on `gematria`
