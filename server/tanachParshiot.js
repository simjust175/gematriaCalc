/**
 * Standard annual-cycle Torah portions.
 * Boundaries: Snunit, "סדר הקריאות בבתי הכנסת",
 * https://kodesh.snunit.k12.il/i/tm/viewByParasha.html (accessed 2026-08-22).
 *
 * References are inclusive and use the chapter/verse numbering of the imported
 * Unicode/XML Leningrad Codex. This is metadata only; all biblical text remains
 * in tanach_verses.
 */
const range = (id, canonicalOrder, nameHe, bookSlug, startChapter, startVerse, endChapter, endVerse) => ({
  id,
  canonicalOrder,
  nameHe,
  start: { bookSlug, chapter: startChapter, verse: startVerse },
  end: { bookSlug, chapter: endChapter, verse: endVerse },
});

export const PARSHAH_BOUNDARY_SOURCE = {
  title: 'סדר הקריאות בבתי הכנסת',
  publisher: 'סנונית — מאגר ספרות הקודש',
  url: 'https://kodesh.snunit.k12.il/i/tm/viewByParasha.html',
  accessedAt: '2026-08-22',
};

export const TANACH_PARSHIOT = [
  range('bereshit', 1, 'בראשית', 'Genesis', 1, 1, 6, 8),
  range('noach', 2, 'נח', 'Genesis', 6, 9, 11, 32),
  range('lech-lecha', 3, 'לך לך', 'Genesis', 12, 1, 17, 27),
  range('vayera', 4, 'וירא', 'Genesis', 18, 1, 22, 24),
  range('chayei-sarah', 5, 'חיי שרה', 'Genesis', 23, 1, 25, 18),
  range('toldot', 6, 'תולדות', 'Genesis', 25, 19, 28, 9),
  range('vayetze', 7, 'ויצא', 'Genesis', 28, 10, 32, 3),
  range('vayishlach', 8, 'וישלח', 'Genesis', 32, 4, 36, 43),
  range('vayeshev', 9, 'וישב', 'Genesis', 37, 1, 40, 23),
  range('miketz', 10, 'מקץ', 'Genesis', 41, 1, 44, 17),
  range('vayigash', 11, 'ויגש', 'Genesis', 44, 18, 47, 27),
  range('vayechi', 12, 'ויחי', 'Genesis', 47, 28, 50, 26),
  range('shemot', 13, 'שמות', 'Exodus', 1, 1, 6, 1),
  range('vaera', 14, 'וארא', 'Exodus', 6, 2, 9, 35),
  range('bo', 15, 'בא', 'Exodus', 10, 1, 13, 16),
  range('beshalach', 16, 'בשלח', 'Exodus', 13, 17, 17, 16),
  range('yitro', 17, 'יתרו', 'Exodus', 18, 1, 20, 23),
  range('mishpatim', 18, 'משפטים', 'Exodus', 21, 1, 24, 18),
  range('terumah', 19, 'תרומה', 'Exodus', 25, 1, 27, 19),
  range('tetzaveh', 20, 'תצוה', 'Exodus', 27, 20, 30, 10),
  range('ki-tisa', 21, 'כי תשא', 'Exodus', 30, 11, 34, 35),
  range('vayakhel', 22, 'ויקהל', 'Exodus', 35, 1, 38, 20),
  range('pekudei', 23, 'פקודי', 'Exodus', 38, 21, 40, 38),
  range('vayikra', 24, 'ויקרא', 'Leviticus', 1, 1, 5, 26),
  range('tzav', 25, 'צו', 'Leviticus', 6, 1, 8, 36),
  range('shemini', 26, 'שמיני', 'Leviticus', 9, 1, 11, 47),
  range('tazria', 27, 'תזריע', 'Leviticus', 12, 1, 13, 59),
  range('metzora', 28, 'מצורע', 'Leviticus', 14, 1, 15, 33),
  range('acharei-mot', 29, 'אחרי מות', 'Leviticus', 16, 1, 18, 30),
  range('kedoshim', 30, 'קדושים', 'Leviticus', 19, 1, 20, 27),
  range('emor', 31, 'אמור', 'Leviticus', 21, 1, 24, 23),
  range('behar', 32, 'בהר', 'Leviticus', 25, 1, 26, 2),
  range('bechukotai', 33, 'בחוקתי', 'Leviticus', 26, 3, 27, 34),
  range('bamidbar', 34, 'במדבר', 'Numbers', 1, 1, 4, 20),
  range('naso', 35, 'נשא', 'Numbers', 4, 21, 7, 89),
  range('behaalotecha', 36, 'בהעלותך', 'Numbers', 8, 1, 12, 16),
  range('shelach', 37, 'שלח', 'Numbers', 13, 1, 15, 41),
  range('korach', 38, 'קרח', 'Numbers', 16, 1, 18, 32),
  range('chukat', 39, 'חקת', 'Numbers', 19, 1, 22, 1),
  range('balak', 40, 'בלק', 'Numbers', 22, 2, 25, 9),
  range('pinchas', 41, 'פינחס', 'Numbers', 25, 10, 30, 1),
  range('matot', 42, 'מטות', 'Numbers', 30, 2, 32, 42),
  range('masei', 43, 'מסעי', 'Numbers', 33, 1, 36, 13),
  range('devarim', 44, 'דברים', 'Deuteronomy', 1, 1, 3, 22),
  range('vaetchanan', 45, 'ואתחנן', 'Deuteronomy', 3, 23, 7, 11),
  range('ekev', 46, 'עקב', 'Deuteronomy', 7, 12, 11, 25),
  range('reeh', 47, 'ראה', 'Deuteronomy', 11, 26, 16, 17),
  range('shoftim', 48, 'שופטים', 'Deuteronomy', 16, 18, 21, 9),
  range('ki-tetze', 49, 'כי תצא', 'Deuteronomy', 21, 10, 25, 19),
  range('ki-tavo', 50, 'כי תבוא', 'Deuteronomy', 26, 1, 29, 8),
  range('nitzavim', 51, 'נצבים', 'Deuteronomy', 29, 9, 30, 20),
  range('vayelech', 52, 'וילך', 'Deuteronomy', 31, 1, 31, 30),
  range('haazinu', 53, 'האזינו', 'Deuteronomy', 32, 1, 32, 52),
  range('vezot-haberakhah', 54, 'וזאת הברכה', 'Deuteronomy', 33, 1, 34, 12),
];

export function parshaSearchKey(value = '') {
  return String(value)
    .replace(/[״׳"'־-]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}