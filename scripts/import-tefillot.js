/**
 * Repeatable importer for the legally reusable Hebrew Nusach Sefard material
 * exposed by Sefaria's structured Siddur Sefard index.
 */
import { createHash } from 'node:crypto';
import { pool, initDb } from '../server/db.js';
import {
  contextsForSiddurPath,
  describeContext,
  flattenHebrewText,
  REUSABLE_LICENSES,
} from '../server/tefillotCorpus.js';
import { normalize } from '../src/composables/useGematria.js';

const WORK = 'Siddur Sefard';
const INDEX_URL = `https://www.sefaria.org/api/index/${encodeURIComponent(WORK.replaceAll(' ', '_'))}`;
const TEXT_URL = ref => `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=primary`;

function primaryTitle(node, language) {
  return (node.titles || []).find(title => title.lang === language && title.primary)?.text || node.key || '';
}

function collectLeaves(node, parentPath = []) {
  const en = primaryTitle(node, 'en');
  const he = primaryTitle(node, 'he');
  const path = en && en !== WORK ? [...parentPath, { en, he }] : parentPath;
  if (node.nodes?.length) return node.nodes.flatMap(child => collectLeaves(child, path));
  return [{ path }];
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Gematria-Tefillot-Importer/1.0' } });
  if (!response.ok) throw new Error(`Sefaria request failed (${response.status}): ${url}`);
  return response.json();
}

function sourceId(version) {
  return createHash('sha256')
    .update([WORK, version.versionTitle, version.license].join('\0'))
    .digest('hex')
    .slice(0, 24);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  await initDb();
  try {
    const index = await fetchJson(INDEX_URL);
    const leaves = collectLeaves(index.schema)
      .map(leaf => ({ ...leaf, contexts: contextsForSiddurPath(leaf.path) }))
      .filter(leaf => leaf.contexts.length);

    const fetched = await mapWithConcurrency(leaves, 5, async (leaf, leafOrder) => {
      const ref = [WORK, ...leaf.path.map(part => part.en)].join(', ');
      const payload = await fetchJson(TEXT_URL(ref));
      const version = payload.versions?.find(item => item.language === 'he');
      if (!version || !REUSABLE_LICENSES.has(version.license)) {
        console.warn(`Skipping ${ref}: no reusable Hebrew version`);
        return null;
      }
      return { leaf, leafOrder, ref: payload.ref || ref, version, units: flattenHebrewText(version.text) };
    });

    const reusable = fetched.filter(Boolean);
    if (!reusable.length) throw new Error('No reusable Siddur Sefard text was returned by Sefaria');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tefillot_units');
      await client.query('DELETE FROM tefillot_sources');

      const sourceIds = new Map();
      for (const item of reusable) {
        const key = `${item.version.versionTitle}\0${item.version.license}`;
        if (sourceIds.has(key)) continue;
        const id = sourceId(item.version);
        sourceIds.set(key, id);
        await client.query(
          `INSERT INTO tefillot_sources
             (id, source_work, source_version, version_source, license, source_url)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            id,
            WORK,
            item.version.versionTitle,
            item.version.versionSource || 'https://www.sefaria.org',
            item.version.license,
            `https://www.sefaria.org/${encodeURIComponent(WORK.replaceAll(' ', '_'))}`,
          ]
        );
      }

      let sequence = 0;
      for (const item of reusable) {
        const sectionKey = createHash('sha1').update(item.ref).digest('hex').slice(0, 16);
        const sectionLabel = item.leaf.path.at(-1)?.he || item.leaf.path.at(-1)?.en;
        const subsection = item.leaf.path.slice(0, -1).map(part => part.he).filter(Boolean).join(' ← ') || null;
        const id = sourceIds.get(`${item.version.versionTitle}\0${item.version.license}`);
        for (const context of item.leaf.contexts) {
          const described = describeContext(context);
          for (let unitIndex = 0; unitIndex < item.units.length; unitIndex += 1) {
            const unit = item.units[unitIndex];
            const normalized = normalize(unit.text);
            if (!normalized) continue;
            const address = unit.address.length ? `.${unit.address.join('.')}` : '';
            sequence += 1;
            await client.query(
              `INSERT INTO tefillot_units
                 (source_id, nusach, occasion_slug, occasion_label, occasion_order,
                  service_slug, service_label, service_order, section_key, section_label,
                  section_order, subsection, sequence, hebrew_text, normalized_hebrew_text,
                  source_reference, source_work, source_version, license)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
              [
                id, 'Nusach Sefard', described.occasionSlug, described.occasionLabel,
                described.occasionOrder, described.serviceSlug, described.serviceLabel,
                described.serviceOrder, sectionKey, sectionLabel,
                described.sectionOrder ?? item.leafOrder + 1,
                subsection, unitIndex + 1, unit.text, normalized,
                `${item.ref}${address}`, WORK, item.version.versionTitle, item.version.license,
              ]
            );
          }
        }
      }

      const validation = await client.query(
        `SELECT occasion_slug, service_slug, COUNT(*)::int AS units
         FROM tefillot_units
         GROUP BY occasion_slug, service_slug`
      );
      const present = new Set(validation.rows.map(row => `${row.occasion_slug}/${row.service_slug}`));
      for (const expected of [
        'weekday/shacharit', 'weekday/mincha', 'weekday/maariv',
        'shabbat/kabbalat-shabbat', 'shabbat/maariv', 'shabbat/shacharit',
        'shabbat/musaf', 'shabbat/mincha',
        ...['pesach', 'shavuot', 'sukkot', 'shemini-atzeret', 'simchat-torah']
          .flatMap(occasion => ['maariv', 'shacharit', 'musaf', 'mincha'].map(service => `${occasion}/${service}`)),
      ]) {
        if (!present.has(expected)) throw new Error(`Corpus validation failed: missing ${expected}`);
      }
      await client.query('COMMIT');
      console.log(`Imported ${sequence.toLocaleString()} licensed Nusach Sefard units from ${reusable.length} Sefaria sections.`);
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
  console.error('Tefillot import failed:', error.message);
  process.exitCode = 1;
});