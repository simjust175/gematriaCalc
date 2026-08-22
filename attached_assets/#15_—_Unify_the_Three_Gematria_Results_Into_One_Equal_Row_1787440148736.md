# #15 — Unify the Three Gematria Results Into One Equal Row

## What & Why

The calculator currently presents:

- גימטריה מלאה
- ראשי תיבות
- גימטריית ר״ת

using a `1 + 2` layout, where גימטריה מלאה occupies a full-width row and the other two appear beneath it.

The client does NOT consider גימטריה מלאה substantially more important than the other two.

These are three parallel outputs of the same calculation.

Change the visual hierarchy so that on desktop all THREE results appear together in **one clean equal row**.

This is a focused UI/layout change.

Do NOT modify calculation logic, saved matching, database behavior, keyboard mapping, or Tanach.

---

# DESKTOP TARGET

Use one row containing THREE equal-width calculation cards:

| גימטריה מלאה | ראשי תיבות | גימטריית ר״ת |
| --- | --- | --- |
| 384 · שפד | ווו | 150 · קנ |

Exact RTL ordering should feel natural in Hebrew.

Each card should occupy approximately one-third of the available calculation width.

All three should have:

- same height
- same border radius
- same general border treatment
- same vertical padding
- same label size
- same result typography scale
- same visual weight

The three cards should clearly feel like one calculation group.

---

# VISUAL EQUALITY

Do NOT make גימטריה מלאה look like the hero anymore.

Specifically:

- no substantially larger font
- no substantially taller card
- no dramatically stronger background
- no extra padding compared with the other two
- no full-width treatment on desktop

A subtle existing gold accent may remain where appropriate, but it must not make the full-gematria result appear twice as important.

The user should visually understand:

**three related results, equal importance**

---

# RESULT CONTENT

## Card 1

Label:

**גימטריה מלאה**

Result:

numeric value + Hebrew-number representation

Example:

**384 · שפד**

---

## Card 2

Label:

**ראשי תיבות**

Result:

generated ראשי תיבות

Example:

**ווו**

---

## Card 3

Label:

**גימטריית ר״ת**

Result:

numeric value + Hebrew-number representation

Example:

**150 · קנ**

---

# RESULT TYPOGRAPHY

Use approximately the SAME result font size in all three cards.

Obviously a longer Hebrew ראשי תיבות string may require responsive sizing/wrapping, but do not intentionally make it smaller just because it is ראשי תיבות.

The numeric/Hebrew value in גימטריה מלאה and גימטריית ר״ת should use the same styling convention.

For example:

`384 · שפד`

and:

`150 · קנ`

should visually belong to the same system.

---

# CARD HEIGHT

Keep these cards compact.

They should not consume excessive vertical space.

Target approximately:

**130–160px maximum on normal desktop**

or whatever fits the existing design naturally.

Avoid large unused blank areas.

The calculator now has:

- matching
- word breakdown
- saved functionality

so vertical efficiency matters.

---

# SAVE BUTTON

The שמור action applies to the ENTIRE current calculation.

Therefore do NOT visually attach it only to the גימטריה מלאה card.

Move it to a small deliberate calculation-level position.

Preferred placement:

### Option A — immediately above the three-card row

A compact action row containing:

`שמור`

aligned naturally to the edge of the calculation area.

OR:

### Option B — immediately below the three-card row

Again, compact and aligned intentionally.

Choose whichever fits the existing calculator spacing better.

Do NOT:

- put Save inside only one of the three result cards
- create a large full-width Save bar
- make Save visually dominate the calculations

Keep the existing bookmark/save icon and restrained gold styling.

---

# SAVED STATE

When the current entry has already been saved:

replace:

**שמור**

with the existing:

**כבר שמור**

or current saved-state treatment.

The saved state should remain visually quieter than the unsaved action.

Do not change duplicate-save behavior.

---

# MATCHES

Do NOT alter the current saved matching logic.

The match panel may remain where it currently exists.

The three-card change should simply free vertical space and make the calculator feel more balanced.

Do not move matching unless necessary to maintain normal spacing.

---

# WORD BREAKDOWN

Keep:

**פירוט מילים**

underneath the calculation/matching area as currently implemented.

Do not change its behavior.

---

# RESPONSIVE BEHAVIOR

## Large desktop / desktop

Three cards in ONE ROW:

`1fr 1fr 1fr`

with a consistent gap.

---

## Tablet

Use good judgment based on available width.

Preferred:

- three cards in one row if they remain comfortably readable;
- otherwise allow a `2 + 1` layout.

Do not squeeze values until they become difficult to read.

---

## Mobile

Do NOT force three narrow cards across a phone.

Preferred mobile structure:

### Option 1

Three full-width stacked compact cards.

OR, if width comfortably allows:

### Option 2

גימטריה מלאה full width

then:

ראשי תיבות + גימטריית ר״ת side-by-side

Choose the version that produces the best readability on the existing mobile breakpoints.

Desktop MUST remain three equal cards in one row.

---

# LONG CONTENT

Handle unusually long ראשי תיבות gracefully.

Do not:

- overflow the card
- create horizontal scrolling
- destroy the equal-row layout

Allow sensible wrapping or responsive font reduction only when genuinely required.

Normal results should remain visually equal.

---

# RTL

Preserve correct RTL behavior.

Do not accidentally reverse:

- number / Hebrew-number presentation
- labels
- card ordering
- punctuation spacing

Verify visually with actual Hebrew content.

---

# EMPTY INPUT

When there is no active calculation, preserve the current clean empty state.

Do not render three large meaningless `0` result cards unless that is already intentional behavior.

---

# PRESERVE

Do NOT change:

- standard gematria math
- Hebrew numeral conversion
- ראשי תיבות generation
- ראשי תיבות gematria
- automatic Hebrew keyboard feature
- Save/database implementation
- saved matching
- word matching
- matching badges
- word breakdown
- letter breakdown
- Tanach
- app navigation
- palette
- fonts
- overall application max-width

This is a CALCULATION-RESULT LAYOUT change only.

---

# MANUAL ACCEPTANCE TEST

Test with a multi-word phrase that produces all three outputs.

Verify:

1. calculator loads normally;
2. three result cards appear in a single row on desktop;
3. each card has equal width;
4. each card has equal/similar height;
5. גימטריה מלאה no longer dominates visually;
6. all three labels use consistent typography;
7. all three primary values use comparable typography;
8. numeric + Hebrew-number results remain correct;
9. ראשי תיבות remains correct;
10. Save is clearly associated with the entire calculation rather than one card;
11. already-saved state still works;
12. live matching remains unchanged;
13. word breakdown remains unchanged;
14. no horizontal overflow occurs;
15. tablet layout remains readable;
16. mobile layout does not force three cramped columns;
17. long ראשי תיבות do not overflow;
18. RTL remains correct.

Do not report complete until the desktop layout has been visually verified with all three cards in the same row.

The final visual principle is:

**one calculation → three equal results.**