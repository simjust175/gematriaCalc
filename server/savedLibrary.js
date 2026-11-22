import { computeAll, normalize } from "../src/composables/useGematria.js";
import { isTefillotAvailable } from "./tefillot.js";
import { TANACH_PARSHIOT, getParshahForReference } from './tanachParshiot.js';
import { getCurrentWeeklyParshah } from './tanachWeeklyParsha.js';
import {
  serializeTefillotContext,
  tefillotSaveSchemaReady,
  TEFILLOT_DISPLAY_METADATA_SELECT,
} from "./tefillotSaveContext.js";

const MATCH_TYPES = new Set([
  "full_gematria",
  "initials_text",
  "initials_gematria",
  "finals_text",
  "finals_gematria",
  "saved_word",
  "milui_gematria",
]);
const SORTS = new Set(["recent", "oldest", "gematria", "alphabetical"]);
const PARSHA_IDS = new Set(TANACH_PARSHIOT.map(portion => portion.id));
const PARSHA_ORDER = new Map(TANACH_PARSHIOT.map(portion => [portion.id, portion.canonicalOrder]));

export function parseSavedMatchQuery(query) {
  const source = query.source || "";
  const matchType = query.matchType || "";
  const sort = query.sort || "recent";
  const parshaId = query.parsha_id || '';
  const currentParshah = query.parsha === 'current';
  const parshaScope = query.parsha_scope === 'torah';
  const limit = query.limit == null ? 40 : Number(query.limit);
  const offset = query.offset == null ? 0 : Number(query.offset);
  if (
    typeof source !== "string" ||
    !["", "all", "tanach", "tefillot"].includes(source)
  ) {
    return { error: "invalid_source" };
  }
  if (
    typeof matchType !== "string" ||
    (matchType && !MATCH_TYPES.has(matchType))
  ) {
    return { error: "invalid_match_type" };
  }
  if (!SORTS.has(sort)) return { error: "invalid_sort" };
  if (typeof parshaId !== 'string' || (parshaId && !PARSHA_IDS.has(parshaId))) {
    return { error: 'invalid_parsha_filter' };
  }
  if ((query.parsha != null && !currentParshah)
      || (query.parsha_scope != null && !parshaScope)
      || (currentParshah && parshaId)) return { error: 'invalid_parsha_filter' };
  if (
    [query.limit, query.offset].some(
      (value) => value != null && !["string", "number"].includes(typeof value),
    )
  )
    return { error: "invalid_pagination" };
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    return { error: "invalid_pagination" };
  if (query.search != null && typeof query.search !== "string")
    return { error: "invalid_search" };
  if (
    query.focus != null &&
    (typeof query.focus !== "string" ||
      !/^(tanach|tefillot):[1-9]\d*$/.test(query.focus))
  )
    return { error: "invalid_focus" };
  return {
    source,
    matchType,
    sort,
    parshaId,
    parshaScope,
    currentParshah,
    limit,
    offset,
    search: (query.search || "").trim(),
    focus: query.focus || "",
  };
}

// Saved reason codes explain the relationship, but older records may have been
// saved under another search mode. Only display a common number when the actual
// persisted expressions agree under that reason; never manufacture a value.
export function savedRelationshipValue(parent, matched, reasons) {
  if (!parent || !matched) return null;
  if (
    reasons.includes("full_gematria") &&
    parent.fullGematria === matched.fullGematria
  ) {
    return matched.fullGematria;
  }
  for (const [reason, field] of [
    ["initials_text", "initialsGematria"],
    ["initials_gematria", "initialsGematria"],
    ["finals_text", "finalsGematria"],
    ["finals_gematria", "finalsGematria"],
  ]) {
    if (reasons.includes(reason) && parent.fullGematria === matched[field])
      return matched[field];
  }
  if (
    reasons.includes("saved_word") &&
    matched.words.some((word) => word.gematria === parent.fullGematria)
  ) {
    return parent.fullGematria;
  }
  return null;
}

function serializeRelationship(row, calculate) {
  const sourceType = row.source_type;
  const calculation = calculate(row.original_text);
  const parentCalculation = calculate(row.parent_original_text);
  const reasonCodes = Array.isArray(row.reason_codes) ? row.reason_codes : [];
  const portion = sourceType === 'tanach' ? getParshahForReference({
    bookSlug: row.tanach_book_slug, chapter: row.tanach_chapter, verse: row.tanach_verse,
  }) : null;
  return {
    key: `${sourceType}:${row.id}`,
    id: Number(row.id),
    sourceType,
    parentId: Number(row.parent_id),
    parentOriginalText: row.parent_original_text,
    parentGematria:
      parentCalculation?.fullGematria ?? Number(row.parent_gematria),
    originalText: row.original_text,
    fullGematria: calculation?.fullGematria ?? null,
    gematriaValue: savedRelationshipValue(
      parentCalculation,
      calculation,
      reasonCodes,
    ),
    reasonCodes,
    parshaId: portion?.id || null,
    parshaName: portion?.nameHe || null,
    createdAt: row.created_at,
    calculation,
    tanachContext:
      sourceType === "tanach"
        ? {
            bookSlug: row.tanach_book_slug,
            bookLabel: row.tanach_book_label,
            chapter: row.tanach_chapter,
            verse: row.tanach_verse,
            start: row.tanach_start,
            end: row.tanach_end,
          }
        : null,
    tefillotContext:
      sourceType === "tefillot" ? serializeTefillotContext(row) : null,
  };
}

export function paginateSavedRelationships(rows, parsed, entryCount, {
  exportAll = false, weeklyParshah = getCurrentWeeklyParshah(),
} = {}) {
  // A parent commonly owns many matches. Compute each distinct expression once
  // per request while retaining the engine's exact pointed-word breakdown.
  const calculations = new Map();
  const calculate = (text) => {
    if (!calculations.has(text)) calculations.set(text, computeAll(text));
    return calculations.get(text);
  };
  const all = rows.map((row) => serializeRelationship(row, calculate));
  const numericSearch = computeAll(parsed.search);
  const normalizedSearch = normalize(parsed.search);
  let matches = all.filter((match) => {
    if (parsed.parshaId && match.parshaId !== parsed.parshaId) return false;
    if (parsed.parshaScope && !match.parshaId) return false;
    if (parsed.currentParshah && !weeklyParshah?.ids.includes(match.parshaId)) return false;
    if (
      parsed.source &&
      parsed.source !== "all" &&
      match.sourceType !== parsed.source
    )
      return false;
    if (parsed.matchType && !match.reasonCodes.includes(parsed.matchType))
      return false;
    if (!parsed.search) return true;
    if (numericSearch?.inputMode === "numeric") {
      return [
        match.parentGematria,
        match.fullGematria,
        match.gematriaValue,
        match.calculation?.initialsGematria,
        match.calculation?.finalsGematria,
      ].includes(numericSearch.fullGematria);
    }
    return [match.parentOriginalText, match.originalText].some(
      (text) =>
        text
          .toLocaleLowerCase("he")
          .includes(parsed.search.toLocaleLowerCase("he")) ||
        (normalizedSearch && normalize(text).includes(normalizedSearch)),
    );
  });
  matches.sort((a, b) => {
    if (parsed.parshaId || parsed.parshaScope || parsed.currentParshah) {
      const left = a.tanachContext, right = b.tanachContext;
      return PARSHA_ORDER.get(a.parshaId) - PARSHA_ORDER.get(b.parshaId)
        || left.chapter - right.chapter || left.verse - right.verse
        || left.start - right.start || left.end - right.end
        || a.parentId - b.parentId || a.id - b.id;
    }
    const recent =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      b.id - a.id ||
      a.sourceType.localeCompare(b.sourceType);
    if (parsed.sort === "oldest") return -recent;
    if (parsed.sort === "gematria")
      return (
        (a.gematriaValue ?? a.fullGematria ?? 0) -
          (b.gematriaValue ?? b.fullGematria ?? 0) || recent
      );
    if (parsed.sort === "alphabetical")
      return (
        a.parentOriginalText.localeCompare(b.parentOriginalText, "he") || recent
      );
    return recent;
  });
  const focusedIndex = parsed.focus
    ? matches.findIndex((match) => match.key === parsed.focus)
    : -1;
  const offset =
    exportAll ? 0 : focusedIndex >= 0
      ? Math.floor(focusedIndex / parsed.limit) * parsed.limit
      : parsed.offset;
  const page = exportAll ? matches : matches.slice(offset, offset + parsed.limit);
  return {
    matches: page,
    total: matches.length,
    counts: { matches: all.length, entries: entryCount },
    weeklyParshah,
    focusedKey: focusedIndex >= 0 ? parsed.focus : null,
    pagination: {
      offset,
      pageCount: page.length,
      nextOffset: offset + page.length,
      hasMore: offset + page.length < matches.length,
    },
  };
}

// Both screen pagination and PDF export read the same persisted relationships.
// Optional prayer metadata retains the legacy-schema compatibility projection.
export async function readSavedRelationships(db, parsed, options) {
  const [tanach, prayerSchemaReady, entries] = await Promise.all([
    db.query(`
      SELECT cm.*, 'tanach' AS source_type, se.original_text AS parent_original_text,
        se.full_gematria AS parent_gematria,
        COALESCE(NULLIF(cm.tanach_book_label, ''), b.hebrew_name, cm.tanach_book_slug) AS tanach_book_label
      FROM curated_matches cm JOIN saved_entries se ON se.id = cm.parent_id
      LEFT JOIN tanach_books b ON b.slug = cm.tanach_book_slug`),
    tefillotSaveSchemaReady(db),
    db.query("SELECT COUNT(*)::int AS count FROM saved_entries"),
  ]);
  let rows = tanach.rows;
  if (prayerSchemaReady && (await isTefillotAvailable(db))) {
    const prayer = await db.query(`
      SELECT cm.*, 'tefillot' AS source_type, se.original_text AS parent_original_text,
        se.full_gematria AS parent_gematria,
        u.occasion_slug, u.occasion_label, u.service_slug, u.service_label,
        u.section_key, u.section_label, ${TEFILLOT_DISPLAY_METADATA_SELECT}
      FROM curated_tefillot_matches cm JOIN saved_entries se ON se.id = cm.parent_id
      JOIN tefillot_units u ON u.id = cm.tefillot_unit_id
      JOIN tefillot_sources s ON s.id = u.source_id`);
    rows = rows.concat(prayer.rows);
  }
  return paginateSavedRelationships(rows, parsed, entries.rows[0].count, options);
}

async function countSavedMatches(db) {
  const tanach = await db.query(`
    SELECT COUNT(*)::int AS count FROM curated_matches cm
    JOIN saved_entries se ON se.id = cm.parent_id`);
  let count = tanach.rows[0].count;
  if ((await tefillotSaveSchemaReady(db)) && (await isTefillotAvailable(db))) {
    const prayers = await db.query(`
      SELECT COUNT(*)::int AS count FROM curated_tefillot_matches cm
      JOIN saved_entries se ON se.id = cm.parent_id`);
    count += prayers.rows[0].count;
  }
  return count;
}

export async function readSavedLibraryCounts(db) {
  // Counts do not depend on serializing a relationship or its optional source
  // metadata. Isolate the tabs so a failed matches query cannot erase a known
  // entries count. Unknown is explicit; it must never be presented as zero.
  const results = await Promise.allSettled([
    db.query("SELECT COUNT(*)::int AS count FROM saved_entries"),
    countSavedMatches(db),
  ]);
  const counts = { entries: null, matches: null };
  const countErrors = {};
  for (const [index, tab] of ["entries", "matches"].entries()) {
    const result = results[index];
    if (result.status === "fulfilled") {
      counts[tab] =
        tab === "entries" ? result.value.rows[0].count : result.value;
    } else {
      countErrors[tab] =
        tab === "entries"
          ? "saved_entries_count_failed"
          : "saved_matches_count_failed";
      console.error(`/api/entries/counts ${tab} error:`, result.reason.message);
    }
  }
  return { counts, countErrors };
}

export function registerSavedLibraryRoutes(app, { pool, requireAuth }) {
  app.get("/api/entries/counts", requireAuth, async (_req, res) => {
    const result = await readSavedLibraryCounts(pool);
    const unavailable =
      result.counts.entries === null && result.counts.matches === null;
    res.status(unavailable ? 503 : 200).json(result);
  });

  app.get("/api/entries/curated-matches", requireAuth, async (req, res) => {
    const parsed = parseSavedMatchQuery(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
      res.json(await readSavedRelationships(pool, parsed));
    } catch (error) {
      console.error("/api/entries/curated-matches GET error:", error.message);
      res.status(500).json({ error: "saved_matches_load_failed" });
    }
  });
}
