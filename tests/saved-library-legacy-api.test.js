import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { computeAll } from "../src/composables/useGematria.js";
import { createTanachCursor } from "../src/composables/useTanachCursor.js";
import { createLegacyPrivateSchema } from "./fixtures/legacyPrivateSchema.js";

const fixture = await createLegacyPrivateSchema();
const parentSchema = process.env.E2E_SCHEMA;
process.env.PGOPTIONS = `-c search_path=${fixture.schema}`;
process.env.APP_PASSWORD = "legacy-library-test-password";
process.env.SESSION_SECRET = "legacy-library-test-session";
process.env.TEFILLOT_ENABLED = "true";
const { app } = await import("../server/app.js");
const { pool } = await import("../server/db.js");
after(async () => {
  await pool.end();
  await fixture.close();
});

test("existing records load unchanged against the recorded private schema without optional Tefillot tables or columns", async () => {
  assert.equal(
    (await pool.query("SELECT current_schema() AS schema")).rows[0].schema,
    fixture.schema,
  );
  const optional = await pool.query(
    `SELECT to_regclass('curated_tefillot_matches') AS table,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=$1
      AND table_name='saved_entries' AND column_name='tefillot_unit_id') AS column`,
    [fixture.schema],
  );
  assert.equal(optional.rows[0].table, null);
  assert.equal(optional.rows[0].column, false);
  const verse = (
    await pool.query(`SELECT display_text FROM "${parentSchema}".tanach_verses
    WHERE book_slug='Genesis' AND chapter=1 AND verse=1`)
  ).rows[0].display_text;
  const cursor = createTanachCursor(verse);
  const firstWordEnd = computeAll(verse).words[0].word.length - 1;
  const firstWord = cursor.range(0, firstWordEnd).text;
  const target = computeAll(firstWord).fullGematria;
  const expressions = [String(target), "שלום"];
  for (const [index, originalText] of expressions.entries()) {
    const calculation = computeAll(originalText);
    await pool.query(
      `INSERT INTO saved_entries
      (id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
        initials, initials_gematria, initials_gematria_hebrew,
        finals, finals_gematria, finals_gematria_hebrew)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        index + 1,
        originalText,
        calculation.normalizedText,
        calculation.fullGematria,
        calculation.fullHebrewNumber,
        calculation.initials,
        calculation.initialsGematria,
        calculation.initialsHebrewNumber,
        calculation.finals,
        calculation.finalsGematria,
        calculation.finalsHebrewNumber,
      ],
    );
  }
  for (const [index, end] of [firstWordEnd, cursor.count - 1].entries()) {
    const originalText = cursor.range(0, end).text;
    await pool.query(
      `INSERT INTO curated_matches
      (id,parent_id,original_text,normalized_text,tanach_book_slug,tanach_book_label,
        tanach_chapter,tanach_verse,tanach_start,tanach_end,reason_codes)
      VALUES ($1,1,$2,$3,'Genesis','בראשית',1,1,0,$4,'["full_gematria"]'::jsonb)`,
      [index + 11, originalText, computeAll(originalText).normalizedText, end],
    );
  }
  const snapshot = async () => ({
    entries: (
      await pool.query(
        "SELECT to_jsonb(se) AS row FROM saved_entries se ORDER BY id",
      )
    ).rows,
    matches: (
      await pool.query(
        "SELECT to_jsonb(cm) AS row FROM curated_matches cm ORDER BY id",
      )
    ).rows,
  });
  const before = await snapshot();
  assert.equal(
    (await request(app).get("/api/entries/curated-matches")).status,
    401,
  );
  assert.equal((await request(app).get("/api/entries/counts")).status, 401);
  const agent = request.agent(app);
  assert.equal(
    (
      await agent
        .post("/api/auth/login")
        .send({ password: process.env.APP_PASSWORD })
    ).status,
    200,
  );
  const entries = await agent.get("/api/entries");
  assert.equal(entries.status, 200, JSON.stringify(entries.body));
  assert.equal(entries.body.total, 2);
  assert.equal(
    entries.body.entries.find((entry) => entry.id === 1).curated_matches.length,
    2,
  );
  const matches = await agent.get("/api/entries/curated-matches");
  assert.equal(matches.status, 200, JSON.stringify(matches.body));
  assert.equal(matches.body.total, 2);
  const word = matches.body.matches.find((match) => match.id === 11);
  assert.equal(word.parentId, 1);
  assert.equal(word.parentOriginalText, String(target));
  assert.equal(word.originalText, firstWord);
  assert.equal(word.gematriaValue, target);
  assert.deepEqual(word.tanachContext, {
    bookSlug: "Genesis",
    bookLabel: "בראשית",
    chapter: 1,
    verse: 1,
    start: 0,
    end: firstWordEnd,
  });
  const counts = await agent.get("/api/entries/counts");
  assert.equal(counts.status, 200);
  assert.deepEqual(counts.body, {
    counts: { entries: 2, matches: 2 },
    countErrors: {},
  });
  const searched = await agent
    .get("/api/entries/curated-matches")
    .query({ search: "בראשית", source: "tanach", matchType: "full_gematria" });
  assert.equal(searched.status, 200);
  assert.equal(searched.body.total, 2);
  const focused = await agent
    .get("/api/entries/curated-matches")
    .query({ focus: "tanach:11", limit: 1 });
  assert.equal(focused.body.focusedKey, "tanach:11");
  assert.equal(focused.body.matches[0].id, 11);
  assert.deepEqual(
    await snapshot(),
    before,
    "retrieval/counts/search must not rewrite existing entries or relationships",
  );
});

test("available Tefillot relationships load when optional source-display metadata columns are absent", async () => {
  // This compatibility fixture does not require an optional corpus import in
  // the database used by the ordinary API suite.
  const sourceUnit = {
    hebrew_text: "בָּרוּךְ אַתָּה",
    occasion_slug: "weekday",
    occasion_label: "חול",
    service_slug: "shacharit",
    service_label: "שחרית",
    section_key: "fixture",
    section_label: "בדיקת תאימות",
  };
  const originalText = createTanachCursor(sourceUnit.hebrew_text).range(
    0,
    1,
  ).text;
  await pool.query(`
    CREATE TABLE tefillot_sources (id TEXT PRIMARY KEY);
    CREATE TABLE tefillot_units (id BIGINT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES tefillot_sources(id),
      hebrew_text TEXT NOT NULL, occasion_slug TEXT NOT NULL, occasion_label TEXT NOT NULL,
      service_slug TEXT NOT NULL, service_label TEXT NOT NULL, section_key TEXT NOT NULL, section_label TEXT NOT NULL);
    ALTER TABLE saved_entries ADD COLUMN tefillot_unit_id BIGINT, ADD COLUMN tefillot_start INTEGER, ADD COLUMN tefillot_end INTEGER;
    CREATE TABLE curated_tefillot_matches (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES saved_entries(id),
      original_text TEXT NOT NULL, normalized_text TEXT NOT NULL, tefillot_unit_id BIGINT NOT NULL REFERENCES tefillot_units(id),
      tefillot_start INTEGER NOT NULL, tefillot_end INTEGER NOT NULL, reason_codes JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    INSERT INTO tefillot_sources VALUES ('compatibility-fixture');`);
  await pool.query(
    `INSERT INTO tefillot_units
    (id,source_id,hebrew_text,occasion_slug,occasion_label,service_slug,service_label,section_key,section_label)
    VALUES (7,'compatibility-fixture',$1,$2,$3,$4,$5,$6,$7)`,
    [
      sourceUnit.hebrew_text,
      sourceUnit.occasion_slug,
      sourceUnit.occasion_label,
      sourceUnit.service_slug,
      sourceUnit.service_label,
      sourceUnit.section_key,
      sourceUnit.section_label,
    ],
  );
  await pool.query(
    `INSERT INTO curated_tefillot_matches
    VALUES (11,1,$1,$2,7,0,1,'["full_gematria"]'::jsonb,NOW())`,
    [originalText, computeAll(originalText).normalizedText],
  );
  const before = (
    await pool.query(
      "SELECT id,original_text,full_gematria FROM saved_entries ORDER BY id",
    )
  ).rows;
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ password: process.env.APP_PASSWORD });
  const counts = await agent.get("/api/entries/counts");
  assert.deepEqual(counts.body, {
    counts: { entries: 2, matches: 3 },
    countErrors: {},
  });
  const matches = await agent
    .get("/api/entries/curated-matches")
    .query({ source: "tefillot" });
  assert.equal(matches.status, 200, JSON.stringify(matches.body));
  assert.equal(matches.body.total, 1);
  assert.equal(matches.body.matches[0].key, "tefillot:11");
  assert.equal(matches.body.matches[0].parentId, 1);
  assert.equal(matches.body.matches[0].originalText, originalText);
  assert.equal(matches.body.matches[0].tefillotContext.unitId, 7);
  assert.equal(matches.body.matches[0].tefillotContext.start, 0);
  assert.equal(matches.body.matches[0].tefillotContext.end, 1);
  assert.equal(matches.body.matches[0].tefillotContext.sourceReference, null);
  const entries = await agent.get("/api/entries");
  assert.equal(entries.status, 200, JSON.stringify(entries.body));
  assert.equal(
    entries.body.entries.find((entry) => entry.id === 1).curated_matches.length,
    3,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT id,original_text,full_gematria FROM saved_entries ORDER BY id",
      )
    ).rows,
    before,
  );
});
