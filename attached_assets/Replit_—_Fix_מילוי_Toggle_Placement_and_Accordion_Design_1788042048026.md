# FIX מילוי TOGGLE — INTEGRATED ACCORDION / DISCLOSURE

The מילוי feature itself is working.

This task is ONLY to improve the placement and visual relationship between:

- the `מילוי` toggle
- the expanded מילוי content

## CURRENT PROBLEM

The current `מילוי` button appears as a small standalone button floating by itself between the three primary calculation results and the expanded מילוי section.

It feels visually disconnected and slightly accidental.

The user should understand immediately that:

**מילוי is an optional expandable calculation section belonging to the current calculation.**

Do NOT change any מילוי calculation logic.

---

# DESIRED SOLUTION

Replace the current floating button with a tasteful **full-width disclosure / accordion header**.

The מילוי toggle and its expanded content should visually behave as ONE component.

Conceptually:

### CLOSED

```text
┌───────────────────────────────────────────────┐
│ מילוי                                     ⌄  │
└───────────────────────────────────────────────┘
```

### OPEN

```text
┌───────────────────────────────────────────────┐
│ מילוי                                     ⌃  │
├───────────────────────────────────────────────┤
│                                               │
│   existing מילוי results                     │
│                                               │
└───────────────────────────────────────────────┘
```

Do not literally copy the ASCII styling.

Use the existing application design system.

---

# PLACEMENT

Place the disclosure directly underneath the existing three primary result calculations:

- גימטריה מלאה
- ראשי תיבות
- גימטריית ראשי תיבות

It should use the same content width and horizontal alignment as that result area.

There should NOT be a small floating `מילוי` button on the far right anymore.

The order should feel like:

1. Primary calculation cards
2. מילוי expandable section
3. Existing lower calculator/Tanach content

---

# CLOSED STATE

When closed, show only a slim refined row.

Label:

**מילוי**

Include a small disclosure chevron.

Requirements:

- full-width within the calculator content area
- approximately 44–52px high
- subtle white/cream surface
- thin existing warm border
- existing border radius
- navy text
- restrained gold detail where appropriate
- no heavy shadow
- no giant icon
- comfortable RTL alignment

It should look clickable but secondary.

Do NOT make it look like a large primary CTA.

---

# LABEL POSITION

Because this is Hebrew RTL:

Place:

**מילוי**

naturally on the right side.

Place the disclosure indicator in a visually balanced position.

Use the existing application's RTL conventions rather than simply mirroring an English accordion blindly.

---

# CHEVRON

Use a subtle chevron.

Closed:

indicate expand.

Open:

indicate collapse.

The change should be visually obvious but restrained.

Do not use a large arrow.

Do not use unusual characters if an existing icon component is available.

---

# OPEN STATE

When opened:

- keep the same disclosure header visible
- reverse/change the chevron appropriately
- render the EXISTING מילוי content immediately underneath
- eliminate the current large visual gap between the button and the content
- header + expanded content should feel like one continuous component

Do not duplicate the word `מילוי` unnecessarily inside the panel if the accordion header already makes the context obvious.

If an internal small kicker/label is useful for hierarchy, keep it subtle.

---

# CARD CONTINUITY

The accordion should visually feel like:

one outer section

rather than:

button

large gap

unrelated card

You may use:

- shared outer border
- connected border radii
- a subtle divider between header and content

For example:

closed:
all corners rounded

open:
header retains top corners
content continues underneath
bottom content owns bottom corners

Use whatever implementation best fits the existing component structure.

---

# EXISTING מילוי CONTENT

Preserve the current content and logic:

- שם האות במילואה
- expanded מילוי text
- גימטריית המילוי המלא
- מילוי בלבד
- פירוט מילים ואותיות
- הגדרות מילוי
- live recalculation

Do NOT redo the entire מילוי result design as part of this task.

Small spacing adjustments required to integrate it into the accordion are allowed.

---

# הגדרות מילוי

Keep:

**הגדרות מילוי**

inside the expanded panel.

It should remain a secondary action.

Do NOT move it into the primary calculator header.

Do NOT make it compete visually with the main מילוי result.

---

# OPEN/CLOSED BEHAVIOR

Preserve existing behavior:

- closed by default
- never opens automatically while typing
- explicit click opens it
- explicit click closes it
- while open, calculations update live with input
- closing it does not alter input or calculations
- reopening displays the current input's מילוי immediately

Do not change persistence/calculation behavior.

---

# RESPONSIVENESS

Desktop:

The disclosure should span the normal result width and feel integrated.

Mobile/tablet:

- remain full width
- maintain comfortable tap target
- no horizontal overflow
- expanded content stacks naturally
- proper RTL alignment

---

# ACCESSIBILITY

The entire disclosure header should be clickable, not only the tiny chevron.

Use correct accordion/disclosure semantics:

- button behavior
- keyboard activation
- `aria-expanded`
- relationship with the controlled panel

Keep a visible but tasteful keyboard focus state.

---

# VISUAL GOAL

The finished page should communicate:

**Here are my normal calculations.**

Then:

**If I want an advanced מילוי calculation, I can open this layer.**

It should NOT communicate:

**Here is another unrelated button floating around the page.**

---

# DO NOT CHANGE

Do NOT modify:

- מילוי mappings
- מילוי calculation engine
- standard gematria
- ראשי תיבות
- saved entries
- database
- Tanach
- matching
- authentication
- main calculator card layout
- color palette
- typography

This is specifically a visual placement/integration fix.

---

# ACCEPTANCE CHECK

Verify:

1. The old standalone floating `מילוי` button is gone.
2. A full-width `מילוי` disclosure appears immediately below the main result group.
3. Closed state is compact and elegant.
4. Opening it produces one visually connected section.
5. There is no awkward gap between toggle and results.
6. הגדרות מילוי remains available inside.
7. Existing מילוי calculations are unchanged.
8. Opening/closing works by mouse and keyboard.
9. RTL alignment is correct.
10. Mobile has no overflow.
11. No unrelated UI changed.

Do not perform unrelated refactors.