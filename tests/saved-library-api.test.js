import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { computeAll } from "../src/composables/useGematria.js";
import {
  paginateSavedRelationships,
  parseSavedMatchQuery,
  registerSavedLibraryRoutes,
} from "../server/savedLibrary.js";

function row(id, overrides = {}) {
  return {
    id,
    source_type: "tanach",
    parent_id: id + 1000,
    parent_original_text: "אב",
    parent_gematria: 3,
    original_text: "אָב",
    reason_codes: ["full_gematria"],
    created_at: new Date(2026, 0, id).toISOString(),
    tanach_book_slug: "Genesis",
    tanach_book_label: "בראשית",
    tanach_chapter: 1,
    tanach_verse: 1,
    tanach_start: 0,
    tanach_end: 1,
    ...overrides,
  };
}

test("saved match retrieval searches every parent and match, including pointed text and numeric targets", () => {
  const rows = Array.from({ length: 125 }, (_, index) =>
    row(index + 1, {
      parent_original_text: index === 0 ? "הורה ישן במיוחד" : `אב ${index + 1}`,
      original_text: index === 0 ? "שָׁלוֹם" : "אָב",
    }),
  );
  const query = (search) =>
    paginateSavedRelationships(
      rows,
      parseSavedMatchQuery({ search, limit: "10" }),
      200,
    );
  assert.equal(query("הורה ישן").matches[0].id, 1);
  assert.equal(query("שלום").matches[0].id, 1);
  assert.equal(query(String(computeAll("שלום").fullGematria)).matches[0].id, 1);
  assert.equal(query("לא קיים").total, 0);
  assert.deepEqual(query("לא קיים").counts, { matches: 125, entries: 200 });
});

test("focus locates an exact old relationship and continues from its actual sorted page", () => {
  const rows = Array.from({ length: 125 }, (_, index) => row(index + 1));
  const page = paginateSavedRelationships(
    rows,
    parseSavedMatchQuery({ limit: "10", focus: "tanach:2" }),
    130,
  );
  assert.equal(page.focusedKey, "tanach:2");
  assert.ok(page.matches.some((match) => match.key === "tanach:2"));
  assert.equal(page.pagination.offset, 120);
  assert.equal(page.pagination.nextOffset, 125);
  assert.equal(page.pagination.hasMore, false);
  const first = paginateSavedRelationships(
    rows,
    parseSavedMatchQuery({ limit: "10" }),
    130,
  );
  assert.equal(first.pagination.nextOffset, 10);
  assert.equal(first.pagination.hasMore, true);
});

test("source, reason and sorting operate on relationships, with exact source coordinates preserved", () => {
  const rows = [
    row(1),
    row(2, {
      source_type: "tefillot",
      tefillot_unit_id: "19",
      tefillot_start: 2,
      tefillot_end: 5,
      section_key: "morning",
      section_label: "ברכות",
      source_reference: "סידור",
      reason_codes: ["initials_text"],
      original_text: "אור ברכה",
    }),
  ];
  const page = paginateSavedRelationships(
    rows,
    parseSavedMatchQuery({ source: "tefillot", matchType: "initials_text" }),
    4,
  );
  assert.equal(page.total, 1);
  assert.equal(page.matches[0].key, "tefillot:2");
  assert.equal(page.matches[0].tefillotContext.unitId, 19);
  assert.equal(page.matches[0].tefillotContext.start, 2);
  assert.equal(page.matches[0].tefillotContext.sourceReference, "סידור");
  assert.equal(page.matches[0].gematriaValue, 3);
  assert.equal(page.matches[0].tanachContext, null);
  const oldest = paginateSavedRelationships(
    rows,
    parseSavedMatchQuery({ sort: "oldest" }),
    4,
  );
  assert.equal(oldest.matches[0].id, 1);
});

test("display calculations use the engine and never invent a common value from a saved badge", () => {
  const page = paginateSavedRelationships(
    [
      row(1, {
        parent_gematria: 999,
        parent_original_text: "3",
        original_text: "אָב",
      }),
      row(2, { original_text: "שלום" }),
    ],
    parseSavedMatchQuery({ sort: "oldest" }),
    2,
  );
  assert.equal(page.matches[0].parentOriginalText, "3");
  assert.equal(page.matches[0].parentGematria, 3);
  assert.equal(page.matches[0].gematriaValue, 3);
  assert.deepEqual(page.matches[0].calculation, computeAll("אָב"));
  assert.equal(page.matches[1].gematriaValue, null);
  assert.equal(page.matches[1].fullGematria, 376);
});

test("saved match query rejects invalid filters, pagination and ambiguous focus keys", () => {
  for (const query of [
    { source: "users" },
    { matchType: "invented" },
    { sort: "sql" },
    { limit: "0" },
    { limit: "101" },
    { offset: "-1" },
    { limit: ["1"] },
    { offset: ["0"] },
    { search: ["אב"] },
    { focus: "2" },
    { focus: "tanach:0" },
  ])
    assert.ok(parseSavedMatchQuery(query).error, JSON.stringify(query));
});

test("GET saved matches enforces auth, handles legacy schema, and returns useful errors", async () => {
  const app = express();
  let fail = false;
  const queries = [];
  const pool = {
    async query(sql) {
      queries.push(sql);
      if (fail) throw new Error("test database unavailable");
      if (sql.includes("FROM curated_matches")) return { rows: [row(1)] };
      if (sql.includes("AS ready")) return { rows: [{ ready: false }] };
      if (sql.includes("COUNT(*)::int AS count"))
        return { rows: [{ count: 7 }] };
      throw new Error("Unexpected query");
    },
  };
  registerSavedLibraryRoutes(app, {
    pool,
    requireAuth: (req, res, next) =>
      req.headers.authorization === "test-session"
        ? next()
        : res.status(401).json({ error: "unauthorized" }),
  });
  assert.equal(
    (await request(app).get("/api/entries/curated-matches")).status,
    401,
  );
  assert.equal(queries.length, 0);
  const get = () =>
    request(app)
      .get("/api/entries/curated-matches")
      .set("authorization", "test-session");
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.body.matches[0].parentId, 1001);
  assert.deepEqual(response.body.counts, { matches: 1, entries: 7 });
  assert.equal((await get().query({ source: "invalid" })).status, 400);
  fail = true;
  const previousError = console.error;
  console.error = () => {};
  try {
    const failed = await get();
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, "saved_matches_load_failed");
  } finally {
    console.error = previousError;
  }
});

test("GET saved matches combines enabled Tefillot with Tanach without confusing colliding IDs", async () => {
  const previous = process.env.TEFILLOT_ENABLED;
  process.env.TEFILLOT_ENABLED = "true";
  const app = express();
  const pool = {
    async query(sql) {
      if (sql.includes("FROM curated_matches")) return { rows: [row(1)] };
      if (sql.includes("AS ready")) return { rows: [{ ready: true }] };
      if (sql.includes("AS sources"))
        return { rows: [{ sources: true, units: true }] };
      if (sql.includes("AS populated")) return { rows: [{ populated: true }] };
      if (sql.includes("FROM curated_tefillot_matches"))
        return {
          rows: [
            row(1, {
              source_type: "tefillot",
              tefillot_unit_id: "4",
              tefillot_start: 0,
              tefillot_end: 1,
              source_reference: "ברכות השחר",
            }),
          ],
        };
      if (sql.includes("COUNT(*)::int AS count"))
        return { rows: [{ count: 1 }] };
      throw new Error("Unexpected query");
    },
  };
  registerSavedLibraryRoutes(app, {
    pool,
    requireAuth: (_req, _res, next) => next(),
  });
  try {
    const response = await request(app).get("/api/entries/curated-matches");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.matches.map((match) => match.key).sort(), [
      "tanach:1",
      "tefillot:1",
    ]);
    assert.equal(
      response.body.matches.find((match) => match.sourceType === "tefillot")
        .tefillotContext.unitId,
      4,
    );
    assert.deepEqual(response.body.counts, { matches: 2, entries: 1 });
    const focused = await request(app)
      .get("/api/entries/curated-matches")
      .query({ focus: "tefillot:1", limit: 1 });
    assert.equal(focused.body.matches[0].key, "tefillot:1");
  } finally {
    if (previous === undefined) delete process.env.TEFILLOT_ENABLED;
    else process.env.TEFILLOT_ENABLED = previous;
  }
});

test("tab counts remain accurate when relationship listing fails and distinguish unavailable from empty", async () => {
  const app = express();
  let failMatches = false;
  let failEntries = false;
  const pool = {
    async query(sql) {
      if (sql.includes("COUNT(*)::int AS count FROM saved_entries")) {
        if (failEntries) throw new Error("entries unavailable");
        return { rows: [{ count: 7 }] };
      }
      if (sql.includes("COUNT(*)::int AS count FROM curated_matches")) {
        if (failMatches) throw new Error("matches unavailable");
        return { rows: [{ count: 3 }] };
      }
      if (sql.includes("AS ready")) return { rows: [{ ready: false }] };
      throw new Error("Relationship serialization failed");
    },
  };
  registerSavedLibraryRoutes(app, {
    pool,
    requireAuth: (req, res, next) =>
      req.headers.authorization === "test-session"
        ? next()
        : res.status(401).json({ error: "unauthorized" }),
  });
  assert.equal((await request(app).get("/api/entries/counts")).status, 401);
  const get = (path) =>
    request(app).get(path).set("authorization", "test-session");
  const previousError = console.error;
  console.error = () => {};
  try {
    assert.equal((await get("/api/entries/curated-matches")).status, 500);
    const counts = await get("/api/entries/counts");
    assert.equal(counts.status, 200);
    assert.deepEqual(counts.body, {
      counts: { entries: 7, matches: 3 },
      countErrors: {},
    });
    failMatches = true;
    const partial = await get("/api/entries/counts");
    assert.equal(partial.status, 200);
    assert.deepEqual(partial.body, {
      counts: { entries: 7, matches: null },
      countErrors: { matches: "saved_matches_count_failed" },
    });
    failEntries = true;
    const unavailable = await get("/api/entries/counts");
    assert.equal(unavailable.status, 503);
    assert.deepEqual(unavailable.body.counts, { entries: null, matches: null });
  } finally {
    console.error = previousError;
  }
});
