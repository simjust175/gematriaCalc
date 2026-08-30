# FEATURE — כפולות / EXACT GEMATRIA MULTIPLE RELATIONSHIPS

Add a new optional advanced discovery feature to the EXISTING Gematria application.

The feature is based on the concept that one gematria value can fit an exact number of times into another.

Example:

26 × 13 = 338

Therefore:

26 נכנס י״ג פעמים ב־338

The feature should automatically discover these exact numerical relationships between the CURRENT gematria and values already present in the user's saved library.

---

# CORE PRODUCT PRINCIPLE

This must feel like:

**a beautiful discovery of numerical relationships**

NOT:

- a calculator worksheet
- a multiplication table
- a wall of numbers
- a permanent extra result card
- a technical database search

Keep the main calculator clean.

Like מילוי, this feature should be **ON DEMAND**.

Preferred name:

**כפולות**

---

# CRITICAL — PRESERVE THE EXISTING APP

Do NOT change:

- standard gematria
- ראשי תיבות
- גימטריית ראשי תיבות
- מילוי calculations
- saved-entry behavior
- Tanach
- existing live matching
- existing database records
- current design language

This feature is additive.

The client is actively using the production system.

Existing production data must remain untouched.

---

# 1. ON-DEMAND DISCLOSURE

Add a tasteful expandable section:

**כפולות**

Use the same general product philosophy as the existing מילוי disclosure.

It should be:

- closed by default
- never open automatically
- opened explicitly by the user
- compact when closed
- beautifully integrated into the current calculator
- updated live while open as the current input changes

Do NOT create a giant permanent fourth/fifth result block.

---

# PLACEMENT

Place it naturally in the advanced-calculation area.

Preferred order:

Primary calculations

then optional advanced tools:

**מילוי**

**כפולות**

then existing detailed breakdown / lower content.

Keep both advanced tools visually subordinate to the three main calculations.

---

# 2. EXACT MATHEMATICAL RULE

A relationship exists only when the larger positive value is exactly divisible by the smaller positive value.

Conceptually:

```js
larger % smaller === 0
```

Then:

```js
multiplier = larger / smaller
```

Only show exact whole-number relationships.

Do NOT show:

- decimals
- approximate relationships
- percentages
- "almost" matches

---

# EXCLUDE TRIVIAL MATCHES

Do not show:

×1

because every equal number would otherwise appear as a multiplication relationship when it is already covered by normal matching.

Also avoid meaningless zero calculations.

Values must be positive.

If a source value is 1, suppress it by default because every integer is divisible by 1 and it creates noise.

---

# 3. SEARCH IN BOTH DIRECTIONS

This is important.

The current value may be the LARGER value or the SMALLER value.

## A. SAVED VALUE FITS INTO CURRENT VALUE

Example:

Current full gematria:

338

Saved value:

26

Relationship:

26 × 13 = 338

Display under a concept such as:

**נכנס בערך הנוכחי**

or use an even cleaner card-level presentation if section headings are unnecessary.

---

## B. CURRENT VALUE FITS INTO SAVED VALUE

Example:

Current full gematria:

338

Saved value:

676

Relationship:

338 × 2 = 676

Display clearly that:

**הערך הנוכחי נכנס בו פעמיים**

Do not make the user mentally determine the direction.

---

# 4. VALUES TO SEARCH

Use the CURRENT LIVE FULL GEMATRIA as the current number.

Compare it against numeric values already associated with the user's SAVED material.

For the first version search:

### A. Saved full gematria
Source label:

**גימטריה מלאה**

### B. Individual word / תיבה gematria inside a saved phrase
Source label:

**תיבה**

or:

**התאמה בתיבה**

### C. Saved ראשי תיבות gematria
Source label:

**גימטריית ר״ת**

### D. Saved full מילוי gematria
Source label:

**גימטריית מילוי**

Do NOT use textual ראשי תיבות itself as a numerical source unless using its existing gematria field.

---

# 5. DO NOT SEARCH TANACH AUTOMATICALLY YET

For this first version, search the user's saved personal library only.

Do NOT automatically run exact-multiple discovery across the entire Tanach corpus.

That could generate excessive noise and hurt performance.

A future optional:

**חפש גם בתנ״ך**

can be considered separately if the client asks for it.

Out of scope now.

---

# 6. BEAUTIFUL RESULT DESIGN

The results should be extremely easy to understand.

Each result should answer three questions instantly:

1. WHAT saved item is involved?
2. WHICH value from that saved item created the relationship?
3. WHAT is the exact multiplication?

Example:

**שם הוי״ה**

`גימטריה מלאה`

**26 × 13 = 338**

**פי י״ג**

---

# VISUAL HIERARCHY

For every result card:

### Strongest:
Saved phrase / word name

### Then:
small source badge such as:

גימטריה מלאה  
תיבה  
גימטריית ר״ת  
גימטריית מילוי

### Main relationship:
**26 × 13 = 338**

### Elegant traditional representation:
**פי י״ג**

Do not repeat the same information in several verbose sentences.

---

# 7. HEBREW MULTIPLIER DISPLAY

Use the existing shared Hebrew-number converter.

Example:

13 → יג

Display elegantly.

Possible presentation:

**26 × 13 = 338**

small secondary text:

**פי י״ג**

Do NOT build another Hebrew-number converter.

Use the existing corrected one.

---

# 8. WORD-WITHIN-PHRASE RELATIONSHIP

If the relationship comes from one word inside a saved phrase, make that immediately clear.

Example:

Saved phrase:

קולי שמע וראה דמע

Matching numeric source:

קולי = 146

Current value:

584

Relationship:

146 × 4 = 584

Display:

**קולי שמע וראה דמע**

badge:

**תיבה**

highlight the exact source word:

**קולי**

Then:

**146 × 4 = 584**

**פי ד׳**

Reuse the same restrained pale-gold word highlight already used for saved word matches / Tanach matches.

---

# 9. מילוי RELATIONSHIP

If the relationship is generated by the saved entry's current מילוי value:

show:

**גימטריית מילוי**

and the exact value used.

Example:

Saved phrase:

שלום

Current מילוי value:

169

Current live gematria:

338

Display:

שלום

`גימטריית מילוי`

**169 × 2 = 338**

**פי ב׳**

Do not make it appear as though שלום's normal gematria is 169.

The source type must always be clear.

---

# 10. ראשי תיבות RELATIONSHIP

Same rule.

Example:

Saved phrase has:

גימטריית ר״ת = 310

Current value:

930

Display:

[saved phrase]

`גימטריית ר״ת`

**310 × 3 = 930**

**פי ג׳**

Again, never misrepresent 310 as the phrase's full gematria.

---

# 11. GROUP THE TWO DIRECTIONS BEAUTIFULLY

When useful, organize results into two subtle groups:

### נכנס בערך הנוכחי

Saved values that multiply to produce the current number.

Example:

26 × 13 = 338

### הערך הנוכחי נכנס ב־

Saved values that are exact multiples of the current number.

Example:

338 × 2 = 676

Do NOT create huge section headers.

Use quiet labels/dividers.

If one group has no results, do not waste excessive space on it.

---

# 12. RESULT DEDUPLICATION

A saved entry must NOT appear as several duplicate cards merely because multiple values inside it create relationships.

One saved entry = one result card where practical.

If the same saved entry has several valid relationships, show them neatly inside that single card.

Example:

**שמע ישראל**

`גימטריית ר״ת`

310 × 3 = 930

`גימטריית מילוי`

465 × 2 = 930

Do not create two separate identical שמע ישראל cards.

---

# 13. MULTIPLE WORD RELATIONSHIPS

If two different words inside the same saved phrase create exact-multiple relationships:

show the saved phrase once.

Highlight / list the relevant words cleanly.

Do not duplicate the entire phrase.

---

# 14. RANKING

Do not dump hundreds of relationships randomly.

Rank meaningful results first.

Suggested ranking logic:

1. smaller multiplier first
2. full-gematria sources before more secondary source types where multipliers are equal
3. existing saved order/date may be used as a secondary tiebreaker

For example:

×2 should generally appear before ×37.

This makes the most striking relationships easier to notice.

---

# 15. RESULT LIMIT / SHOW MORE

Initially show a sensible number, approximately:

6–8 results

per direction/group.

If more exist:

**הצג עוד**

All exact relationships must remain accessible.

Do not silently discard valid results.

---

# 16. EMPTY STATE

If no exact multiple relationships exist:

show a clean, quiet message.

Suggested:

**לא נמצאו כפולות מדויקות בערך הנוכחי**

Do not show an error.

Do not make the empty state visually heavy.

---

# 17. OPTIONAL SMALL SUMMARY

At the top of the open כפולות section, if elegant, show:

**338**

and a small line such as:

**קשרים מספריים מדויקים שנמצאו בערך זה**

or more traditional/simple wording consistent with the app.

Do not make it sound academic.

Do not add unnecessary explanatory paragraphs.

---

# 18. DO NOT CALCULATE AGAINST EVERY NUMBER CLIENT-SIDE

Inspect the existing matching architecture.

The user now has:

- saved entries
- saved words
- ראשי תיבות values
- derived מילוי index

Implement the exact-multiple search efficiently.

Because the saved library is currently modest, server-side calculation may be simple.

However, structure it so the browser is not forced to download the entire production database on every keystroke.

Prefer a dedicated endpoint/service that receives the current value and returns exact relationships.

---

# 19. PERFORMANCE

כפולות is on-demand.

When CLOSED:

do not make unnecessary כפולות server requests.

When OPEN:

- debounce changes using the existing live-query pattern
- avoid duplicate requests
- ignore/cancel stale responses
- never allow an older current value's results to overwrite a newer one

Normal local gematria calculation must remain instantaneous.

---

# 20. PRODUCTION DATA SAFETY

The client is ACTIVELY using this system.

This feature should ideally require NO destructive changes to canonical saved data.

Do NOT:

- delete saved entries
- rewrite saved entries
- delete saved words
- modify standard gematria values
- reset database
- reseed
- truncate
- drop existing tables

Prefer querying existing canonical/derived values.

If a new database structure becomes necessary:

- additive only
- report why
- verify production backup/recovery point first
- verify row counts before and after
- existing records deleted = 0
- existing records modified = 0

Do NOT add a migration merely because it is convenient if the feature can safely use existing data.

---

# 21. DO NOT SAVE כפולות RELATIONSHIPS

For this first version, discovered multiplication relationships are dynamic.

Do NOT permanently save:

"26 × 13 = 338"

as another database record automatically.

The underlying saved phrases/numbers are already stored.

The relationship should be calculated from them.

If the client later wants to bookmark specific discoveries, that can become a separate feature.

---

# 22. TESTS — CORE MATH

Test exact relationship logic:

26 and 338:

26 × 13 = 338

338 and 26:

same relationship correctly expressed in the opposite search direction.

Test:

- ×2
- ×3
- ×13
- non-divisible values
- ×1 excluded
- 0 excluded
- value 1 suppressed
- large valid multiplier handled safely

---

# 23. TESTS — SOURCE TYPES

Test relationships generated from:

1. saved full gematria
2. individual saved word
3. saved ראשי תיבות gematria
4. saved מילוי gematria

Verify each uses the correct Hebrew source label.

---

# 24. TESTS — DEDUPLICATION

Test:

- one entry with two valid relationships
- one entry with several matching words
- one entry matching through full gematria + מילוי
- one entry matching in both possible source fields

Ensure it appears once with all appropriate relationship details.

---

# 25. TESTS — LIVE UX

Verify:

1. כפולות closed by default
2. no requests while closed
3. click opens
4. current results load
5. typing changes current gematria
6. relationships update
7. stale results disappear
8. closing stops unnecessary lookup
9. reopening uses current input
10. mobile has no overflow

---

# 26. RESPONSIVE DESIGN

Desktop:

Use elegant cards/rows within the existing result width.

Mobile:

- stack equation/details naturally
- keep multiplication readable
- do not force wide mathematical tables
- no horizontal page scrolling

The expression:

26 × 13 = 338

must remain readable even on small screens.

---

# 27. VISUAL LANGUAGE

Match the existing application:

- cream/off-white
- navy typography
- restrained gold
- soft borders
- subtle shadows
- RTL-first
- traditional/premium character

Do NOT introduce:

- bright mathematical colors
- charts
- graphs
- neon
- dashboards
- large animated counters
- excessive icons

This should feel like part of the SAME Gematria tool.

---

# FINAL ACCEPTANCE EXAMPLE

Suppose:

Current full gematria = 338

Saved item A has:

full gematria = 26

Saved item B has:

גימטריית מילוי = 169

Saved item C has:

full gematria = 676

Opening כפולות should elegantly reveal:

### נכנס בערך הנוכחי

Saved A

`גימטריה מלאה`

**26 × 13 = 338**

**פי י״ג**

Saved B

`גימטריית מילוי`

**169 × 2 = 338**

**פי ב׳**

### הערך הנוכחי נכנס ב־

Saved C

`גימטריה מלאה`

**338 × 2 = 676**

**פי ב׳**

The user should understand every relationship instantly without needing instructions.

---

# OUT OF SCOPE

Do NOT add:

- approximate ratios
- fractions
- Tanach-wide multiple discovery
- saved כפולות bookmarks
- charts
- AI interpretation
- new account logic
- מילוי-only multiples
- arbitrary mathematical operations

Start with exact, meaningful integer multiplication relationships in the personal saved library.

---

# REQUIRED REPORT

After implementation report:

1. files changed
2. whether any database schema change was required
3. exact source values searched
4. deduplication strategy
5. sort/ranking strategy
6. live-query/debounce behavior
7. exact tests run
8. full existing test-suite result
9. confirmation that existing production saved records were not modified/deleted
10. any remaining limitations

Do not perform unrelated refactors.