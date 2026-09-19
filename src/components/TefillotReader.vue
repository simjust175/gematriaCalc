<template>
  <div class="tefillot-page" dir="rtl">
    <div v-if="loadingCatalog" class="reader-state">
      <span class="mdi mdi-loading mdi-spin" aria-hidden="true"></span>
      טוען תפילות...
    </div>
    <div v-else-if="catalogError" class="reader-state reader-state--error" role="alert">
      <span class="mdi mdi-book-alert-outline" aria-hidden="true"></span>
      <strong>{{ catalogError }}</strong>
      <small>אפשר לטעון מחדש באמצעות npm run import:tefillot</small>
    </div>

    <div v-else class="tefillot-layout">
      <aside class="navigator panel-card">
        <header class="navigator-heading">
          <span class="eyebrow">נוסח ספרד</span>
          <h1>תפילות</h1>
          <small>{{ catalog.stats.unit_count.toLocaleString('he-IL') }} יחידות טקסט</small>
        </header>

        <div class="navigation-step">
          <span>מועד</span>
          <div class="choice-grid occasion-grid">
            <button
              v-for="occasion in catalog.occasions"
              :key="occasion.slug"
              :class="{ active: occasion.slug === selectedOccasion?.slug }"
              @click="selectOccasion(occasion)"
            >{{ occasion.label }}</button>
          </div>
        </div>

        <div v-if="selectedOccasion" class="navigation-step">
          <span>תפילה</span>
          <div class="choice-grid">
            <button
              v-for="service in selectedOccasion.services"
              :key="service.slug"
              :class="{ active: service.slug === selectedService?.slug }"
              @click="selectService(service)"
            >{{ service.label }}</button>
          </div>
        </div>

        <div v-if="selectedService" class="section-list" aria-label="חלקי התפילה">
          <span>חלקי התפילה</span>
          <button
            v-for="section in selectedService.sections"
            :key="section.key"
            :class="{ active: section.key === selectedSection?.key }"
            @click="selectSection(section)"
          >
            <b>{{ section.label }}</b>
            <small>{{ section.unitCount }} קטעים</small>
          </button>
        </div>
      </aside>

      <main class="reader-column">
        <section class="reader-card panel-card">
          <header class="reader-heading">
            <div>
              <span class="breadcrumb">
                {{ selectedOccasion?.label }} ← {{ selectedService?.label }}
              </span>
              <h2>{{ selectedSection?.label || 'בחרו חלק תפילה' }}</h2>
            </div>
            <span class="nusach-badge">נוסח ספרד</span>
          </header>

          <div v-if="loadingSection" class="section-state">
            <span class="mdi mdi-loading mdi-spin" aria-hidden="true"></span>
            טוען טקסט...
          </div>
          <p v-else-if="sectionError" class="section-state section-error" role="alert">{{ sectionError }}</p>
          <article v-else-if="units.length" class="prayer-text" lang="he">
            <p
              v-for="unit in units"
              :key="unit.id"
              :data-unit-id="unit.id"
              :class="{ 'matched-unit': Number(unit.id) === highlightedMatch?.unitId }"
            >
              <template v-if="Number(unit.id) === highlightedMatch?.unitId">
                {{ highlightedUnitParts(unit).before }}<mark>{{ highlightedUnitParts(unit).match }}</mark>{{ highlightedUnitParts(unit).after }}
              </template>
              <template v-else>{{ unit.hebrew_text }}</template>
            </p>
          </article>
          <div v-else class="section-state">בחרו מועד, תפילה וחלק לקריאה.</div>
        </section>

        <details v-if="activeSource" class="source-card panel-card">
          <summary>פרטי מקור ורישיון</summary>
          <dl>
            <div><dt>חיבור</dt><dd>{{ activeSource.source_work }}</dd></div>
            <div><dt>גרסה</dt><dd>{{ activeSource.source_version }}</dd></div>
            <div><dt>רישיון</dt><dd>{{ activeSource.license }}</dd></div>
            <div><dt>מראה מקום</dt><dd>{{ activeSource.source_reference }}</dd></div>
          </dl>
          <a :href="activeSource.source_url" target="_blank" rel="noopener noreferrer">פתיחה בספריא</a>
        </details>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { createTanachCursor } from '@/composables/useTanachCursor.js';

const props = defineProps({
  openReference: { type: Object, default: null },
});
const emit = defineEmits(['referenceConsumed']);
const catalog = ref({ occasions: [], sources: [], stats: { unit_count: 0 } });
const selectedOccasion = ref(null);
const selectedService = ref(null);
const selectedSection = ref(null);
const units = ref([]);
const loadingCatalog = ref(true);
const loadingSection = ref(false);
const catalogError = ref('');
const sectionError = ref('');
const highlightedMatch = ref(null);
let requestId = 0;

const activeSource = computed(() => units.value[0] || null);

onMounted(loadCatalog);

async function loadCatalog() {
  loadingCatalog.value = true;
  catalogError.value = '';
  try {
    const response = await fetch('/api/tefillot/catalog');
    if (!response.ok) throw new Error(response.status === 401 ? 'נדרשת התחברות מחדש' : 'לא ניתן לטעון את מאגר התפילות');
    catalog.value = await response.json();
    if (!catalog.value.occasions.length) throw new Error('מאגר התפילות עדיין לא נטען');
    const referencedOccasion = catalog.value.occasions.find(
      occasion => occasion.slug === props.openReference?.occasionSlug
    );
    selectOccasion(referencedOccasion || catalog.value.occasions[0]);
    if (referencedOccasion) {
      const service = referencedOccasion.services.find(
        item => item.slug === props.openReference?.serviceSlug
      );
      if (service) {
        selectService(service);
        const section = service.sections.find(item => item.key === props.openReference?.sectionKey);
        if (section) selectSection(section);
      }
    }
  } catch (error) {
    catalogError.value = error.message;
  } finally {
    loadingCatalog.value = false;
  }
}

function selectOccasion(occasion) {
  selectedOccasion.value = occasion;
  selectService(occasion.services[0] || null);
}

function selectService(service) {
  selectedService.value = service;
  selectSection(service?.sections[0] || null);
}

async function selectSection(section) {
  selectedSection.value = section;
  units.value = [];
  sectionError.value = '';
  if (!section || !selectedOccasion.value || !selectedService.value) return;
  const currentRequest = ++requestId;
  loadingSection.value = true;
  try {
    const params = new URLSearchParams({
      occasion: selectedOccasion.value.slug,
      service: selectedService.value.slug,
      section: section.key,
    });
    const response = await fetch(`/api/tefillot/section?${params}`);
    if (!response.ok) throw new Error('לא ניתן לטעון את חלק התפילה');
    const payload = await response.json();
    if (currentRequest === requestId) {
      units.value = payload.section;
      await revealReferencedMatch();
    }
  } catch (error) {
    if (currentRequest === requestId) sectionError.value = error.message;
  } finally {
    if (currentRequest === requestId) loadingSection.value = false;
  }
}

function highlightedUnitParts(unit) {
  const text = String(unit.hebrew_text || '');
  const match = highlightedMatch.value;
  if (!match || Number(unit.id) !== match.unitId) return { before: '', match: text, after: '' };
  const cursor = createTanachCursor(text);
  const first = cursor.letters[match.start];
  const last = cursor.letters[match.end];
  if (!first || !last) return { before: '', match: text, after: '' };
  const characters = [...text];
  let end = last.displayIndex + 1;
  while (/[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]/u.test(characters[end] || '')) end += 1;
  return {
    before: characters.slice(0, first.displayIndex).join(''),
    match: characters.slice(first.displayIndex, end).join(''),
    after: characters.slice(end).join(''),
  };
}

async function revealReferencedMatch() {
  const reference = props.openReference;
  if (
    !reference
    || !Number.isSafeInteger(Number(reference.unitId))
    || !Number.isSafeInteger(Number(reference.start))
    || !Number.isSafeInteger(Number(reference.end))
  ) return;
  const unitId = Number(reference.unitId);
  if (!units.value.some(unit => Number(unit.id) === unitId)) return;
  highlightedMatch.value = {
    unitId,
    start: Number(reference.start),
    end: Number(reference.end),
  };
  await nextTick();
  document.querySelector(`[data-unit-id="${unitId}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
  emit('referenceConsumed', reference.requestId);
}
</script>

<style scoped>
.tefillot-page { color: #1a2744; }
.tefillot-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}
.panel-card {
  background: #fff;
  border: 1px solid #e6dfd0;
  border-radius: 14px;
  box-shadow: 0 2px 16px rgba(26, 39, 68, .08);
}
.navigator {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow: auto;
  padding: 20px;
}
.navigator-heading { padding-bottom: 17px; border-bottom: 1px solid #eee7dc; }
.eyebrow { color: #a67c28; font-size: .7rem; font-weight: 800; letter-spacing: .08em; }
.navigator-heading h1 { margin: 2px 0; font-family: "Noto Serif Hebrew", serif; font-size: 1.9rem; }
.navigator-heading small { color: #7b8496; }
.navigation-step { margin-top: 18px; }
.navigation-step > span, .section-list > span {
  display: block; margin-bottom: 8px; color: #7b8496; font-size: .74rem; font-weight: 700;
}
.choice-grid { display: flex; flex-wrap: wrap; gap: 7px; }
.choice-grid button, .section-list button {
  border: 1px solid #e2d9c8; background: #fffdf9; color: #43506a; font: inherit; cursor: pointer;
}
.choice-grid button { padding: 7px 11px; border-radius: 999px; font-size: .78rem; }
.choice-grid button:hover, .section-list button:hover { border-color: #c09840; color: #765812; }
.choice-grid button.active { background: #1a2744; border-color: #1a2744; color: #fff; }
.section-list { display: grid; gap: 6px; margin-top: 20px; }
.section-list > span { margin-bottom: 2px; }
.section-list button {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 10px 11px; border-radius: 9px; text-align: right;
}
.section-list b { font-size: .82rem; font-weight: 650; }
.section-list small { flex: 0 0 auto; color: #9298a4; font-size: .65rem; }
.section-list button.active { border-color: #c09840; background: #f8f1df; color: #765812; }
.reader-column { min-width: 0; display: grid; gap: 14px; }
.reader-card { min-height: 520px; overflow: hidden; }
.reader-heading {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 20px 24px; border-bottom: 1px solid #eee7dc; background: #fffdf9;
}
.breadcrumb { color: #a67c28; font-size: .75rem; font-weight: 650; }
.reader-heading h2 { margin-top: 3px; font-family: "Noto Serif Hebrew", serif; font-size: 1.4rem; }
.nusach-badge { flex: 0 0 auto; padding: 5px 9px; border-radius: 999px; background: #f5edd8; color: #8b681f; font-size: .68rem; font-weight: 700; }
.prayer-text { max-width: 790px; margin: 0 auto; padding: 34px clamp(24px, 6vw, 70px) 54px; }
.prayer-text p {
  margin: 0 0 1.05em; color: #202a3d; font-family: "Noto Serif Hebrew", serif;
  font-size: clamp(1.14rem, 1.8vw, 1.35rem); line-height: 2; white-space: pre-line;
}
.prayer-text p.matched-unit { scroll-margin-block: 120px; }
.prayer-text mark { padding: 2px 4px; border-radius: 3px; background: #f2e4bd; color: #4e3b13; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.section-state, .reader-state {
  min-height: 320px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #7b8496;
}
.reader-state { min-height: 60vh; flex-direction: column; }
.reader-state--error, .section-error { color: #9b413a; }
.source-card { padding: 14px 18px; color: #606b7e; font-size: .76rem; }
.source-card summary { cursor: pointer; color: #43506a; font-weight: 700; }
.source-card dl { display: grid; gap: 6px; margin: 13px 0; }
.source-card dl div { display: grid; grid-template-columns: 90px 1fr; gap: 10px; }
.source-card dt { font-weight: 700; }
.source-card dd { overflow-wrap: anywhere; }
.source-card a { color: #8b681f; }
@media (max-width: 820px) {
  .tefillot-layout { grid-template-columns: 1fr; }
  .navigator { position: static; max-height: none; }
  .section-list { max-height: 230px; overflow: auto; }
}
@media (max-width: 520px) {
  .navigator { padding: 15px; }
  .reader-heading { padding: 16px; }
  .prayer-text { padding: 24px 18px 40px; }
  .occasion-grid { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
}
</style>