# FIX TANACH SIDEBAR SCROLLING / HEIGHT CAP

There is a layout bug in the תנ״ך reader sidebar.

The sidebar currently feels artificially capped vertically. The visible פסוקים list gets too little usable height, and the navigation controls above it appear to be consuming/fixing space in a way that prevents the verse list from naturally using the remaining viewport height.

This is a SCROLL / FLEX / HEIGHT issue.

Do NOT redesign the sidebar.

Do NOT change Tanach navigation logic.

Do NOT change:

- search behavior
- ספר selector
- פרשה selector
- פרק selector
- פסוק selector
- Tanach content
- verse rendering
- selected verse behavior
- gematria logic
- right-hand statistics
- central reader layout
- colors
- typography

Fix only the sidebar's height distribution and scrolling behavior.

---

# CURRENT PROBLEM

The left תנ״ך sidebar contains roughly:

1. header
2. search
3. navigation controls
4. verse list

The verse list currently appears to have an unnecessarily restrictive fixed/max height.

This causes a small scrollable window even when significantly more vertical screen space is available.

It looks as though there may be:

- a hardcoded `height`
- `max-height`
- nested `overflow-y: auto`
- an incorrect `calc(100vh - ...)`
- or a flex child missing `min-height: 0`

Inspect the actual CSS/layout before changing anything.

Do NOT simply increase an arbitrary pixel value.

---

# REQUIRED LAYOUT MODEL

The sidebar should behave structurally like this:

```text
Sidebar — full available viewport height
│
├── Header                → natural/fixed height
├── Search                → natural height
├── Navigation controls   → natural height
└── Verse list            → FLEXES to fill ALL remaining height
                            and this is the section that scrolls
```

The verse list should automatically grow or shrink depending on:

- viewport height
- number of navigation controls visible
- Torah mode vs Nach mode
- responsive width/height

There should not be separate arbitrary scroll caps for different modes.

---

# DESKTOP BEHAVIOR

On a normal desktop viewport:

The sidebar should extend naturally from beneath the app header toward the bottom of the viewport.

The verse list should use essentially ALL remaining vertical space.

If there are many verses:

- the verse list scrolls internally
- the search/navigation controls remain visible

If there are only a few verses:

- do not create unnecessary empty scrolling
- do not force a scrollbar

---

# IMPORTANT — ONLY ONE MAIN SIDEBAR SCROLL REGION

Avoid nested vertical scroll regions unless absolutely necessary.

Preferred:

Search + navigation remain fixed/sticky within the sidebar structure.

The verse list itself is the primary vertical scrolling region.

Do not make:

- the entire sidebar scroll
AND
- the verse list scroll independently

if one clean scroll region is sufficient.

Nested scrollbars make the reader feel broken.

---

# FLEXBOX / GRID IMPLEMENTATION

Prefer structural layout rather than pixel calculations.

Conceptually:

```css
.sidebar {
  display: flex;
  flex-direction: column;
  height: ...available viewport height...;
  min-height: 0;
}

.sidebar-controls {
  flex: 0 0 auto;
}

.sidebar-verses {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
```

Do NOT blindly copy this CSS.

Adapt it to the existing component/layout architecture.

The important principles are:

- parent has a defined available height
- controls use natural height
- verse area gets remaining space
- scroll belongs to verse area
- flex child can actually shrink because `min-height: 0` is correctly set where needed

---

# APP HEADER OFFSET

Account correctly for the top application header.

Do not let the sidebar extend underneath it.

If the sidebar begins below the header, its usable height should be based on:

viewport height minus actual header offset

using the existing layout structure where possible.

Avoid magic numbers duplicated across components.

---

# TORAH VS NACH

The fix must work for both navigation modes.

## Torah mode

Search  
ספר  
פרשה  
verse list

## Nach mode

Search  
ספר  
פרק + פסוק  
verse list

The verse list should automatically receive whatever remaining height is available.

Do NOT give Torah and Nach separate hardcoded list heights.

---

# RESPONSIVE BEHAVIOR

Verify:

- standard desktop
- smaller laptop height
- large monitor
- tablet if sidebar remains visible

Changing browser height should dynamically change the visible verse-list height.

No clipping.

No giant blank area.

No double vertical scrollbar.

No horizontal scrollbar introduced.

---

# SCROLL POSITION

Do not unnecessarily reset the verse-list scroll position during unrelated UI updates.

Existing expected behavior when navigating to a specific verse should remain intact.

If the app already auto-scrolls to the active verse, preserve that behavior.

---

# CUSTOM SCROLLBAR

Preserve the existing subtle scrollbar appearance if already styled.

Do not make this task about redesigning the scrollbar.

The issue is usable height, not scrollbar appearance.

---

# VERIFY THE SPECIFIC FAILURE SHOWN

The current sidebar shows only a relatively small number of verse rows while a large amount of vertical viewport remains available.

After the fix, the list should extend much farther downward and use the available screen height naturally.

It should look like a proper reader sidebar rather than a short list embedded inside a larger empty panel.

---

# ACCEPTANCE TEST

Verify at least:

1. Open תנ״ך reader on desktop.
2. Search/nav controls remain visible at the top of the sidebar.
3. Verse list fills all remaining vertical sidebar space.
4. Verse list scrolls to the end of a long chapter/parsha.
5. No verse becomes unreachable.
6. There is no artificial scroll cap.
7. There is no nested/double vertical scrollbar.
8. Torah mode works.
9. Nach mode works.
10. Changing browser window height updates the available list height correctly.
11. No horizontal overflow is introduced.
12. Main center reader layout is unchanged.
13. Right-side information panels are unchanged.

Inspect the root cause and fix it structurally.

Do not simply replace one fixed height with a larger fixed height.

Report which CSS/layout rule was causing the cap and which files were changed.