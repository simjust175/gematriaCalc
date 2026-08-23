The previous textarea-height change went in the WRONG direction.

The calculator textarea is now noticeably larger than before.

We want it substantially SMALLER and more compact.

## Desktop target

For:

- empty input
- one word
- one normal short phrase

the textarea should start at approximately:

**105–120px high**

NOT 180–200px.

Choose the exact value that looks best within the existing design.

The screenshot currently has a large amount of unnecessary empty vertical space inside the textarea. Remove that.

---

# AUTO-GROW

Keep auto-growing behavior.

The textarea should:

- start compact at approximately 105–120px;
- remain that size for short input;
- grow only when the Hebrew text actually requires another line;
- continue growing naturally for longer phrases/pesukim;
- have a sensible maximum height around 260–300px;
- only then use an internal vertical scrollbar if necessary.

Do NOT reserve space in advance for several lines.

---

# IMPORTANT

The automatic-Hebrew-keyboard toggle currently sits inside the textarea area.

Keep it positioned neatly near the lower edge without forcing the textarea to become taller.

Its presence must NOT determine the textarea's minimum height.

The textarea should remain compact even with:

מקלדת עברית אוטומטית

visible.

---

# TYPOGRAPHY

Preserve the current large Hebrew input font.

Do NOT make the text smaller merely to reduce the textarea height.

The goal is:

**large readable Hebrew inside a compact auto-growing input.**

---

# EMPTY STATE

When empty, the calculator should now look approximately like:

[ compact textarea ~105–120px ]

then normal spacing.

No redundant instructional text underneath.

There should NOT be a giant empty input box dominating the screen.

---

# PRESERVE

Do not change:

- automatic Hebrew keyboard behavior
- textarea RTL
- live gematria calculation
- caret behavior
- paste behavior
- calculation result panel
- matching
- Save
- word breakdown
- Tanach
- Saved Library

This is ONLY a textarea sizing correction.

## Acceptance

At desktop width:

1. Open calculator empty.
2. Textarea is approximately 105–120px tall.
3. It no longer dominates the page.
4. Type one word — height stays compact.
5. Type one normal phrase — height stays compact if it fits.
6. Continue typing a long pasuk — textarea grows only as needed.
7. Automatic Hebrew keyboard toggle remains neatly positioned.
8. No horizontal scrollbar.
9. No unnecessary internal vertical scrollbar for ordinary text.