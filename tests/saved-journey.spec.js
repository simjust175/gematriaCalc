import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function discover(page, input, source = "tanach") {
  await page.goto("/");
  await page
    .locator('input[type="password"]')
    .fill(process.env.E2E_APP_PASSWORD || "tanach-browser-test-password");
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await page.locator(".heb-input").fill(input);
  await page
    .locator(".source-selector")
    .getByRole("button", {
      name: source === "tefillot" ? "תפילות" : "תנ״ך",
      exact: true,
    })
    .click();
  const card = page.locator(".match-card:not(.skeleton-card)").first();
  await expect(card).toBeVisible();
  return card;
}

for (const [source, input] of [
  ["tanach", "דם"],
  ["tanach", "44"],
  ["tefillot", "דם"],
]) {
  test(`${source} ${input}: confirmed save opens the exact relationship and survives refresh`, async ({
    page,
  }) => {
    test.skip(
      source === "tefillot" && process.env.E2E_TEFILLOT_SAVES !== "true",
      "Requires the disposable Tefillot save schema",
    );
    const card = await discover(page, input, source);
    let saved;
    try {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/entries/curated-matches",
      );
      await card
        .getByRole("button", { name: "שמור התאמה", exact: true })
        .click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      saved = await response.json();
      expect(saved.success).toBe(true);
      expect(saved.matches).toHaveLength(1);
      await expect(
        card.getByRole("button", { name: "נשמרה", exact: true }),
      ).toBeDisabled();
      await expect(page.locator(".curated-message")).toContainText(
        "ההתאמה נשמרה",
      );
      await page
        .getByRole("button", { name: "הצג בשמורים", exact: true })
        .click();
      const row = page.locator(
        `[data-match-key="${source}:${saved.matches[0].id}"]`,
      );
      await expect(row).toBeVisible();
      await expect(row).toBeInViewport();
      await expect(row).toBeFocused();
      await expect(row).toHaveAttribute(
        "data-parent-entry-id",
        String(saved.parentId),
      );

      await page
        .locator(".app-header")
        .getByRole("button", { name: "מחשבון", exact: true })
        .click();
      await expect(page.locator(".heb-input")).toHaveValue(input);
      await expect(
        card.getByRole("button", { name: "נשמרה", exact: true }),
      ).toBeDisabled();

      // A repeated request must return the same parent and relationship.
      const duplicate = await page.request.post(
        "/api/entries/curated-matches",
        { data: response.request().postDataJSON() },
      );
      expect(duplicate.ok()).toBe(true);
      const duplicatePayload = await duplicate.json();
      expect(duplicatePayload.parentId).toBe(saved.parentId);
      expect(duplicatePayload.matches.map((match) => match.id)).toEqual(
        saved.matches.map((match) => match.id),
      );

      await page.reload();
      await expect(page.locator(".heb-input")).toHaveValue(input);
      await page
        .locator(".source-selector")
        .getByRole("button", {
          name: source === "tefillot" ? "תפילות" : "תנ״ך",
          exact: true,
        })
        .click();
      await expect(
        card.getByRole("button", { name: "נשמרה", exact: true }),
      ).toBeDisabled();
      const parentResponse = await page.request.get(
        `/api/entries?parentOriginalText=${encodeURIComponent(input)}`,
      );
      expect(parentResponse.ok()).toBe(true);
      const parent = (await parentResponse.json()).entries.find(
        (entry) => entry.id === saved.parentId,
      );
      expect(
        parent.curated_matches.filter(
          (match) =>
            match.id === saved.matches[0].id &&
            (match.sourceType || match.source_type || "tanach") === source,
        ),
      ).toHaveLength(1);
    } finally {
      if (saved?.parentCreated)
        expect(
          (await page.request.delete(`/api/entries/${saved.parentId}`)).ok(),
        ).toBe(true);
    }
  });
}

for (const [description, status, json] of [
  ["failed request", 503, { error: "temporarily_unavailable" }],
  [
    "incomplete success response",
    200,
    { success: true, parentId: 999, matches: [] },
  ],
]) {
  test(`${description} never claims a match was saved and allows retry`, async ({
    page,
  }) => {
    const card = await discover(page, "דם");
    await page.route("**/api/entries/curated-matches", (route) =>
      route.fulfill({ status, json }),
    );
    await card.getByRole("button", { name: "שמור התאמה", exact: true }).click();
    await expect(page.locator('.curated-message[role="alert"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: "הצג בשמורים", exact: true }),
    ).toHaveCount(0);
    await expect(
      card.getByRole("button", { name: "שמור התאמה", exact: true }),
    ).toBeEnabled();
    await expect(card).not.toHaveClass(
      /curated-saved-card|curated-selected-card/,
    );
    const parentResponse = await page.request.get(
      `/api/entries?parentOriginalText=${encodeURIComponent("דם")}`,
    );
    expect((await parentResponse.json()).entries).toHaveLength(0);
  });
}

test("independent saving is secondary and its menu supports keyboard and outside dismissal", async ({
  page,
}) => {
  const card = await discover(page, "דם");
  await expect(
    card.getByRole("button", { name: "שמור התאמה", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "שמור כערך עצמאי", exact: true }),
  ).toHaveCount(0);
  const trigger = card.getByRole("button", {
    name: "פעולות נוספות להתאמה",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const source = page.getByRole("menuitem", { name: "למקור", exact: true });
  await expect(source).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "שמור כערך עצמאי", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await page.locator(".heb-input").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

for (const nextContext of ["another input", "library navigation"]) {
  test(`late match-save response after ${nextContext} preserves its captured parent without a stale notice`, async ({
    page,
  }) => {
    const card = await discover(page, "44");
    let releaseResponse;
    const responseGate = new Promise((resolve) => {
      releaseResponse = resolve;
    });
    let markCommitted;
    const committed = new Promise((resolve) => {
      markCommitted = resolve;
    });
    let saved;
    await page.route("**/api/entries/curated-matches", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      expect(route.request().postDataJSON().parentOriginalText).toBe("44");
      const response = await route.fetch();
      saved = await response.json();
      expect(response.ok()).toBe(true);
      markCommitted();
      await responseGate;
      await route.fulfill({ response });
    });
    try {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/entries/curated-matches",
      );
      await card
        .getByRole("button", { name: "שמור התאמה", exact: true })
        .click();
      await committed;
      if (nextContext === "another input") {
        await page.locator(".heb-input").fill("17");
        await expect(page.locator(".discovery-header h2")).toContainText("17");
        await expect(
          page.locator(".match-card:not(.skeleton-card)").first(),
        ).toBeVisible();
      } else {
        await page
          .locator(".app-header")
          .getByRole("button", { name: "שמורים", exact: true })
          .click();
        await expect(
          page.locator(`[data-match-key="tanach:${saved.matches[0].id}"]`),
        ).toBeVisible();
      }
      releaseResponse();
      await responsePromise;
      if (nextContext === "another input") {
        await expect(
          card.getByRole("button", { name: "שמור התאמה", exact: true }),
        ).toBeEnabled();
        const currentParent = (
          await (
            await page.request.get("/api/entries?parentOriginalText=17")
          ).json()
        ).entries;
        expect(
          currentParent.every(
            (entry) =>
              !(entry.curated_matches || []).some(
                (match) => match.id === saved.matches[0].id,
              ),
          ),
        ).toBe(true);
        await page.locator(".heb-input").fill("44");
      } else {
        await page
          .locator(".app-header")
          .getByRole("button", { name: "מחשבון", exact: true })
          .click();
      }
      await expect(
        card.getByRole("button", { name: "נשמרה", exact: true }),
      ).toBeDisabled();
      await expect(page.locator(".curated-message")).toHaveCount(0);
      const capturedParent = (
        await (
          await page.request.get("/api/entries?parentOriginalText=44")
        ).json()
      ).entries;
      expect(
        capturedParent.find((entry) => entry.id === saved.parentId)
          .original_text,
      ).toBe("44");
    } finally {
      releaseResponse();
      if (saved?.parentCreated)
        expect(
          (await page.request.delete(`/api/entries/${saved.parentId}`)).ok(),
        ).toBe(true);
    }
  });
}
