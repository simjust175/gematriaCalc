# #14 — Automatic Hebrew Keyboard Mapping in Calculator

## What & Why

Improve the main מחשבון input so the user can type Hebrew without manually switching the operating-system keyboard language.

When the automatic Hebrew keyboard mode is enabled, pressing Latin/English letter keys should insert the Hebrew letter located on the equivalent physical key of the standard Israeli Hebrew keyboard layout.

This is **keyboard-layout conversion**, NOT phonetic transliteration.

Example concept:

If the physical key normally corresponds to א on a standard Israeli Hebrew keyboard, pressing that key while the computer is currently set to English should still insert:

א

Do NOT implement:

`shalom` → `שלום`

That is phonetic transliteration and is out of scope.

---

# PRIMARY BEHAVIOR

Add automatic Hebrew keyboard handling to the MAIN GEMATRIA CALCULATOR TEXT INPUT.

Default:

**enabled**

When enabled:

- Hebrew typing continues working normally.
- English/Latin alphabet keypresses are converted to the Hebrew character on the equivalent standard Israeli Hebrew keyboard key.
- spaces remain spaces.
- numbers remain numbers.
- Backspace works normally.
- Delete works normally.
- Enter/newline works normally where supported.
- arrow keys work normally.
- Home/End work normally.
- Ctrl/Cmd shortcuts continue working.
- pasted text is NOT keyboard-remapped.
- existing ניקוד/טעמים pasted into the input remain untouched.
- existing live gematria calculation remains immediate.

The user should not need to switch Windows/macOS keyboard language simply to use the calculator.

---

# IMPORTANT — USE PHYSICAL KEY POSITION

Do NOT implement this by blindly mapping the character produced by `event.key` if that makes behavior depend on the currently active OS keyboard layout.

Use the appropriate physical keyboard identifier, preferably:

`KeyboardEvent.code`

for Latin letter/punctuation positions where supported.

The goal is:

**same physical key → same Hebrew letter**

regardless of whether the operating system currently thinks the keyboard is English.

Verify the complete standard Israeli Hebrew keyboard layout rather than guessing individual mappings.

Create one explicit reusable mapping table.

Do NOT scatter keyboard conversion logic throughout components.

---

# STANDARD ISRAELI HEBREW LAYOUT

Implement the standard Israeli Hebrew keyboard layout.

The mapping must include all normal Hebrew letters and the relevant punctuation keys used for Hebrew typing.

Final letters must occur naturally according to the actual keyboard layout.

Do not invent a phonetic mapping.

Examples/tests should be based on the real Israeli Hebrew keyboard positions.

---

# WHEN THE OS KEYBOARD IS ALREADY HEBREW

If the browser already receives an actual Hebrew character from the keypress:

leave that Hebrew character alone.

Do NOT convert Hebrew input a second time.

The feature exists primarily for when the user accidentally/currently has the OS keyboard set to English.

---

# TOGGLE

Add a small unobtrusive toggle/setting near the calculator input.

Hebrew label:

**מקלדת עברית אוטומטית**

Default:

ON

The control should not compete visually with the calculator.

A compact switch or small status control is appropriate.

When ON, optionally show a subtle indicator such as:

**עברית אוטומטית**

When OFF:

the input behaves like a normal text field and whatever the operating system sends is entered unchanged.

Remember the user's preference locally if appropriate using the existing UI-preference approach.

This setting does NOT need server/database persistence unless the current app already persists UI preferences that way.

---

# SCOPE

Apply automatic keyboard conversion to:

**the main מחשבון text-entry field**

Do NOT globally intercept keyboard input across the entire application.

Do NOT automatically apply it to:

- Tanach search
- Saved Library search
- book/chapter reference fields
- passwords
- navigation controls
- other unrelated inputs

Those fields may legitimately need numbers, English, or other characters.

Keep this feature scoped to calculator text entry.

If there are other explicit freeform Gematria-entry fields using the same calculator component, reuse the behavior appropriately rather than duplicating it.

---

# TEXTAREA BEHAVIOR

The current textarea/input already supports:

- live calculation
- cursor placement
- selection
- editing existing text
- RTL

All of that must continue to work.

When inserting a mapped Hebrew character:

insert it at the CURRENT CARET POSITION.

Do NOT automatically append to the end of the text.

If text is currently selected:

typing a Hebrew-mapped key should replace the selected text exactly as normal typing would.

Preserve caret position after insertion.

Example:

Existing:

שלום עולם

Caret placed between words.

Typing another mapped key should insert Hebrew at that caret location.

---

# INPUT EVENTS

Implement this carefully so it does not create:

- double characters
- broken Vue `v-model` state
- stale calculations
- caret jumps
- duplicate `input` events

The resulting value should flow through the existing calculator state normally so the existing live calculation updates once with the correct new text.

---

# SHORTCUTS

Do NOT intercept common browser/editor shortcuts.

If Ctrl or Cmd is held for common actions, preserve normal behavior.

Examples:

- Ctrl/Cmd + A
- Ctrl/Cmd + C
- Ctrl/Cmd + V
- Ctrl/Cmd + X
- Ctrl/Cmd + Z
- Ctrl/Cmd + Y / Shift+Cmd+Z

Pasting must paste the supplied text literally.

Do NOT convert pasted Latin text using the keyboard mapping.

---

# SHIFT / CAPS LOCK

Handle Shift/Caps Lock appropriately.

The Hebrew letter result should still correspond to the intended Hebrew keyboard key.

Do not create uppercase/lowercase Hebrew distinctions because Hebrew has none.

If Shift combinations on the standard Israeli layout intentionally produce punctuation/symbols rather than letters, preserve the correct layout behavior where relevant.

Test these cases rather than assuming Shift can always simply be ignored.

---

# COMPOSITION / IME SAFETY

Do not break browser text composition.

If the browser reports an active composition/IME sequence:

do not interfere incorrectly with that sequence.

Avoid converting keys during composition if doing so would corrupt user input.

---

# MOBILE / VIRTUAL KEYBOARDS

The main purpose of this feature is PHYSICAL desktop/laptop keyboard convenience.

Do not force physical-key mapping behavior onto mobile virtual keyboards where `KeyboardEvent.code` behavior may differ or be unreliable.

On mobile/tablet:

normal Hebrew keyboard input should continue to work.

If the reliable physical-key mapping is unavailable, gracefully fall back to ordinary input rather than producing incorrect characters.

---

# VISUAL UX

Keep the existing calculator design.

This is NOT a calculator redesign.

The only new visual element should be the subtle:

**מקלדת עברית אוטומטית**

control/status.

Do not add a large settings panel.

Do not add explanatory paragraphs that consume space.

A tooltip/helper line may briefly explain:

`מאפשר להקליד עברית גם כשהמקלדת במצב אנגלית`

if useful.

---

# TESTS

Add unit/component tests for the keyboard mapping.

Verify:

1. automatic Hebrew mode defaults ON
2. a representative set of physical Latin keys produces the correct Israeli Hebrew letters
3. preferably test the complete letter mapping table
4. actual Hebrew key input remains unchanged
5. space remains space
6. numbers remain unchanged
7. Backspace works
8. Delete works
9. arrow keys work
10. Enter works as before
11. mapped character inserts at current caret
12. mapped character replaces selected text correctly
13. Ctrl/Cmd+A is not intercepted
14. Ctrl/Cmd+C is not intercepted
15. Ctrl/Cmd+V pastes literally
16. undo/redo remains usable
17. disabling automatic Hebrew restores normal browser input
18. pasted Latin text is not transliterated/remapped
19. calculator updates gematria immediately after mapped Hebrew insertion
20. existing calculator tests remain passing

---

# MANUAL ACCEPTANCE TEST

Use a real physical English keyboard layout in the browser.

1. Set the computer/browser keyboard language to English.
2. Open מחשבון.
3. Confirm מקלדת עברית אוטומטית is enabled.
4. Press physical keys corresponding to known Hebrew keyboard positions.
5. Hebrew letters appear instead of Latin letters.
6. Enter several Hebrew words using only the English keyboard mode.
7. Gematria updates after every inserted Hebrew letter.
8. Add a space.
9. Space appears and does not affect gematria.
10. Move caret into the middle of the phrase.
11. Type another mapped key.
12. Hebrew character inserts exactly at caret.
13. Select part of text.
14. Type a mapped key.
15. Selection is replaced correctly.
16. Use Backspace.
17. Works normally.
18. Use Ctrl/Cmd+A, C, V and Z.
19. Shortcuts work normally.
20. Paste English text.
21. It pastes literally rather than being converted.
22. Switch automatic Hebrew OFF.
23. English keyboard now types English normally.
24. Switch it back ON.
25. Hebrew physical-key mapping resumes.
26. Change OS keyboard to Hebrew.
27. Normal Hebrew typing still works without duplicated/convoluted conversion.
28. Existing calculator calculations remain correct.

Do not report complete unless the physical-key behavior has been manually verified in the browser with the OS keyboard actually set to English.

---

# PRESERVE

Do NOT change:

- gematria calculation rules
- ראשי תיבות logic
- saved matching
- database
- Tanach
- saved library
- existing calculator layout beyond the small toggle
- RTL behavior
- current textarea auto-grow behavior

This is a focused typing-experience enhancement.