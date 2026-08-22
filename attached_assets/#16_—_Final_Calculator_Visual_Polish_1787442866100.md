# #16 — Final Calculator Visual Polish

## What & Why

The calculator is now functionally strong and the three-result unified panel is working well.

This task is a SMALL visual/UX polish pass only.

Do NOT change calculation logic, matching logic, saved data, keyboard mapping, Tanach, database behavior, or routing.

We only want to improve:

1. the empty state;
2. the calculator input height;
3. the saved-match panel heading/context.

---

# 1. REMOVE THE REDUNDANT EMPTY-STATE MESSAGE

When the calculator input is empty, the page currently shows extra centered text below the textarea such as:

**כתוב מילה או משפט בעברית**

and:

**החישוב מתבצע אוטומטית**

This is redundant because the textarea itself already contains a clear placeholder:

**הקלד מילה או משפט...**

Remove the extra centered empty-state instructional text completely.

## Desired empty state

When no text has been entered:

- show the calculator textarea;
- keep the automatic-Hebrew-keyboard control;
- do NOT show calculation result panels;
- do NOT show word breakdown;
- do NOT show redundant centered helper text beneath the textarea.

The empty page should feel intentional and clean, not unfinished.

Do not replace the removed text with another large empty-state illustration or message.

---

# 2. REDUCE THE DEFAULT TEXTAREA HEIGHT

The current calculator textarea is still somewhat too tall for normal words and short phrases.

Reduce its initial/default desktop height by approximately **15–20%**.

Target approximately:

**180–200px on normal desktop**

Use the exact value that fits the current design best.

## Important behavior

Keep the existing auto-grow behavior.

The textarea should:

- begin at a more compact height;
- grow naturally as the Hebrew text becomes longer;
- remain comfortable for a full phrase or pasuk;
- preserve large readable Hebrew typography;
- preserve RTL;
- preserve caret behavior;
- preserve the automatic Hebrew keyboard feature;
- avoid a horizontal scrollbar.

Use a sensible maximum height before internal vertical scrolling is introduced for unusually long input.

Do NOT make the input feel like a small single-line field.

It should remain the clear primary interaction area.

---

# 3. CLARIFY THE SAVED-MATCH PANEL HEADER

The current matching panel shows something approximately like:

**התאמות שמורות**

and then a standalone number such as:

**882**

The number does not clearly explain itself.

Improve the heading so the user immediately understands:

**these are saved items matching the current calculated value.**

## Preferred treatment

When the current full gematria is:

882

show something approximately like:

**התאמות שמורות**

**התאמות ל־882 · תתפב**

Use the existing Hebrew numeral conversion dynamically.

Do NOT hardcode the example.

Another equally clean compact implementation is acceptable, but the numerical value must have clear context.

The user should never wonder why a random number is sitting in the panel header.

---

# MATCH-TYPE CONTEXT

Do NOT change any match logic.

Continue displaying the existing match-reason badges such as:

- גימטריה מלאה
- ראשי תיבות
- גימטריית ר״ת
- existing word/source context where appropriate

This task only clarifies the overall matching-panel header.

If the match panel is currently displaying matches for more than one relevant live value, do not incorrectly label everything as though it matched the full gematria.

Use the existing result data to ensure the header remains truthful.

If one global number would be misleading because results come from multiple match mechanisms, use a neutral heading such as:

**התאמות שמורות**

with a compact current-calculation context nearby, while leaving each result's individual badge to explain the exact reason.

Accuracy is more important than forcing the exact wording above.

---

# SPACING

After removing the empty-state text and reducing textarea height:

review the vertical spacing between:

- textarea
- unified calculation panel
- match panel
- word breakdown

Keep consistent, deliberate spacing.

Do NOT aggressively compress the page.

The goal is:

**cleaner and more intentional**, not cramped.

---

# RESPONSIVE

Verify all three changes on:

- desktop
- tablet
- mobile

On mobile:

- textarea should remain comfortable to type in;
- do not force the desktop 180–200px value if a more appropriate mobile minimum already exists;
- matching heading must wrap cleanly if necessary;
- no horizontal overflow.

---

# PRESERVE

Do NOT change:

- gematria calculation
- Hebrew numeral calculation
- ראשי תיבות
- גימטריית ר״ת
- save behavior
- match querying
- matching badges
- word breakdown
- automatic Hebrew keyboard
- Tanach
- Saved Library
- database
- APIs
- navigation
- overall palette
- fonts

This is a focused visual polish task.

---

# MANUAL ACCEPTANCE TEST

Verify:

1. Open מחשבון with no input.
2. Textarea is visible.
3. The redundant centered empty-state instructions are gone.
4. Empty page looks intentional.
5. Textarea is noticeably more compact than before.
6. Start typing a short Hebrew word.
7. Textarea remains compact.
8. Enter a longer phrase.
9. Textarea grows naturally.
10. Calculation panel still appears correctly.
11. Automatic Hebrew keyboard still works.
12. Produce a value with saved matches.
13. Match panel appears.
14. The current matching value/context is clearly explained.
15. Existing match-reason badges remain correct.
16. No matching logic changed.
17. Desktop spacing looks balanced.
18. Mobile remains readable with no horizontal overflow.

Do not perform unrelated refactors.