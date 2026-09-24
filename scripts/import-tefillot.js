import { pathToFileURL } from 'node:url';
import { pool } from '../server/db.js';
import {
  contextsForSiddurPath,
  describeContext,
  flattenHebrewText,
} from '../server/tefillotCorpus.js';
import { normalize } from '../src/composables/useGematria.js';

const WORK_TITLE = 'Siddur Sefard';
const WORK_SLUG = 'Siddur_Sefard';
const INDEX_URL = `https://www.sefaria.org/api/v2/raw/index/${WORK_SLUG}`;
const VERSIONS_URL = `https://www.sefaria.org/api/texts/versions/${WORK_SLUG}`;
const SEFARIA_WORK_URL = `https://www.sefaria.org/${WORK_SLUG}`;
const APPROVED_EDITIONS = [
  { title: 'The Metsudah siddur, 1981', license: 'CC-BY' },
  { title: 'Torat Emet 357', license: 'Public Domain' },
];
const HEBREW_CHARACTERS = /[\u05D0-\u05EA]/u;
const EXPECTED_MAPPED_LEAVES = 92;
const EXPECTED_CONTEXTS = 208;

function requireMetadataString(value, field, title) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Sefaria metadata for "${title}" has no ${field}`);
  }
  return value.trim();
}

function decodeJson(bytes, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} contains malformed UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function fetchJson(url, label) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (response.ok) return decodeJson(await response.arrayBuffer(), label);
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
      continue;
    }
    const error = new Error(`${label} request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
}

function englishTitle(node) {
  const title = node?.en
    || node?.title
    || node?.titles?.find(item => item.lang === 'en' && item.primary)?.text
    || node?.titles?.find(item => item.lang === 'en')?.text
    || node?.key;
  return typeof title === 'string' ? title.trim() : '';
}

function hebrewTitle(node) {
  const title = node?.he
    || node?.titles?.find(item => item.lang === 'he' && item.primary)?.text
    || node?.titles?.find(item => item.lang === 'he')?.text;
  return typeof title === 'string' ? title.trim() : '';
}

function collectLeaves(index) {
  const root = index?.schema || index;
  const leaves = [];
  const walk = (node, ancestors) => {
    if (!node || typeof node !== 'object') return;
    const en = englishTitle(node);
    const path = en ? [...ancestors, { en, he: hebrewTitle(node) }] : ancestors;
    const children = Array.isArray(node.nodes) ? node.nodes : [];
    if (children.length) {
      children.forEach(child => walk(child, path));
    } else if (path.length) {
      const explicitRef = node.wholeRef || node.ref
        || (Array.isArray(node.refs) ? node.refs[0] : node.refs);
      leaves.push({
        path,
        ordinal: leaves.length + 1,
        reference: typeof explicitRef === 'string' && explicitRef.trim()
          ? explicitRef.trim()
          : `${WORK_TITLE}, ${path.map(part => part.en).join(', ')}`,
      });
    }
  };

  if (Array.isArray(root?.nodes)) {
    root.nodes.forEach(node => walk(node, []));
  } else {
    walk(root, []);
  }
  return leaves;
}

function versionRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['versions', 'data', 'texts']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  throw new Error('Sefaria version metadata did not contain a version list');
}

function versionTitle(version) {
  return version?.versionTitle || version?.title || '';
}

function selectEditions(metadata) {
  const listed = new Map();
  for (const approved of APPROVED_EDITIONS) {
    const matches = metadata.filter(item => versionTitle(item) === approved.title
      && (item.language === 'he' || item.language === 'hebrew'));
    if (matches.length > 1) {
      throw new Error(`Sefaria lists duplicate metadata for "${approved.title}"`);
    }
    if (matches.length) {
      const license = requireMetadataString(matches[0].license, 'license', approved.title);
      if (license !== approved.license) {
        throw new Error(`Unexpected license for "${approved.title}": ${license}`);
      }
      listed.set(approved.title, { ...approved, metadata: matches[0] });
    }
  }
  return APPROVED_EDITIONS.map(item => listed.get(item.title)).filter(Boolean);
}

function sourceUrl(version) {
  const url = new URL(SEFARIA_WORK_URL);
  url.searchParams.set('lang', 'he');
  url.searchParams.set('version', `hebrew|${version}`);
  return url.toString();
}

function leafTextPayload(payload, selectedEdition) {
  const versions = Array.isArray(payload?.versions) ? payload.versions : [];
  if (Array.isArray(payload?.versions) && !versions.length) return null;
  const matchingVersion = versions.find(item => versionTitle(item) === selectedEdition.title);
  if (versions.length && !matchingVersion) {
    throw new Error(`Sefaria returned no "${selectedEdition.title}" version for this leaf`);
  }
  const metadata = matchingVersion || payload;
  const title = requireMetadataString(versionTitle(metadata), 'versionTitle', selectedEdition.title);
  if (title !== selectedEdition.title) {
    throw new Error(`Sefaria returned unexpected edition "${title}"`);
  }
  const license = requireMetadataString(metadata.license, 'license', title);
  if (license !== selectedEdition.license) {
    throw new Error(`Unexpected leaf license for "${title}": ${license}`);
  }
  const attribution = requireMetadataString(metadata.versionSource, 'versionSource', title);
  const text = matchingVersion?.text ?? payload?.text;
  return { text, attribution };
}

function safeKey(value) {
  return value.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '') || 'section';
}

function sectionMetadata(leaf, context) {
  const described = describeContext(context);
  const sectionNode = leaf.path.at(-1);
  const sectionKey = safeKey(leaf.path.map(part => part.en).join('-'));
  return {
    ...described,
    sectionKey,
    sectionLabel: sectionNode.he || sectionNode.en,
    sectionOrder: described.sectionOrder ?? leaf.ordinal,
  };
}

function makeSourceReference(reference, address) {
  return address.length ? `${reference} ${address.join(':')}` : reference;
}

function assertHebrewText(text, label) {
  if (text.includes('\uFFFD')) throw new Error(`${label} contains a malformed UTF-8 replacement character`);
  const normalized = normalize(text);
  if (!HEBREW_CHARACTERS.test(text) || !normalized) {
    throw new Error(`${label} contains no Hebrew text`);
  }
  return normalized;
}

async function buildCorpus() {
  const [rawIndex, rawVersions] = await Promise.all([
    fetchJson(INDEX_URL, 'Sefaria siddur index'),
    fetchJson(VERSIONS_URL, 'Sefaria version metadata'),
  ]);
  const leaves = collectLeaves(rawIndex);
  if (!leaves.length) throw new Error('Sefaria siddur index contains no text leaves');
  const mappedLeaves = leaves.filter(leaf => contextsForSiddurPath(leaf.path).length);
  const mappedContexts = mappedLeaves.reduce(
    (count, leaf) => count + contextsForSiddurPath(leaf.path).length, 0
  );
  if (mappedLeaves.length !== EXPECTED_MAPPED_LEAVES || mappedContexts !== EXPECTED_CONTEXTS) {
    throw new Error(`Sefaria index coverage changed: ${mappedLeaves.length} mapped leaves / ${mappedContexts} contexts; review the approved source before importing`);
  }
  const metadata = versionRows(rawVersions);
  const sources = new Map();
  const rows = [];
  const missingLeaves = [];
  const sequenceBySection = new Map();
  const duplicateKeys = [];
  const seenUnitKeys = new Set();
  const seenSourceReferences = new Set();

  for (const leaf of leaves) {
    const contexts = contextsForSiddurPath(leaf.path);
    if (!contexts.length) continue;
    const editions = selectEditions(metadata);
    if (!editions.length) {
      missingLeaves.push(leaf.reference);
      continue;
    }
    let edition;
    let flattened;
    let attribution;
    for (const candidate of editions) {
      const endpoint = new URL(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(leaf.reference)}`);
      endpoint.searchParams.set('version', `hebrew|${candidate.title}`);
      let response;
      try {
        response = await fetchJson(endpoint.toString(), `Sefaria text ${leaf.reference}`);
      } catch (error) {
        if (error.status === 404) continue;
        throw error;
      }
      const candidateText = leafTextPayload(response, candidate);
      if (!candidateText) continue;
      const candidateFlattened = flattenHebrewText(candidateText.text);
      if (!candidateFlattened.length) continue;
      edition = candidate;
      attribution = candidateText.attribution;
      flattened = candidateFlattened;
      break;
    }
    if (!edition) {
      missingLeaves.push(leaf.reference);
      continue;
    }
    if ((rows.length + 1) % 1000 === 0) console.log(`Prepared ${rows.length} text units...`);
    const sourceKey = `${WORK_TITLE}\u0000${edition.title}\u0000${sourceUrl(edition.title)}`;
    if (!sources.has(sourceKey)) {
      sources.set(sourceKey, {
        key: sourceKey,
        sourceWork: WORK_TITLE,
        sourceVersion: edition.title,
        versionSource: attribution,
        license: edition.license,
        sourceUrl: sourceUrl(edition.title),
      });
    } else if (sources.get(sourceKey).versionSource !== attribution) {
      throw new Error(`Sefaria versionSource changed within "${edition.title}"`);
    }

    for (const context of contexts) {
      const section = sectionMetadata(leaf, context);
      for (const segment of flattened) {
        const normalized = assertHebrewText(segment.text, leaf.reference);
        const key = [
          sourceKey,
          section.occasionSlug,
          section.serviceSlug,
          section.sectionKey,
        ].join('\u0000');
        const sequence = (sequenceBySection.get(key) || 0) + 1;
        sequenceBySection.set(key, sequence);
        const unitKey = `${key}\u0000${sequence}`;
        if (seenUnitKeys.has(unitKey)) duplicateKeys.push(unitKey);
        seenUnitKeys.add(unitKey);
        const sourceReference = makeSourceReference(leaf.reference, segment.address);
        const referenceKey = `${key}\u0000${sourceReference}`;
        if (seenSourceReferences.has(referenceKey)) duplicateKeys.push(referenceKey);
        seenSourceReferences.add(referenceKey);
        rows.push({
          unitKey,
          sourceKey,
          nusach: 'sefard',
          occasionSlug: section.occasionSlug,
          occasionLabel: section.occasionLabel,
          occasionOrder: section.occasionOrder,
          serviceSlug: section.serviceSlug,
          serviceLabel: section.serviceLabel,
          serviceOrder: section.serviceOrder,
          sectionKey: section.sectionKey,
          sectionLabel: section.sectionLabel,
          sectionOrder: section.sectionOrder,
          subsection: segment.address.length ? segment.address.join('.') : null,
          sequence,
          hebrewText: segment.text,
          normalizedHebrewText: normalized,
          sourceReference,
          sourceWork: WORK_TITLE,
          sourceVersion: edition.title,
          license: edition.license,
        });
      }
    }
  }

  if (duplicateKeys.length) {
    throw new Error(`Duplicate tefillot unit keys detected (${duplicateKeys.length}): ${duplicateKeys.slice(0, 5).join('; ')}`);
  }
  if (missingLeaves.length) {
    throw new Error(`Licensed Hebrew text is missing for ${missingLeaves.length} mapped Siddur leaves: ${missingLeaves.join('; ')}`);
  }
  if (!rows.length) throw new Error('No licensed Hebrew siddur text was found for mapped sections');
  return { sources: [...sources.values()], rows, missingLeaves };
}

async function assertTablesExistAndEmpty(client) {
  const tables = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [['tefillot_sources', 'tefillot_units']]
  );
  const found = new Set(tables.rows.map(row => row.table_name));
  const absent = ['tefillot_sources', 'tefillot_units'].filter(name => !found.has(name));
  if (absent.length) throw new Error(`Required tefillot table(s) do not exist: ${absent.join(', ')}`);
  const counts = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM tefillot_sources) AS source_count,
       (SELECT COUNT(*)::int FROM tefillot_units) AS unit_count`
  );
  if (counts.rows[0].source_count || counts.rows[0].unit_count) {
    throw new Error('Import refused: tefillot_sources and tefillot_units must both be empty');
  }
}

async function insertCorpus(client, corpus) {
  const sourceIds = new Map();
  for (const source of corpus.sources) {
    const inserted = await client.query(
      `INSERT INTO tefillot_sources
         (source_work, source_version, version_source, license, source_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [source.sourceWork, source.sourceVersion, source.versionSource, source.license, source.sourceUrl]
    );
    sourceIds.set(source.key, inserted.rows[0].id);
  }
  for (const row of corpus.rows) {
    await client.query(
      `INSERT INTO tefillot_units
         (source_id, nusach, occasion_slug, occasion_label, occasion_order,
          service_slug, service_label, service_order, section_key, section_label,
          section_order, subsection, sequence, hebrew_text, normalized_hebrew_text,
          source_reference, source_work, source_version, license)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16, $17, $18, $19)`,
      [
        sourceIds.get(row.sourceKey), row.nusach, row.occasionSlug, row.occasionLabel,
        row.occasionOrder, row.serviceSlug, row.serviceLabel, row.serviceOrder,
        row.sectionKey, row.sectionLabel, row.sectionOrder, row.subsection,
        row.sequence, row.hebrewText, row.normalizedHebrewText, row.sourceReference,
        row.sourceWork, row.sourceVersion, row.license,
      ]
    );
  }
}

function printReport(corpus) {
  const counts = new Map();
  for (const row of corpus.rows) {
    const key = `${row.occasionSlug}/${row.serviceSlug}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  console.log(`Imported ${corpus.rows.length} tefillot units from ${corpus.sources.length} approved edition(s).`);
  console.log('Counts by occasion/service:');
  for (const [key, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${key}: ${count}`);
  }
  console.log(`Missing mapped leaves: ${corpus.missingLeaves.length}`);
  for (const reference of corpus.missingLeaves) console.log(`  ${reference}`);
  console.log('Duplicate keys: 0');
  console.log('Attribution:');
  for (const source of corpus.sources) {
    console.log(`  ${source.sourceWork} — ${source.sourceVersion} (${source.license}); ${source.versionSource}; ${source.sourceUrl}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; use the development database after applying the tefillot migration.');
  if (!dryRun && (process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT)
    && !process.argv.includes('--confirm-production-import')) {
    throw new Error('Production import blocked. Pass --confirm-production-import only after explicit review.');
  }

  // Complete and validate all remote data before opening the database transaction.
  const corpus = await buildCorpus();
  if (dryRun) {
    printReport(corpus);
    await pool.end();
    return;
  }
  const client = await pool.connect();
  try {
    await assertTablesExistAndEmpty(client);
    await client.query('BEGIN');
    try {
      // Recheck inside the transaction in case another importer ran meanwhile.
      await assertTablesExistAndEmpty(client);
      await insertCorpus(client, corpus);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
  printReport(corpus);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async error => {
    console.error(`Tefillot import failed: ${error.message}`);
    process.exitCode = 1;
    await pool.end();
  });
}