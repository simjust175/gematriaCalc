/**
 * server/tanachGematriaSearch.js
 *
 * Pure server-side Tanach gematria range engine.
 *
 * Given a verse's display text and a target gematria value, returns every
 * contiguous range of positive-value Hebrew letters whose sum equals the
 * target, using a true sliding-window scan over positive letter values.
 *
 * All indexes are letter indexes (0-based), never UTF-16 offsets.
 * Results are deterministic (ascending start then ascending end) and
 * deduplicated.
 *
 * Each match is classified as:
 *   • "whole_word"   — start and end are both within the same word AND
 *                      the range spans the entire word (first letter to last)
 *   • "whole_phrase" — start aligns to the first letter of a word AND
 *                      end aligns to the last letter of a word AND
 *                      the range spans more than one word
 *   • "partial"      — everything else (intra-word partials, cross-word
 *                      partials that don't land on word boundaries, etc.)
 */

import { createTanachCursor } from '../src/composables/useTanachCursor.js';

/**
 * Determine the word-boundary alignment classification of a letter range.
 *
 * @param {object[]} letters  - cursor.letters array
 * @param {number}   start    - inclusive start letter index
 * @param {number}   end      - inclusive end letter index
 * @returns {'whole_word'|'whole_phrase'|'partial'}
 */
export function classifyRange(letters, start, end) {
  if (!letters.length || !letters[start] || !letters[end] || start > end) return 'partial';

  const startWord = letters[start].wordIndex;
  const endWord = letters[end].wordIndex;
  const startsAtWordBoundary = start === 0 || letters[start - 1].wordIndex !== startWord;
  const endsAtWordBoundary = end === letters.length - 1 || letters[end + 1].wordIndex !== endWord;

  if (startsAtWordBoundary && endsAtWordBoundary) {
    return startWord === endWord ? 'whole_word' : 'whole_phrase';
  }
  return 'partial';
}

/**
 * Search a single verse for all contiguous letter ranges whose gematria
 * equals `target`.
 *
 * Uses a true O(n) sliding window over the prefix-sum array:
 *   - Advance `end` while the window sum is below target.
 *   - When the sum equals target, record the match and advance `start`.
 *   - When the sum exceeds target, advance `start`.
 * Zero-value letters (none in standard Hebrew, but defensive) are skipped
 * over by the window without contributing to the sum.
 *
 * @param {string} displayText  - Raw verse display text (may include niqqud/te'amim)
 * @param {number} target       - Target gematria value (positive integer)
 * @returns {Array<{
 *   start: number,
 *   end: number,
 *   text: string,
 *   gematria: number,
 *   classification: 'whole_word'|'whole_phrase'|'partial',
 *   letters: object[],
 * }>}
 */
export function findGematriaRanges(displayText, target) {
  if (!displayText || !Number.isSafeInteger(target) || target <= 0) return [];

  const cursor = createTanachCursor(displayText);
  const { letters, prefixes } = cursor;
  if (!letters.length || letters.some(letter => letter.value <= 0)) return [];

  const results = [];
  let left = 0;
  for (let right = 0; right < letters.length; right += 1) {
    while (left <= right && prefixes[right + 1] - prefixes[left] > target) {
      left += 1;
    }

    if (left <= right && prefixes[right + 1] - prefixes[left] === target) {
      const rangeResult = cursor.range(left, right);
      results.push({
        start: left,
        end: right,
        text: rangeResult.text,
        gematria: rangeResult.gematria,
        classification: classifyRange(letters, left, right),
        letters: rangeResult.letters,
      });

      // Every value is positive, so no second start can produce the same sum
      // for this right edge. Advancing left preserves overlapping windows.
      left += 1;
    }
  }

  return results;
}

/**
 * Convenience: search a single verse text and return only matches of a given
 * classification.
 *
 * @param {string} displayText
 * @param {number} target
 * @param {'whole_word'|'whole_phrase'|'partial'} classification
 * @returns {Array}
 */
export function findRangesByClassification(displayText, target, classification) {
  return findGematriaRanges(displayText, target).filter(
    r => r.classification === classification,
  );
}

/**
 * Convenience: search multiple verses and aggregate results with verse context.
 *
 * @param {Array<{displayText: string, verseRef: *}>} verses
 * @param {number} target
 * @returns {Array<{verseRef: *, matches: Array}>}
 */
export function searchVerses(verses, target) {
  const out = [];
  for (const { displayText, verseRef } of verses) {
    const matches = findGematriaRanges(displayText, target);
    if (matches.length) {
      out.push({ verseRef, matches });
    }
  }
  return out;
}
