import {
  parseTefillotGematriaQuery,
  searchTefillotGematria,
} from './tefillotGematriaDiscovery.js';
import {
  parseGematriaSearchQuery,
  searchTanachGematria,
  validateTanachGematriaScope,
} from './tanachGematriaDiscovery.js';

function validSlug(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/u.test(value);
}

const TANACH_ONLY_QUERY_KEYS = [
  'book_order', 'parsha_id', 'chapter_book', 'chapter', 'verse', 'parsha',
];

export function combineDiscoveryPayloads(tanach, tefillot, limit) {
  const tanachResults = (tanach.results || []).map(item => ({
    ...item,
    sourceType: 'tanach',
  }));
  const tefillotResults = (tefillot.results || []).map(item => ({
    ...item,
    sourceType: 'tefillot',
  }));
  const results = [];
  for (
    let index = 0;
    index < Math.max(tanachResults.length, tefillotResults.length) && results.length < limit;
    index += 1
  ) {
    if (tanachResults[index]) results.push(tanachResults[index]);
    if (tefillotResults[index] && results.length < limit) results.push(tefillotResults[index]);
  }
  const counts = ['all', 'whole_word', 'whole_phrase', 'partial'].reduce((combined, key) => {
    combined[key] = Number(tanach.counts?.[key] || 0) + Number(tefillot.counts?.[key] || 0);
    return combined;
  }, {});
  const sourceCounts = {
    tanach: Number(tanach.total || 0),
    tefillot: Number(tefillot.total || 0),
  };
  return {
    method: tanach.method || tefillot.method,
    results,
    counts,
    sourceCounts,
    total: sourceCounts.tanach + sourceCounts.tefillot,
    page: tanach.page || tefillot.page || 1,
    limit,
    hasMore: tanach.hasMore === true || tefillot.hasMore === true,
    weeklyParshah: tanach.weeklyParshah || null,
  };
}

export function registerCombinedDiscoveryRoute(
  app,
  { tanachPool, tefillotPool, requireAuth },
) {
  app.get('/api/discovery/gematria-matches', requireAuth, async (req, res) => {
    if (!tefillotPool) {
      return res.status(503).json({ error: 'multi_user_unavailable' });
    }
    const requestedLimit = Number(req.query.limit || 12);
    const perSourceLimit = Math.max(1, Math.ceil(requestedLimit / 2));
    const tanachQuery = { ...req.query, limit: String(perSourceLimit) };
    const tefillotQuery = { ...req.query, limit: String(perSourceLimit) };
    for (const key of TANACH_ONLY_QUERY_KEYS) delete tefillotQuery[key];

    const tanachOptions = parseGematriaSearchQuery(tanachQuery);
    if (tanachOptions.error) return res.status(400).json({ error: tanachOptions.error });
    const tefillotOptions = parseTefillotGematriaQuery(tefillotQuery);
    if (tefillotOptions.error) return res.status(400).json({ error: tefillotOptions.error });

    try {
      const scopeError = await validateTanachGematriaScope(tanachPool, tanachOptions);
      if (scopeError) return res.status(400).json({ error: scopeError });
      const [tanach, tefillot] = await Promise.all([
        searchTanachGematria(tanachPool, tanachOptions),
        searchTefillotGematria(tefillotPool, tefillotOptions),
      ]);
      res.json(combineDiscoveryPayloads(tanach, tefillot, requestedLimit));
    } catch (error) {
      console.error('/api/discovery/gematria-matches error:', error.message);
      res.status(500).json({ error: 'combined_gematria_search_failed' });
    }
  });
}

export function registerTefillotRoutes(app, { pool, requireAuth }) {
  app.get('/api/tefillot/gematria-matches', requireAuth, async (req, res) => {
    const parsed = parseTefillotGematriaQuery(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
      res.json(await searchTefillotGematria(pool, parsed));
    } catch (error) {
      console.error('/api/tefillot/gematria-matches error:', error.message);
      res.status(500).json({ error: 'tefillot_gematria_search_failed' });
    }
  });

  app.get('/api/tefillot/catalog', requireAuth, async (_req, res) => {
    try {
      const [navigation, sources, count] = await Promise.all([
        pool.query(
          `SELECT occasion_slug, occasion_label, occasion_order,
                  service_slug, service_label, service_order,
                  section_key, section_label, section_order,
                  COUNT(*)::int AS unit_count
           FROM tefillot_units
           GROUP BY occasion_slug, occasion_label, occasion_order,
                    service_slug, service_label, service_order,
                    section_key, section_label, section_order
           ORDER BY occasion_order, service_order, section_order, section_label`
        ),
        pool.query(
          `SELECT source_work, source_version, version_source, license, source_url, imported_at
           FROM tefillot_sources ORDER BY source_work, source_version`
        ),
        pool.query('SELECT COUNT(*)::int AS unit_count FROM tefillot_units'),
      ]);

      const occasions = [];
      for (const row of navigation.rows) {
        let occasion = occasions.find(item => item.slug === row.occasion_slug);
        if (!occasion) {
          occasion = { slug: row.occasion_slug, label: row.occasion_label, services: [] };
          occasions.push(occasion);
        }
        let service = occasion.services.find(item => item.slug === row.service_slug);
        if (!service) {
          service = { slug: row.service_slug, label: row.service_label, sections: [] };
          occasion.services.push(service);
        }
        service.sections.push({
          key: row.section_key,
          label: row.section_label,
          unitCount: row.unit_count,
        });
      }

      res.json({ occasions, sources: sources.rows, stats: count.rows[0] });
    } catch (error) {
      console.error('/api/tefillot/catalog error:', error.message);
      res.status(500).json({ error: 'tefillot_catalog_failed' });
    }
  });

  app.get('/api/tefillot/section', requireAuth, async (req, res) => {
    const { occasion, service, section } = req.query;
    if (!validSlug(occasion) || !validSlug(service) || typeof section !== 'string' || !section) {
      return res.status(400).json({ error: 'invalid_tefillot_reference' });
    }
    try {
      const result = await pool.query(
        `SELECT u.id, u.nusach, u.occasion_slug, u.occasion_label,
                u.service_slug, u.service_label, u.section_key, u.section_label,
                u.subsection, u.sequence, u.hebrew_text, u.source_reference,
                u.source_work, u.source_version, u.license,
                s.version_source, s.source_url
         FROM tefillot_units u
         JOIN tefillot_sources s ON s.id = u.source_id
         WHERE u.occasion_slug = $1 AND u.service_slug = $2 AND u.section_key = $3
         ORDER BY u.section_order, u.sequence`,
        [occasion, service, section]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'tefillot_section_not_found' });
      res.json({ section: result.rows });
    } catch (error) {
      console.error('/api/tefillot/section error:', error.message);
      res.status(500).json({ error: 'tefillot_section_failed' });
    }
  });
}