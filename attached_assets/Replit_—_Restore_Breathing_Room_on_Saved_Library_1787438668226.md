The recent compact-card change improved information density, but the שמורים page now feels too compressed/claustrophobic on desktop.

Do NOT make the cards tall again.

The issue is primarily that the content stretches almost edge-to-edge across the viewport and the cards feel like long horizontal slabs.

## Goal

Create:

**compact cards inside a spacious centered library**

rather than:

**full-width compact cards filling the screen**

## 1. CENTER THE LIBRARY CONTENT

On desktop, constrain the main שמורים content area to approximately:

`max-width: 1350px–1450px`

centered horizontally.

Use responsive horizontal padding.

Do NOT let the search bar and saved cards stretch nearly 100% across a 1900px desktop monitor.

There should be clearly visible page-background breathing room on both sides.

At smaller desktop widths, naturally use more of the available viewport.

---

## 2. KEEP CARDS COMPACT — BUT NOT CRAMPED

Target a normal collapsed saved-entry height of approximately:

**85–95px**

depending on content.

Do not force a rigid height if a longer Hebrew phrase genuinely needs another line.

Use comfortable internal padding approximately:

- 18–22px vertically
- 22–28px horizontally

The cards should feel efficient but not compressed.

---

## 3. ADD SPACE BETWEEN CARDS

Use approximately:

**16–18px**

vertical gap between collapsed cards.

The beige page background should be visibly present between entries.

Do not visually stack cards into one continuous wall.

---

## 4. SEARCH BAR

The search bar should use the SAME centered content width as the saved-entry list.

Do not allow it to span significantly wider than the cards.

Keep its current general appearance.

---

## 5. CARD HIERARCHY

Inside each collapsed card:

Primary:

**saved Hebrew phrase**

Secondary but still clearly visible:

**full gematria — decimal + Hebrew numeral**

Then compact supporting information:

- ר״ת
- גימטריית ר״ת

Do not squeeze all metadata into an unreadably dense single line if there is adequate room.

Use sensible spacing between the phrase, main gematria, and secondary calculations.

---

## 6. ACTION ICONS

Keep expand and delete actions subtle.

They currently sit on the opposite side of the card, which is fine.

However:

- give them adequate edge padding;
- do not let them look pressed against the card border;
- do not increase their visual prominence.

---

## 7. EXPANDED CARDS

Expanded cards may naturally become taller.

Do not artificially restrict expanded content.

The compact-height target applies only to collapsed cards.

---

## 8. DO NOT USE TWO COLUMNS

Keep one vertical saved-entry list.

The saved phrases may become long and Hebrew reading is cleaner in a single-column library.

Do not turn the page into a card grid.

---

## 9. RESPONSIVE BEHAVIOR

Desktop:

centered max-width content with generous side breathing room.

Tablet:

reduce side margins naturally.

Mobile:

use most of the available width with normal small page padding.

Do not enforce desktop max-width/margins in a way that makes mobile cramped.

---

## PRESERVE

Do not change:

- saved data
- database
- gematria calculations
- ראשי תיבות
- search behavior
- delete behavior
- expand behavior
- matching
- palette
- fonts
- navigation

This is a layout/breathing-room correction only.

The desired result is:

**less horizontal stretching, more surrounding whitespace, compact but comfortable saved cards.**