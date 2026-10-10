export function tefillotContextOf(value = {}) {
  const context = value.tefillot_context || value.tefillotContext || value;
  return context && (context.unitId ?? context.unit_id) != null
    ? {
        unitId: Number(context.unitId ?? context.unit_id),
        start: Number(context.start),
        end: Number(context.end),
        occasionSlug: context.occasionSlug || context.occasion_slug,
        occasionLabel: context.occasionLabel || context.occasion_label,
        serviceSlug: context.serviceSlug || context.service_slug,
        serviceLabel: context.serviceLabel || context.service_label,
        sectionKey: context.sectionKey || context.section_key,
        sectionLabel: context.sectionLabel || context.section_label,
        sourceReference: context.sourceReference || context.source_reference,
        sourceWork: context.sourceWork || context.source_work,
        sourceVersion: context.sourceVersion || context.source_version,
        license: context.license,
        sourceUrl: context.sourceUrl || context.source_url,
        versionSource: context.versionSource || context.version_source,
      }
    : null;
}

export function tanachContextOf(value = {}) {
  const context = value.tanach_context || value.tanachContext || value;
  const bookSlug = context.bookSlug || context.book_slug || value.bookSlug || value.book_slug;
  return bookSlug
    ? {
        bookSlug,
        chapter: Number(context.chapter),
        verse: Number(context.verse),
        start: Number(context.start),
        end: Number(context.end),
      }
    : null;
}

export function savedRangeKey(value = {}) {
  const tefillot = tefillotContextOf(value);
  if (tefillot) return `tefillot:${tefillot.unitId}:${tefillot.start}:${tefillot.end}`;
  const tanach = tanachContextOf(value);
  if (tanach) return `tanach:${tanach.bookSlug}:${tanach.chapter}:${tanach.verse}:${tanach.start}:${tanach.end}`;
  return '';
}
