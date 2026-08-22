The automatic Hebrew keyboard feature is currently NOT functioning.

I manually tested it with:

**מקלדת עברית אוטומטית enabled**

and typed:

`jgkgk`

The textarea displayed the literal Latin characters:

`jgkgk`

This is incorrect.

With standard Israeli Hebrew physical keyboard mapping, those physical keys should produce Hebrew letters.

For example:

- `KeyJ` → ח
- `KeyG` → ע
- `KeyK` → ל

Therefore:

`jgkgk`

should produce:

**חעלעל**

## Fix the actual input handling

Do not make a visual-only change.

Inspect the current keyboard mapper and determine why Latin characters are still reaching the textarea while automatic Hebrew mode is enabled.

The calculator textarea must intercept eligible physical keyboard keystrokes BEFORE the browser inserts the Latin character.

Use `KeyboardEvent.code` for physical key mapping.

When auto-Hebrew mode is ON and the pressed physical key has a Hebrew mapping:

1. prevent the browser's default Latin insertion;
2. determine the Hebrew character from `event.code`;
3. insert that Hebrew character at the current caret position;
4. replace currently selected text if applicable;
5. restore the caret correctly;
6. update the Vue model through the normal application flow;
7. trigger existing live gematria calculation normally.

Do not append characters blindly to the end.

## Important

If the browser is already producing an actual Hebrew letter because the OS keyboard is set to Hebrew:

leave it unchanged.

Do not double-convert it.

Do not intercept:

- Ctrl/Cmd+A
- Ctrl/Cmd+C
- Ctrl/Cmd+V
- Ctrl/Cmd+X
- Ctrl/Cmd+Z
- navigation keys
- Backspace
- Delete
- Tab

Pasted content must remain literal.

## Verify toggle state

Also verify that the visible:

מקלדת עברית אוטומטית

switch is actually connected to the state controlling the keyboard mapper.

There must not be a situation where the UI displays ON while the keyboard handler behaves as OFF.

## Manual acceptance test

With the operating system keyboard set to ENGLISH:

1. Open מחשבון.
2. Turn מקלדת עברית אוטומטית ON.
3. Type physical `J`.
4. Input must show `ח`, NOT `j`.
5. Type physical `G`.
6. Input must now show `חע`.
7. Type physical `K`.
8. Input must now show `חעל`.
9. Type `jgkgk`.
10. Result must be `חעלעל`, not `jgkgk`.
11. Gematria must update after every Hebrew character.
12. Put caret in the middle and type another mapped key; insertion must occur at the caret.
13. Select text and type a mapped key; selection must be replaced.
14. Turn automatic Hebrew OFF.
15. Typing `jgkgk` should now remain literal English.
16. Turn it ON again.
17. Mapping must resume.
18. Switch the OS keyboard itself to Hebrew.
19. Hebrew typing must continue normally without duplicate characters.

Do not report this fixed until the browser has been manually tested with the OS keyboard actually set to English.