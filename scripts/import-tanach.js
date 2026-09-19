/**
 * One-time/repeatable importer for the Unicode/XML Leningrad Codex (UXLC).
 * Source: https://www.tanach.us/Books/Tanach.xml.zip
 * UXLC 2.5 (27.6), April 2026, Tanach.us Inc.
 */
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { seedTanachParshiot } from '../server/db.js';
import { requireMultiUserPool } from '../server/databaseRouter.js';
import {
  resolveUxlcVerseText,
  UXLC_REPRESENTATION_VERSION,
} from '../server/uxlcText.js';
import { normalize } from '../src/composables/useGematria.js';

const ARCHIVE_URL = 'https://www.tanach.us/Books/Tanach.xml.zip';
const ARCHIVE_SHA256 = '1bc6e006f43d3b18f2f718cefa3aa4774cac2c54092c28d173dd61996c43a050';
const SOURCE = {
  id: 'uxlc-2.5-27.6-2026-04',
  name: 'Unicode/XML Leningrad Codex',
  version: 'UXLC 2.5',
  build: '27.6',
  publishedAt: 'April 2026',
  attribution: 'Unicode/XML Leningrad Codex, UXLC 2.5 (27.6), Tanach.us Inc., April 2026.',
  license: 'Tanach.us states that all biblical Hebrew text, in any format, may be viewed or copied without restriction.',
  sourceUrl: ARCHIVE_URL,
};

// 39 XML source files represented as the 24 canonical Jewish books.
const BOOKS = [
  ['Genesis', 1, 1, 'תורה', 'בראשית', 'Genesis'],
  ['Exodus', 2, 1, 'תורה', 'שמות', 'Exodus'],
  ['Leviticus', 3, 1, 'תורה', 'ויקרא', 'Leviticus'],
  ['Numbers', 4, 1, 'תורה', 'במדבר', 'Numbers'],
  ['Deuteronomy', 5, 1, 'תורה', 'דברים', 'Deuteronomy'],
  ['Joshua', 6, 1, 'נביאים', 'יהושע', 'Joshua'],
  ['Judges', 7, 1, 'נביאים', 'שופטים', 'Judges'],
  ['Samuel_1', 8, 1, 'שמואל', 'שמואל א׳', 'Samuel I'],
  ['Samuel_2', 8, 2, 'שמואל', 'שמואל ב׳', 'Samuel II'],
  ['Kings_1', 9, 1, 'מלכים', 'מלכים א׳', 'Kings I'],
  ['Kings_2', 9, 2, 'מלכים', 'מלכים ב׳', 'Kings II'],
  ['Isaiah', 10, 1, 'נביאים', 'ישעיהו', 'Isaiah'],
  ['Jeremiah', 11, 1, 'נביאים', 'ירמיהו', 'Jeremiah'],
  ['Ezekiel', 12, 1, 'נביאים', 'יחזקאל', 'Ezekiel'],
  ['Hosea', 13, 1, 'תרי עשר', 'הושע', 'Hosea'],
  ['Joel', 13, 2, 'תרי עשר', 'יואל', 'Joel'],
  ['Amos', 13, 3, 'תרי עשר', 'עמוס', 'Amos'],
  ['Obadiah', 13, 4, 'תרי עשר', 'עובדיה', 'Obadiah'],
  ['Jonah', 13, 5, 'תרי עשר', 'יונה', 'Jonah'],
  ['Micah', 13, 6, 'תרי עשר', 'מיכה', 'Micah'],
  ['Nahum', 13, 7, 'תרי עשר', 'נחום', 'Nahum'],
  ['Habakkuk', 13, 8, 'תרי עשר', 'חבקוק', 'Habakkuk'],
  ['Zephaniah', 13, 9, 'תרי עשר', 'צפניה', 'Zephaniah'],
  ['Haggai', 13, 10, 'תרי עשר', 'חגי', 'Haggai'],
  ['Zechariah', 13, 11, 'תרי עשר', 'זכריה', 'Zechariah'],
  ['Malachi', 13, 12, 'תרי עשר', 'מלאכי', 'Malachi'],
  ['Psalms', 14, 1, 'כתובים', 'תהילים', 'Psalms'],
  ['Job', 15, 1, 'כתובים', 'איוב', 'Job'],
  ['Proverbs', 16, 1, 'כתובים', 'משלי', 'Proverbs'],
  ['Ruth', 17, 1, 'חמש מגילות', 'רות', 'Ruth'],
  ['Song_of_Songs', 18, 1, 'חמש מגילות', 'שיר השירים', 'Song of Songs'],
  ['Ecclesiastes', 19, 1, 'חמש מגילות', 'קהלת', 'Ecclesiastes'],
  ['Lamentations', 20, 1, 'חמש מגילות', 'איכה', 'Lamentations'],
  ['Esther', 21, 1, 'חמש מגילות', 'אסתר', 'Esther'],
  ['Daniel', 22, 1, 'כתובים', 'דניאל', 'Daniel'],
  ['Ezra', 23, 1, 'עזרא–נחמיה', 'עזרא', 'Ezra'],
  ['Nehemiah', 23, 2, 'עזרא–נחמיה', 'נחמיה', 'Nehemiah'],
  ['Chronicles_1', 24, 1, 'דברי הימים', 'דברי הימים א׳', 'Chronicles I'],
  ['Chronicles_2', 24, 2, 'דברי הימים', 'דברי הימים ב׳', 'Chronicles II'],
];
const CANONICAL_NAMES = [
  'בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים',
  'יהושע', 'שופטים', 'שמואל', 'מלכים', 'ישעיהו', 'ירמיהו', 'יחזקאל',
  'תרי עשר', 'תהילים', 'איוב', 'משלי', 'רות', 'שיר השירים',
  'קהלת', 'איכה', 'אסתר', 'דניאל', 'עזרא–נחמיה', 'דברי הימים',
];

function parseBook(xml, slug) {
  const rows = [];
  for (const chapterMatch of xml.matchAll(/<c n="(\d+)">([\s\S]*?)<\/c>/g)) {
    const chapter = Number(chapterMatch[1]);
    for (const verseMatch of chapterMatch[2].matchAll(/<v n="(\d+)">([\s\S]*?)<\/v>/g)) {
      const verse = Number(verseMatch[1]);
      const displayText = resolveUxlcVerseText(verseMatch[2]);
      if (!displayText || !normalize(displayText)) throw new Error(`${slug} ${chapter}:${verse} has no Hebrew text`);
      rows.push({ slug, chapter, verse, displayText, normalizedText: normalize(displayText) });
    }
  }
  return rows;
}

async function main() {
  const pool = requireMultiUserPool();
  try {
    const response = await fetch(ARCHIVE_URL);
    if (!response.ok) throw new Error(`Could not download UXLC (${response.status})`);
    const archiveBytes = Buffer.from(await response.arrayBuffer());
    const archiveHash = createHash('sha256').update(archiveBytes).digest('hex');
    if (archiveHash !== ARCHIVE_SHA256) {
      throw new Error(`UXLC archive checksum mismatch (received ${archiveHash})`);
    }
    const archiveFiles = unzipSync(archiveBytes);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO tanach_sources
           (id, name, version, build, published_at, attribution, license, source_url, representation_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET imported_at = NOW(),
           attribution = EXCLUDED.attribution, license = EXCLUDED.license,
           representation_version = EXCLUDED.representation_version`,
        [
          SOURCE.id,
          SOURCE.name,
          SOURCE.version,
          SOURCE.build,
          SOURCE.publishedAt,
          SOURCE.attribution,
          SOURCE.license,
          SOURCE.sourceUrl,
          UXLC_REPRESENTATION_VERSION,
        ]
      );

      let verseCount = 0;
      for (const [slug, canonicalOrder, segmentOrder, _legacyGroup, hebrewName, englishName] of BOOKS) {
        const canonicalName = CANONICAL_NAMES[canonicalOrder - 1];
        const file = archiveFiles[`Books/${slug}.xml`];
        if (!file) throw new Error(`UXLC archive is missing Books/${slug}.xml`);
        const rows = parseBook(Buffer.from(file).toString('utf8'), slug);
        const chapters = Math.max(...rows.map(row => row.chapter));
        await client.query(
          `INSERT INTO tanach_books (slug, canonical_order, segment_order, canonical_name, hebrew_name, english_name, source_filename, chapter_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (slug) DO UPDATE SET canonical_order = EXCLUDED.canonical_order, segment_order = EXCLUDED.segment_order,
             canonical_name = EXCLUDED.canonical_name, hebrew_name = EXCLUDED.hebrew_name, english_name = EXCLUDED.english_name,
             source_filename = EXCLUDED.source_filename, chapter_count = EXCLUDED.chapter_count`,
          [slug, canonicalOrder, segmentOrder, canonicalName, hebrewName, englishName, `${slug}.xml`, chapters]
        );
        await client.query(
          `INSERT INTO tanach_verses (book_slug, chapter, verse, display_text, normalized_text, source_id)
           SELECT * FROM UNNEST($1::text[], $2::int[], $3::int[], $4::text[], $5::text[], $6::text[])
           ON CONFLICT (book_slug, chapter, verse) DO UPDATE SET display_text = EXCLUDED.display_text,
             normalized_text = EXCLUDED.normalized_text, source_id = EXCLUDED.source_id`,
          [
            rows.map(row => row.slug),
            rows.map(row => row.chapter),
            rows.map(row => row.verse),
            rows.map(row => row.displayText),
            rows.map(row => row.normalizedText),
            rows.map(() => SOURCE.id),
          ]
        );
        verseCount += rows.length;
      }
      await seedTanachParshiot(client);
      const genesis = await client.query(
        `SELECT display_text FROM tanach_verses WHERE book_slug = 'Genesis' AND chapter = 1 AND verse = 1`
      );
      const expected = normalize('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
      if (genesis.rowCount !== 1 || genesis.rows[0].display_text !== 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃' || verseCount !== 23213 || normalize(genesis.rows[0].display_text) !== expected) {
        throw new Error('UXLC corpus validation failed');
      }
      await client.query('COMMIT');
      console.log(`Imported UXLC: 39 source segments / 24 canonical books / ${verseCount.toLocaleString()} verses.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Tanach import failed:', error.message);
  process.exitCode = 1;
});