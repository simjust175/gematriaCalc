import { computeAll, normalize } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { getParshahForReference } from './tanachParshiot.js';

function saveError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function verifyTanachSaveContext(originalText, tanachContext, db) {
  const calculatedInput = computeAll(typeof originalText === 'string' ? originalText : '');
  if (!calculatedInput) throw saveError('MISSING_FIELDS', 'Missing save fields');
  if (tanachContext == null) {
    return {
      originalText,
      calculated: calculatedInput,
      context: null,
    };
  }

  const bookSlug = typeof tanachContext.bookSlug === 'string' ? tanachContext.bookSlug : '';
  const chapter = Number(tanachContext.chapter);
  const verse = Number(tanachContext.verse);
  const start = Number(tanachContext.start);
  const end = Number(tanachContext.end);
  if (!bookSlug || !Number.isInteger(chapter) || !Number.isInteger(verse)
      || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw saveError('INVALID_TANACH_CONTEXT', 'Invalid Tanach context');
  }

  const verseResult = await db.query(
    `SELECT v.display_text, b.hebrew_name
     FROM tanach_verses v JOIN tanach_books b ON b.slug = v.book_slug
     WHERE v.book_slug = $1 AND v.chapter = $2 AND v.verse = $3`,
    [bookSlug, chapter, verse]
  );
  if (!verseResult.rowCount) throw saveError('INVALID_TANACH_CONTEXT', 'Invalid Tanach context');

  const cursor = createTanachCursor(verseResult.rows[0].display_text);
  const canonicalRange = cursor.range(start, end);
  if (end >= cursor.count || normalize(canonicalRange.text) !== calculatedInput.normalizedText) {
    throw saveError('TANACH_RANGE_MISMATCH', 'Tanach range does not match text');
  }

  const parshaId = typeof tanachContext.parshaId === 'string' ? tanachContext.parshaId : null;
  let parsha = null;
  if (parshaId) {
    const canonicalPortion = getParshahForReference({ bookSlug, chapter, verse });
    if (canonicalPortion?.id !== parshaId) throw saveError('INVALID_TANACH_CONTEXT', 'Invalid Tanach context');
    // Retain the existing database identity/FK while validating against the
    // imported corpus's canonical numbering, not an older stored boundary.
    const parshaResult = await db.query(
      `SELECT p.id, p.name_he
       FROM tanach_parshiot p
       WHERE p.id = $1`,
      [parshaId]
    );
    if (!parshaResult.rowCount) throw saveError('INVALID_TANACH_CONTEXT', 'Invalid Tanach context');
    parsha = { id: canonicalPortion.id, name: canonicalPortion.nameHe };
  }

  return {
    originalText: canonicalRange.text,
    calculated: computeAll(canonicalRange.text),
    context: {
      bookSlug,
      bookLabel: verseResult.rows[0].hebrew_name,
      chapter,
      verse,
      start,
      end,
      parshaId: parsha?.id || null,
      parshaName: parsha?.name || null,
    },
  };
}
