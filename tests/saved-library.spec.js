import { test, expect } from "@playwright/test";
import { computeAll } from "../src/composables/useGematria.js";
import { createTanachCursor } from "../src/composables/useTanachCursor.js";

test.use({ serviceWorkers: "block" });
const password = process.env.E2E_APP_PASSWORD || "tanach-browser-test-password";

async function signIn(page) {
  await page.goto("/");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "שמורים", exact: true }),
  ).toBeVisible();
}
async function library(page) {
  await page.getByRole("button", { name: "שמורים", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "הספרייה השמורה", exact: true }),
  ).toBeVisible();
}
async function filters(page) {
  await page.getByRole("button", { name: "סינון", exact: true }).click();
  return page.getByRole("dialog", { name: "סינון הספרייה" });
}
async function saveRange(
  page,
  { book = "Genesis", chapter = 1, verse = 1, start = 0, end = 27 } = {},
) {
  const response = await page.request.get(
    `/api/tanach/verse?book=${book}&chapter=${chapter}&verse=${verse}`,
  );
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const text = data.verse.display_text;
  const cursor = createTanachCursor(text);
  const rangeEnd = end === "full" ? cursor.count - 1 : end;
  const originalText = cursor.range(start, rangeEnd).text;
  const value = computeAll(originalText).fullGematria;
  const payload = {
    parentOriginalText: String(value),
    matches: [
      {
        originalText,
        tanachContext: { bookSlug: book, chapter, verse, start, end: rangeEnd },
        reasonCode: "full_gematria",
      },
    ],
  };
  const saved = await page.request.post("/api/entries/curated-matches", {
    data: payload,
  });
  expect(saved.ok()).toBe(true);
  return { ...(await saved.json()), value, originalText, payload };
}

test("real word, phrase and full pasuk persist, search globally, open exact sources and remove only one relationship", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const saves = [];
  try {
    saves.push(await saveRange(page, { end: 5 }));
    saves.push(await saveRange(page, { end: 8 }));
    saves.push(
      await saveRange(page, {
        book: "Numbers",
        chapter: 7,
        verse: 89,
        end: "full",
      }),
    );
    const duplicate = await page.request.post("/api/entries/curated-matches", {
      data: saves[0].payload,
    });
    expect((await duplicate.json()).matches[0].id).toBe(saves[0].matches[0].id);
    await library(page);
    await expect(
      page.getByRole("tab", { name: /התאמות שמורות/ }),
    ).toHaveAttribute("aria-selected", "true");
    const rows = page.locator(".match-row");
    await expect(rows).toHaveCount(3);
    await expect(page.locator(".entry-detail")).toHaveCount(0);
    await expect(rows.locator("button")).toHaveCount(3);
    await expect(
      rows.locator(".tanach-reference, .reason-badge, .entry-footer, time"),
    ).toHaveCount(0);
    for (const saved of saves) {
      const row = page.locator(
        `[data-match-key="tanach:${saved.matches[0].id}"]`,
      );
      await expect(row.locator(".gematria-number")).toHaveText(
        String(saved.value),
      );
      await expect(row.locator(".original-expression")).toHaveText(
        String(saved.value),
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const longRow = page.locator(
      `[data-match-key="tanach:${saves[2].matches[0].id}"]`,
    );
    const wordRow = page.locator(
      `[data-match-key="tanach:${saves[0].matches[0].id}"]`,
    );
    expect((await longRow.boundingBox()).height).toBeGreaterThan(
      (await wordRow.boundingBox()).height,
    );
    await page.screenshot({
      path: `artifacts/saved-library-${testInfo.project.name}.png`,
      fullPage: true,
    });
    const search = page.getByRole("searchbox", { name: "חיפוש בספרייה" });
    await search.fill(String(saves[0].value));
    await expect(rows).toHaveCount(1);
    await search.fill("בראשית ברא");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".gematria-number")).toHaveText(
      String(saves[1].value),
    );
    await page.getByRole("button", { name: "נקה חיפוש" }).click();
    await expect(rows).toHaveCount(3);
    const filter = await filters(page);
    await filter
      .getByRole("combobox", { name: "מקור ההתאמה" })
      .selectOption("tefillot");
    await expect(
      page.getByText("לא נמצאו תוצאות", { exact: true }),
    ).toBeVisible();
    await filter
      .getByRole("combobox", { name: "מקור ההתאמה" })
      .selectOption("tanach");
    await expect(rows).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "סינון", exact: true }),
    ).toBeFocused();
    await page.reload();
    await library(page);
    await expect(rows).toHaveCount(3);
    const trigger = longRow.getByRole("button", { name: /פעולות עבור/ });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "למקור", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "פירוט מילים", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", {
      name: "פירוט מילים",
      exact: true,
    });
    await expect(detail).toBeVisible();
    await expect(detail.locator(".detail-word-block").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    const menu = page.getByRole("menu", { name: "פעולות בשמורים" });
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      page.viewportSize().width,
    );
    await page.screenshot({
      path: `artifacts/saved-library-menu-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("heading", { name: "הספרייה השמורה" }).click();
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await page.getByRole("menuitem", { name: "למקור", exact: true }).click();
    await expect(page.locator(".tanach-page")).toBeVisible();
    await expect(page.locator(".verse-toolbar h2")).toHaveText("במדבר ז:פט");
    await library(page);
    await wordRow.getByRole("button", { name: /פעולות עבור/ }).click();
    await page
      .getByRole("menuitem", { name: "הסר משמורים", exact: true })
      .click();
    const deletion = page.getByRole("dialog", {
      name: "להסיר את ההתאמה?",
      exact: true,
    });
    await expect(deletion.getByRole("button", { name: "ביטול" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(wordRow).toBeVisible();
    await wordRow.getByRole("button", { name: /פעולות עבור/ }).click();
    await page
      .getByRole("menuitem", { name: "הסר משמורים", exact: true })
      .click();
    await deletion
      .getByRole("button", { name: "הסר משמורים", exact: true })
      .click();
    await expect(rows).toHaveCount(2);
    const parent = await page.request.get(
      `/api/entries?parentOriginalText=${saves[0].value}`,
    );
    expect(
      (await parent.json()).entries.some(
        (entry) => entry.id === saves[0].parentId,
      ),
    ).toBe(true);
  } finally {
    for (const id of new Set(
      saves.filter((save) => save.parentCreated).map((save) => save.parentId),
    ))
      await page.request.delete(`/api/entries/${id}`);
  }
});

test("independent entries keep calculation, copy, sorting, grouping and confirmed deletion in secondary controls", async ({
  page,
}) => {
  await signIn(page);
  const ids = [];
  try {
    for (const originalText of [
      "בדיקת ספרייה אב",
      "בדיקת ספרייה ג",
      "בדיקת ספרייה ד",
    ]) {
      const response = await page.request.post("/api/entries", {
        data: { originalText },
      });
      expect(response.ok()).toBe(true);
      ids.push((await response.json()).id);
    }
    await library(page);
    await page.getByRole("tab", { name: /ערכים שמורים/ }).click();
    await page
      .getByRole("searchbox", { name: "חיפוש בספרייה" })
      .fill("בדיקת ספרייה");
    const rows = page.locator(".entry-card");
    await expect(rows).toHaveCount(3);
    const filter = await filters(page);
    await filter
      .getByRole("combobox", { name: "מיון הספרייה" })
      .selectOption("gematria");
    await filter
      .getByRole("combobox", { name: "תצוגת הספרייה" })
      .selectOption("grid");
    await filter.getByRole("checkbox", { name: "קבץ לפי גימטריה" }).check();
    await expect(page.locator(".group-header")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await rows.first().getByRole("button").click();
    await page
      .getByRole("menuitem", { name: "פירוט מילים", exact: true })
      .click();
    const detail = page.getByRole("dialog", {
      name: "פירוט מילים",
      exact: true,
    });
    await expect(detail.locator(".detail-row--milui")).toBeVisible();
    await expect(detail.locator(".detail-word-block").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      window.__copied = "";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__copied = text;
          },
        },
      });
    });
    await rows.first().getByRole("button").click();
    await page.getByRole("menuitem", { name: "העתק", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__copied))
      .toContain("בדיקת ספרייה");
    await rows.first().getByRole("button").click();
    await page
      .getByRole("menuitem", { name: "הסר משמורים", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "להסיר את הערך מהשמורים?", exact: true })
      .getByRole("button", { name: "הסר משמורים", exact: true })
      .click();
    await expect(rows).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    for (const id of ids) await page.request.delete(`/api/entries/${id}`);
  }
});

test("library error retry, empty guidance and keyboard tabs are clear", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/entries/curated-matches?**", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await library(page);
  await expect(page.getByRole("alert")).toContainText(
    "לא ניתן לטעון את הספרייה",
  );
  await page.unroute("**/api/entries/curated-matches?**");
  await page.getByRole("button", { name: "נסה שוב", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "חיפוש בספרייה" })
    .fill("ביטוי שאינו קיים בספרייה לעולם");
  await expect(
    page.getByText("לא נמצאו תוצאות", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "נקה חיפוש וסינון" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.getByRole("tab", { name: /התאמות שמורות/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: /ערכים שמורים/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /ערכים שמורים/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: /התאמות שמורות/ })).toBeFocused();
});

test("later relationship pages and normalized search are served by persisted query, not a parent page", async ({
  page,
}) => {
  await signIn(page);
  const requests = [];
  await page.route("**/api/entries/curated-matches?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 40);
    const all = Array.from({ length: 85 }, (_, i) => ({
      key: `tanach:${9000 + i}`,
      id: 9000 + i,
      sourceType: "tanach",
      parentId: i + 1,
      parentOriginalText: "אהבה",
      originalText: "אֶחָד",
      gematriaValue: 13,
      reasonCodes: ["full_gematria"],
      tanachContext: {
        bookSlug: "Genesis",
        chapter: 1,
        verse: 5,
        start: 43,
        end: 45,
      },
    }));
    const filtered = url.searchParams.has("search") ? all.slice(-1) : all;
    await route.fulfill({
      json: {
        matches: filtered.slice(offset, offset + limit),
        total: filtered.length,
        counts: { matches: 85, entries: 85 },
        pagination: {
          nextOffset: offset + limit,
          hasMore: offset + limit < filtered.length,
        },
      },
    });
  });
  await library(page);
  await expect(page.locator(".match-row")).toHaveCount(40);
  await page.getByRole("button", { name: /הצג עוד/ }).click();
  await expect(page.locator(".match-row")).toHaveCount(80);
  await page.getByRole("button", { name: /הצג עוד/ }).click();
  await expect(page.locator(".match-row")).toHaveCount(85);
  await page.getByRole("searchbox").fill("אחד");
  await expect(page.locator(".match-row")).toHaveCount(1);
  expect(requests.at(-1).searchParams.get("search")).toBe("אחד");
  expect(requests.at(-1).searchParams.get("offset")).toBe("0");
});

test("review captures use real Hebrew relationships and a full pointed pasuk", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const created = new Set();
  try {
    for (const fixture of [
      { parent: "אהבה", word: "אחד", book: "Genesis", chapter: 1, verse: 5 },
      { parent: "חיים", word: "חכם", book: "Proverbs", chapter: 10, verse: 1 },
      { parent: "מלך", word: "מים", book: "Genesis", chapter: 1, verse: 6 },
    ]) {
      const verseResponse = await page.request.get(
        `/api/tanach/verse?book=${fixture.book}&chapter=${fixture.chapter}&verse=${fixture.verse}`,
      );
      const text = (await verseResponse.json()).verse.display_text;
      const cursor = createTanachCursor(text);
      const words = computeAll(text).words;
      const index = words.findIndex((word) => word.word === fixture.word);
      expect(index).toBeGreaterThanOrEqual(0);
      const start = words
        .slice(0, index)
        .reduce((count, word) => count + word.word.length, 0);
      const end = start + fixture.word.length - 1;
      const response = await page.request.post("/api/entries/curated-matches", {
        data: {
          parentOriginalText: fixture.parent,
          matches: [
            {
              originalText: cursor.range(start, end).text,
              reasonCode: "full_gematria",
              tanachContext: {
                bookSlug: fixture.book,
                chapter: fixture.chapter,
                verse: fixture.verse,
                start,
                end,
              },
            },
          ],
        },
      });
      expect(response.ok()).toBe(true);
      const data = await response.json();
      if (data.parentCreated) created.add(data.parentId);
    }
    const full = await saveRange(page, {
      book: "Deuteronomy",
      chapter: 6,
      verse: 5,
      end: "full",
    });
    if (full.parentCreated) created.add(full.parentId);
    await library(page);
    await expect(page.locator(".match-row")).toHaveCount(4);
    await expect(page.locator(".gematria-number")).toHaveText([
      String(full.value),
      "90",
      "68",
      "13",
    ]);
    await page.screenshot({
      path: `artifacts/saved-library-${testInfo.project.name}.png`,
      fullPage: true,
    });
    const fullRow = page.locator(
      `[data-match-key="tanach:${full.matches[0].id}"]`,
    );
    await fullRow.getByRole("button", { name: /פעולות עבור/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.screenshot({
      path: `artifacts/saved-library-menu-${testInfo.project.name}.png`,
      fullPage: true,
    });
    if (testInfo.project.name === "desktop-chromium") {
      await page.keyboard.press("Escape");
      for (const width of [768, 1440, 1920, 2560]) {
        await page.setViewportSize({
          width,
          height: width <= 768 ? 1024 : 1080,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const libraryBounds = await page.locator(".library-page").boundingBox();
        if (width >= 1920) {
          expect(libraryBounds.width).toBeGreaterThanOrEqual(1450);
          expect(libraryBounds.width).toBeLessThanOrEqual(1600);
        }
        const searchBounds = await page.locator(".search-bar").boundingBox();
        const filterBounds = await page.locator(".filter-button").boundingBox();
        expect(
          Math.abs(searchBounds.height - filterBounds.height),
        ).toBeLessThanOrEqual(1);
        expect(searchBounds.width).toBeGreaterThan(libraryBounds.width * 0.6);
        await page.screenshot({
          path: `artifacts/saved-library-${width}.png`,
          fullPage: true,
        });
        if (width === 768)
          await page.screenshot({
            path: "artifacts/saved-library-tablet.png",
            fullPage: true,
          });
        await fullRow.getByRole("button", { name: /פעולות עבור/ }).click();
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        const menuBounds = await menu.boundingBox();
        expect(menuBounds.x).toBeGreaterThanOrEqual(0);
        expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
      }
    }
  } finally {
    for (const id of created) await page.request.delete(`/api/entries/${id}`);
  }
});
