# FEATURE — ON-DEMAND מילוי CALCULATION

Add a complete **מילוי** calculation feature to the EXISTING Gematria application.

This is an advanced optional calculation.

## CORE UX RULE

מילוי must NOT automatically appear every time the user types.

The client's normal calculator should remain clean and continue showing the existing primary calculations exactly as it does now:

1. גימטריה מלאה
2. ראשי תיבות
3. גימטריית ראשי תיבות
4. existing word breakdown
5. existing matching / Tanach functionality

מילוי is an OPTIONAL advanced tool.

The user must explicitly press a tasteful:

**מילוי**

button/control to reveal it.

---

# CRITICAL — PRESERVE THE EXISTING APPLICATION

Do NOT:

- redesign the main calculator
- alter existing gematria calculations
- alter ראשי תיבות calculations
- alter saved matching
- alter Tanach functionality
- alter saved entries
- delete/reset existing database records
- restructure production data unnecessarily
- bring מילוי into the main result cards automatically

This feature must be additive.

The client's existing saved database is real production data.

**ZERO existing records may be deleted, reset or recreated as part of this work.**

If a schema change is required, use an additive migration only.

---

# 1. מילוי BUTTON

Add a small, refined control near the existing main result area.

Preferred label:

**מילוי**

Use a small chevron or appropriate restrained icon if it helps.

It should feel like an advanced calculation that is available when wanted.

It should NOT look like:

- a fourth primary result card
- a huge CTA button
- a settings button
- a separate navigation tab

Suggested feel:

`מילוי  ⌄`

When closed.

And:

`מילוי  ⌃`

when open.

The exact icon direction should respect RTL and the existing component library.

---

# PLACEMENT

Place the מילוי control naturally AFTER the three main calculation results and BEFORE or near the detailed breakdown area.

It should visually belong to the current calculation.

Do not put it prominently in the header.

Do not put it beside שמור if that makes Save and מילוי look equally important.

מילוי is secondary.

---

# 2. DEFAULT STATE

On page load:

**מילוי is CLOSED.**

Typing normally must not automatically open it.

The user explicitly chooses when to inspect מילוי.

If the user opens it and then continues typing, keep it open and update the מילוי results live.

If the user closes it, keep it hidden while normal calculations continue.

---

# 3. WHAT מילוי MEANS

Each Hebrew letter is expanded into the Hebrew spelling of its letter name.

Example:

א → אלף  
ב → בית  
ג → גימל

The calculation must use an editable **מילוי table** rather than hard-coded assumptions spread throughout the application.

Create one canonical מילוי configuration object/source.

---

# 4. DEFAULT מילוי TABLE

Create a preset called:

**מילוי רגיל**

Use this as the initial/default table:

א → אלף  
ב → בית  
ג → גימל  
ד → דלת  
ה → הא  
ו → ואו  
ז → זין  
ח → חית  
ט → טית  
י → יוד  
כ → כף  
ל → למד  
מ → מם  
נ → נון  
ס → סמך  
ע → עין  
פ → פא  
צ → צדי  
ק → קוף  
ר → ריש  
ש → שין  
ת → תו

IMPORTANT:

This table is editable because different מסורות / methods may use different spellings.

Do NOT build the calculation engine around assumptions that these spellings can never change.

---

# FINAL LETTERS

Final letters use the מילוי of their standard form:

ך → כ → כף  
ם → מ → מם  
ן → נ → נון  
ף → פ → פא  
ץ → צ → צדי

Do not create separate מילוי settings for final letters unless there is a compelling technical reason.

---

# 5. CORE CALCULATION ENGINE

Create a reusable מילוי utility/service.

For any entered Hebrew text:

1. normalize Hebrew using the application's existing normalization rules
2. ignore spaces/punctuation/ניקוד/טעמים as existing gematria does
3. map every Hebrew letter to its configured מילוי
4. create the expanded מילוי text
5. calculate its gematria using the EXISTING standard gematria engine

Do NOT duplicate gematria values in another implementation.

Reuse the tested standard gematria function.

---

# EXAMPLE

If the input is:

אב

and the current table contains:

א → אלף  
ב → בית

then:

Expanded מילוי:

אלף בית

Full expanded value:

אלף = 111  
בית = 412

Total:

523

This is an example only.

Do not hardcode it.

---

# 6. SUPPORT BOTH מילוי INTERPRETATIONS

Internally support BOTH useful calculations:

## A. שם האות במילואה

Calculate the complete spelled-out letter.

Example:

א → אלף

Value:

111

## B. המילוי בלבד

Calculate only the letters added after the original base letter.

Example:

א → אלף

Base letter:

א

Added מילוי:

לף

Value:

110

Another conceptual example:

ב → בית

מילוי בלבד:

ית

Do this dynamically from the configured spelling.

---

# PRIMARY UX

Do NOT overwhelm the user by presenting two giant competing totals.

When the מילוי panel opens, make the main expanded מילוי result easy to understand.

Recommended hierarchy:

### מילוי

Expanded text

### גימטריית המילוי

decimal + Hebrew numeral

Then provide a compact:

**פירוט**

area where the user can inspect:

- each original letter
- its מילוי
- full spelling value
- מילוי-only letters/value

If the current product terminology makes it clearer to expose both totals immediately, keep them compact and clearly labelled.

Do not make the advanced section visually heavier than the normal calculator.

---

# 7. WORD-BY-WORD מילוי

Support multi-word phrases correctly.

Example conceptual structure:

Original:

שמע ישראל

Display inside מילוי:

### שמע

ש → שין  
מ → מם  
ע → עין

[calculated total]

### ישראל

י → יוד  
ש → שין  
ר → ריש  
א → אלף  
ל → למד

[calculated total]

Then show the complete phrase מילוי total.

Do NOT require every letter detail to remain permanently expanded.

Use progressive disclosure.

---

# 8. DESIGN OF THE EXPANDED מילוי SECTION

The section should feel like a refined extension of the existing calculator.

Use:

- existing cream/off-white surfaces
- navy text
- restrained gold accents
- existing border radius
- subtle borders
- generous but controlled spacing
- proper RTL

Do NOT:

- create a giant dashboard card
- introduce new colors
- use heavy gradients
- add excessive icons
- display 50 numbers simultaneously

The user should be able to understand the primary result immediately and expand details only when wanted.

---

# 9. הגדרות מילוי

Inside the opened מילוי section, add a discreet action:

**הגדרות מילוי**

Do not put the full table directly on the calculator.

Clicking הגדרות מילוי should open a polished:

- modal
- drawer
- or other existing application overlay pattern

Choose whatever fits the current architecture/design best.

---

# 10. EDITABLE מילוי TABLE

The settings UI should show all 22 Hebrew base letters.

Example:

| אות | מילוי |
| א | אלף |
| ב | בית |
| ג | גימל |

etc.

Each מילוי value should be directly editable.

The client should be able to change, for example:

ה → הא

to:

ה → הי

or:

ו → ואו

to:

ו → ויו

without changing code.

---

# SETTINGS UX

The table must remain simple.

For each row:

- original letter
- editable מילוי spelling

No technical fields.

No numerical IDs.

No JSON.

No developer terminology.

---

# SETTINGS ACTIONS

Include:

**שמור שינויים**

and:

**החזר לברירת מחדל**

Reset must restore the original מילוי רגיל preset.

Before resetting user-customized values, use a lightweight confirmation so the user does not accidentally lose his custom table.

---

# 11. VALIDATION

A מילוי value should:

- contain Hebrew letters
- not be blank
- retain the original/base letter appropriately

If the user enters an obviously invalid value, show a small Hebrew validation message rather than silently breaking calculations.

Do not expose technical errors.

---

# 12. PERSISTENCE

The user's מילוי configuration must persist.

Do NOT use temporary React/Vue component state as the only source.

If the application currently has authentication/user ownership:

store מילוי settings PER USER.

That means:

Client can use:

ו → ואו

while another user could use:

ו → ויו

without affecting the client.

This is important.

If the user system has NOT yet been implemented, use the cleanest current persistent configuration mechanism while structuring the schema so it can become user-specific later.

---

# EXISTING CLIENT DATA SAFETY

Do NOT modify or overwrite existing saved gematria entries when a מילוי preference changes.

The מילוי table is a calculation preference.

Changing:

ו → ואו

to:

ו → ויו

must NOT rewrite or delete the client's existing standard-gematria library.

Keep standard saved data separate.

---

# 13. SAVING מילוי

For this first implementation:

DO NOT automatically add מילוי results into every existing saved entry unless required by current architecture.

The main requirement is CALCULATION.

If saving מילוי metadata is useful later, it can be added separately.

Do not expand the database scope unnecessarily during this task.

---

# 14. LIVE BEHAVIOR

When מילוי is CLOSED:

do not perform expensive unnecessary UI work.

Normal calculator remains unchanged.

When מילוי is OPEN:

typing/editing the current Hebrew input should immediately update:

- expanded מילוי
- מילוי total
- word breakdown
- letter breakdown

without requiring another button.

The button controls VISIBILITY, not whether the calculation can update.

---

# 15. HEBREW NUMERAL OUTPUT

Where numerical מילוי totals are shown, display BOTH:

- decimal number
- Hebrew numeral representation

using the EXISTING shared corrected Hebrew-number converter.

Example concept:

523 · תקכג

Do NOT build a separate Hebrew numeral converter.

Preserve the application's special/correct behavior for values such as:

15  
16  
17  
18  
19

and all existing fixes.

---

# 16. EMPTY INPUT

When there is no Hebrew input:

the מילוי button may remain disabled or available but should not open a meaningless result panel.

Choose the cleanest UX.

Do not display zero-filled empty cards.

---

# 17. PERFORMANCE

מילוי calculations are deterministic and should happen locally.

Do not create server requests for every letter solely to calculate מילוי.

Use pure calculation utilities.

Server/database interaction is only necessary for persistent user settings.

---

# 18. TESTS — CALCULATION

Add comprehensive tests.

At minimum verify:

א → אלף  
full value = 111  
pure מילוי = לף  
pure מילוי value = 110

Test:

- multiple letters
- full words
- multi-word phrases
- final letters
- spaces ignored
- punctuation ignored
- ניקוד ignored
- טעמים ignored

---

# 19. TESTS — CUSTOM TABLE

Test that changing a מילוי mapping actually changes calculations.

Example:

Set a configurable letter to an alternate spelling.

Verify:

- expanded מילוי updates
- full מילוי value updates
- מילוי-only value updates
- standard gematria does NOT change

This separation is critical.

---

# 20. TESTS — PERSISTENCE

Verify:

1. edit מילוי table
2. save
3. refresh/reopen app
4. customized table remains
5. reset to default
6. default mappings return

If per-user auth exists:

verify one user's custom table does NOT affect another user.

---

# 21. TESTS — UI

Verify:

1. מילוי is hidden by default
2. normal calculator remains visually unchanged
3. pressing מילוי opens the section
4. pressing again closes it
5. typing while open updates the result
6. typing while closed does not open it automatically
7. הגדרות מילוי opens correctly
8. editing and saving works
9. reset works
10. mobile has no horizontal overflow

---

# 22. EXISTING TEST SUITE

Run all existing application tests.

There must be no regressions in:

- normal gematria
- ראשי תיבות
- saved matches
- Tanach
- search
- user data
- library
- navigation

---

# 23. DATABASE SAFETY

If database/schema changes are required:

- additive migration only
- no DROP
- no TRUNCATE
- no reset
- no reseeding production data
- no destructive recreation
- no deletion of existing client records

Record existing relevant row counts before and after any migration.

Existing client records deleted:

**MUST equal 0**

If safe migration cannot be guaranteed, STOP and report before applying a destructive workaround.

---

# FINAL ACCEPTANCE EXPERIENCE

The final interaction should feel like this:

1. User opens calculator.
2. The existing calculator looks exactly as clean as before.
3. User types Hebrew.
4. Normal gematria/ראשי תיבות results update normally.
5. No מילוי clutter appears.
6. User decides he wants מילוי.
7. Presses the tasteful מילוי control.
8. A polished advanced section opens.
9. He sees the expanded מילוי and its gematria.
10. He can inspect words/letters if desired.
11. He can open הגדרות מילוי.
12. He can edit the א–ת מילוי table.
13. Changes persist.
14. Returning to calculator immediately uses his preferred מילוי.
15. Closing מילוי returns the page to the original simple calculator.

The product philosophy is:

**simple calculator on the surface; powerful traditional calculation tools available on demand.**

Do not perform unrelated refactors or redesigns.