# #13 — Add פרשיות התורה to the Tanach Dropdown

The Tanach reader and drag-selection functionality are now working.

Add the weekly Torah portions — **פרשיות התורה** — to the existing Tanach book/navigation dropdown.

Do NOT redesign the Tanach reader.

## Goal

The existing dropdown currently lets the user navigate by ספר.

Extend the same navigation control so the user can also choose any of the **54 standard Torah parshiot**.

Keep ספרים and פרשיות clearly separated.

---

# DROPDOWN STRUCTURE

The dropdown should conceptually contain two groups:

## ספרים

Existing Tanach book/navigation entries remain unchanged.

Then:

## פרשיות התורה

Include all 54 standard parshiot in canonical order.

For example:

בראשית  
נח  
לך לך  
וירא  
חיי שרה  
תולדות  
ויצא  
וישלח  
וישב  
מקץ  
ויגש  
ויחי

שמות  
וארא  
בא  
בשלח  
יתרו  
משפטים  
תרומה  
תצוה  
כי תשא  
ויקהל  
פקודי

ויקרא  
צו  
שמיני  
תזריע  
מצורע  
אחרי מות  
קדושים  
אמור  
בהר  
בחוקתי

במדבר  
נשא  
בהעלותך  
שלח  
קרח  
חקת  
בלק  
פינחס  
מטות  
מסעי

דברים  
ואתחנן  
עקב  
ראה  
שופטים  
כי תצא  
כי תבוא  
נצבים  
וילך  
האזינו  
וזאת הברכה

Use correct canonical Hebrew spelling consistently.

Do not hardcode arbitrary verse ranges without validating them from a reliable source.

---

# IMPORTANT — 54 INDIVIDUAL PARSHIOT

Store/browse the canonical 54 individual Torah portions.

Do NOT dynamically combine portions based on a particular Jewish calendar year.

For example:

מטות

and:

מסעי

remain individually searchable/navigation items even in years when they are read together.

Likewise for other commonly combined portions.

Calendar scheduling is OUT OF SCOPE.

---

# DATA MODEL

Add reliable parsha metadata.

Conceptually:

```js
{
  id,
  canonicalOrder,
  nameHe,

  startBook,
  startChapter,
  startVerse,

  endBook,
  endChapter,
  endVerse
}
```

Prefer normal foreign-key/reference IDs matching the existing Tanach schema rather than duplicate book strings if appropriate.

There are only 54 records, so a small static seeded metadata table/file is acceptable.

The actual Torah TEXT continues coming from the imported UXLC corpus.

Do NOT duplicate Torah verse text inside the parsha data.

---

# SOURCE ACCURACY

Use a reliable source for the canonical parsha boundaries.

Document where the start/end references came from.

Add tests for several known boundaries.

Do NOT ask AI to infer the divisions from the text.

---

# SELECTING A PARSHA

Example:

User selects:

**לך לך**

The Tanach reader should immediately navigate to the first verse of לך לך:

**בראשית י״ב:א**

Show a small contextual label in the reader such as:

**פרשת לך לך**

and the normal Tanach reference:

**בראשית י״ב:א**

The existing verse text, drag selection, gematria, matching, and saving continue to work normally.

---

# PARSHA RANGE AWARENESS

The application should know the complete start/end range of the selected parsha.

This matters because a parsha normally spans multiple chapters.

Do NOT assume a parsha is contained in one chapter.

When the user navigates through verses while in a selected parsha:

- previous/next should continue naturally through chapter boundaries;
- remain aware of the parsha range;
- indicate when the current verse is within that parsha.

At the final verse of the parsha, do not accidentally treat the next verse as part of the selected parsha.

The user can still navigate normally elsewhere afterward.

---

# NAVIGATOR BEHAVIOR

When a parsha is selected, the left-side navigator should remain useful.

Preferred behavior:

Show the verses around/currently relevant to the selected parsha and allow navigation through its range.

If implementing a full cross-chapter parsha verse list would require destabilizing the existing chapter navigator, it is acceptable for the first version to:

1. navigate to the first verse of the parsha;
2. display the current parsha label;
3. preserve the existing chapter-by-chapter verse list;
4. keep the selected parsha context while navigating through its range.

Do not rewrite the stable chapter navigator unnecessarily.

---

# SEARCH

The existing Tanach search should also recognize parsha names.

Examples:

`לך לך`

should offer:

**פרשת לך לך**

`נח`

should make both relevant navigation possibilities understandable if necessary.

For ambiguous names such as:

בראשית

distinguish clearly between:

**ספר בראשית**

and:

**פרשת בראשית**

Do not make the user guess which one is being selected.

---

# VISUAL DESIGN

Within the dropdown, visually separate:

**ספרים**

from:

**פרשיות התורה**

If the existing control supports native option groups cleanly, use appropriate grouped options.

Otherwise use the simplest accessible grouping compatible with the existing Vue/Vuetify component.

Do not build a complicated custom dropdown just for decoration.

The selected parsha should use the same warm/gold active-state language already used elsewhere.

---

# CURRENT REFERENCE

When viewing a verse reached through parsha navigation, show something similar to:

**פרשת לך לך**

`בראשית י״ב:א`

The parsha label is context.

The actual canonical book/chapter/verse reference remains the source of truth.

---

# SAVING

Do NOT change the existing Tanach save behavior.

However, when a range is saved while the reader currently knows its parsha context, it is acceptable/preferred to also persist:

`parshaId`

as nullable contextual metadata.

Then שמורים may later show:

**בראשית י״ב:א · פרשת לך לך**

Do not make this required for old or non-Torah saved entries.

---

# TESTS

Add tests verifying:

1. exactly 54 canonical parshiot exist;
2. canonical ordering is correct;
3. every parsha has a valid start reference;
4. every parsha has a valid end reference;
5. every referenced verse exists in the imported Tanach corpus;
6. selecting a parsha navigates to its first verse;
7. לך לך resolves to בראשית י״ב:א;
8. a parsha spanning chapters remains recognized across the chapter boundary;
9. search finds parsha names;
10. ambiguous ספר/parsha names are clearly distinguished;
11. current calculator/Tanach drag-selection behavior remains unchanged;
12. existing tests continue to pass.

Do not report complete unless all 54 parsha boundaries resolve against the imported UXLC corpus.