import {
  parseTefillotGematriaQuery,
  searchTefillotGematria,
} from './tefillotGematriaDiscovery.js';

function validSlug(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/u.test(value);
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