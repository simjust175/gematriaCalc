import { test, expect } from "@playwright/test";

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
async function openLibrary(page) {
  await page.getByRole("button", { name: "שמורים", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "הספרייה השמורה", exact: true }),
  ).toBeVisible();
}
function badge(page, tab) {
  return page
    .getByRole("tab", {
      name: tab === "matches" ? /התאמות שמורות/ : /ערכים שמורים/,
    })
    .locator(".tab-count");
}
async function createEntry(page, testInfo) {
  const originalText =
    testInfo.project.name === "mobile-chromium"
      ? "בדיקת מונה שמורים נייד"
      : "בדיקת מונה שמורים שולחן";
  const response = await page.request.post("/api/entries", {
    data: { originalText },
  });
  expect([200, 409]).toContain(response.status());
  const { id } = await response.json();
  const entries = await page.request.get("/api/entries?limit=1");
  expect(entries.ok()).toBe(true);
  return {
    id,
    created: response.status() === 200,
    total: (await entries.json()).total,
  };
}

test("existing entry count remains accurate when the saved-match listing fails", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const entry = await createEntry(page, testInfo);
  try {
    await page.route("**/api/entries/curated-matches?**", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "saved_matches_unavailable" },
      }),
    );
    await openLibrary(page);
    await expect(page.locator('[data-state="server-error"]')).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      "לא ניתן לטעון את הספרייה",
    );
    await expect(badge(page, "entries")).toHaveText(
      entry.total.toLocaleString("he-IL"),
    );
    await expect(page.locator(".empty-state")).toHaveCount(0);
    await page.getByRole("tab", { name: /ערכים שמורים/ }).click();
    await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toBeVisible();
    await expect(badge(page, "entries")).toHaveText(
      entry.total.toLocaleString("he-IL"),
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    if (entry.created)
      expect((await page.request.delete(`/api/entries/${entry.id}`)).ok()).toBe(
        true,
      );
  }
});

test("unavailable counts remain unknown and successful entry loading supplies its real count", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const entry = await createEntry(page, testInfo);
  try {
    await page.route("**/api/entries/counts", (route) =>
      route.fulfill({
        status: 503,
        json: {
          counts: { matches: null, entries: null },
          countErrors: {
            matches: "saved_matches_count_failed",
            entries: "saved_entries_count_failed",
          },
        },
      }),
    );
    await page.route("**/api/entries/curated-matches?**", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "saved_matches_unavailable" },
      }),
    );
    await openLibrary(page);
    await expect(badge(page, "matches")).toHaveText("—");
    await expect(badge(page, "entries")).toHaveText("—");
    await page.getByRole("tab", { name: /ערכים שמורים/ }).click();
    await expect(page.locator(`[data-entry-id="${entry.id}"]`)).toBeVisible();
    await expect(badge(page, "entries")).toHaveText(
      entry.total.toLocaleString("he-IL"),
    );
    await expect(badge(page, "matches")).toHaveText("—");
  } finally {
    if (entry.created)
      expect((await page.request.delete(`/api/entries/${entry.id}`)).ok()).toBe(
        true,
      );
  }
});

test("authentication failure is explicit and never presented as an empty library", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/entries/curated-matches?**", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthorized" } }),
  );
  await page.route("**/api/entries/counts", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthorized" } }),
  );
  await openLibrary(page);
  await expect(
    page.locator('[data-state="authentication-error"]'),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("נדרשת כניסה מחדש");
  await expect(
    page.getByRole("button", { name: "כניסה מחדש", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".empty-state")).toHaveCount(0);
  await expect(badge(page, "entries")).toHaveText("—");
});

test("missing library endpoint returning HTML shows version recovery rather than an empty library", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/entries/curated-matches?**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<!doctype html><html><body><pre>Cannot GET /api/entries/curated-matches</pre></body></html>",
    }),
  );
  await openLibrary(page);
  await expect(page.locator('[data-state="server-error"]')).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "גרסת הספרייה אינה זמינה כרגע",
  );
  await expect(
    page.getByRole("button", { name: "רענן את היישום", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".empty-state")).toHaveCount(0);
  await expect(page.getByRole("alert")).not.toContainText("Cannot GET");
});

test("loading counters become genuine zero counts only after successful empty responses", async ({
  page,
}) => {
  await signIn(page);
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/entries/counts", async (route) => {
    await ready;
    await route.fulfill({ json: { counts: { matches: 0, entries: 0 } } });
  });
  await page.route("**/api/entries/curated-matches?**", async (route) => {
    await ready;
    await route.fulfill({
      json: {
        matches: [],
        total: 0,
        counts: { matches: 0, entries: 0 },
        pagination: { offset: 0, nextOffset: 0, hasMore: false },
      },
    });
  });
  try {
    await openLibrary(page);
    await expect(page.locator('[data-state="loading"]')).toBeVisible();
    await expect(badge(page, "matches")).toHaveText("…");
    await expect(badge(page, "entries")).toHaveText("…");
    release();
    await expect(page.locator('[data-state="empty"]')).toBeVisible();
    await expect(page.locator(".empty-state")).toContainText(
      "ההתאמות שלך יופיעו כאן",
    );
    await expect(badge(page, "matches")).toHaveText("0");
    await expect(badge(page, "entries")).toHaveText("0");
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
  }
});
