<template>
  <section class="weekly-scan" dir="rtl" aria-label="מילות יסוד בפרשת השבוע">
    <header class="scan-head">
      <div>
        <span class="eyebrow">מילות יסוד · פרשת השבוע</span>
        <h2>{{ data?.parsha ? `התאמות בפרשת ${data.parsha.nameHe}` : 'מילות יסוד בפרשה' }}</h2>
      </div>
      <button class="close" type="button" aria-label="סגור" @click="$emit('close')">
        <span class="mdi mdi-close" aria-hidden="true"></span>
      </button>
    </header>

    <p v-if="loading" class="scan-state" role="status">מחפש התאמות במילות היסוד השמורות…</p>
    <div v-else-if="error" class="scan-state error" role="alert">
      {{ error }}
      <button type="button" @click="scan(true)">נסה שוב</button>
    </div>
    <div v-else-if="data && !data.parsha" class="scan-state">
      השבוע חלה קריאת חג במקום פרשה רגילה. אין טווח פרשה לחיפוש.
    </div>
    <div v-else-if="data && !data.baseWordCount" class="scan-state">
      עדיין אין מילות יסוד שמורות. אפשר להוסיף אותן דרך ״מילות יסוד״ בתפריט.
    </div>
    <template v-else-if="data">
      <div class="summary" aria-live="polite">
        <span><strong>{{ data.words.length.toLocaleString('he-IL') }}</strong> מילות יסוד עם התאמות</span>
        <span><strong>{{ data.total.toLocaleString('he-IL') }}</strong> התאמות בפרשה</span>
      </div>
      <p v-if="!data.total" class="scan-state">לא נמצאו התאמות של מילים שלמות או ביטויים שלמים בפרשה זו.</p>
      <template v-else>
        <div class="filter-wrap">
          <label for="weekly-word-filter">מילת יסוד</label>
          <select id="weekly-word-filter" v-model="selectedWord">
            <option value="">כל מילות היסוד</option>
            <option v-for="word in data.words" :key="word.id" :value="String(word.id)">
              {{ word.text }} · {{ word.count.toLocaleString('he-IL') }}
            </option>
          </select>
        </div>
        <div class="scan-results">
          <article
            v-for="item in data.results"
            :key="`${item.baseWordId}-${item.bookSlug}-${item.chapter}-${item.verse}-${item.start}-${item.end}`"
            class="match-row"
          >
            <div class="match-copy">
              <span class="word">{{ item.baseWordText }} <span class="value">{{ item.value.toLocaleString('he-IL') }}</span></span>
              <span class="reference">{{ item.bookName }} {{ item.chapter }}:{{ item.verse }} · {{ item.type === 'whole_word' ? 'מילה שלמה' : 'ביטוי שלם' }}</span>
              <span class="match-text" dir="rtl">{{ item.text }}</span>
            </div>
            <button type="button" class="open" @click="$emit('open-tanach', item)">
              <span class="mdi mdi-book-open-outline" aria-hidden="true"></span>
              פתח בתנ״ך
            </button>
          </article>
        </div>
        <footer class="scan-footer">
          <span>מוצגות {{ data.results.length.toLocaleString('he-IL') }} מתוך {{ data.selectedTotal.toLocaleString('he-IL') }} התאמות</span>
          <button v-if="data.hasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? 'טוען…' : 'הצג עוד התאמות' }}
          </button>
        </footer>
        <p v-if="loadMoreError" class="scan-footnote error" role="alert">{{ loadMoreError }}</p>
      </template>
    </template>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

defineEmits(['close', 'open-tanach']);
const data = ref(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const loadMoreError = ref('');
const selectedWord = ref('');
let controller = null;
let requestSequence = 0;

async function scan(reset = true) {
  const requestId = ++requestSequence;
  controller?.abort();
  controller = new AbortController();
  if (reset) {
    loading.value = true;
    data.value = null;
  } else {
    loadingMore.value = true;
  }
  error.value = '';
  loadMoreError.value = '';
  try {
    const page = reset ? 1 : (data.value?.page || 1) + 1;
    const params = new URLSearchParams({ page: String(page) });
    if (selectedWord.value) params.set('word_id', selectedWord.value);
    const response = await fetch(`/api/base-words/weekly-parsha?${params}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('search_failed');
    const payload = await response.json();
    if (requestId !== requestSequence) return;
    data.value = reset
      ? payload
      : { ...payload, results: [...(data.value?.results || []), ...payload.results] };
  } catch (caught) {
    if (requestId !== requestSequence || caught.name === 'AbortError') return;
    if (reset) error.value = 'לא ניתן לחפש כעת. נסה שוב.';
    else loadMoreError.value = 'לא ניתן לטעון התאמות נוספות. נסה שוב.';
  } finally {
    if (requestId === requestSequence) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}
function loadMore() {
  if (loadingMore.value || !data.value?.hasMore) return;
  scan(false);
}
watch(selectedWord, () => scan(true));
onMounted(() => scan(true));
onBeforeUnmount(() => {
  requestSequence += 1;
  controller?.abort();
});
</script>

<style scoped>
.weekly-scan {background:#fff;border:1px solid #e4d7bd;border-radius:14px;padding:20px;color:var(--navy,#1a2744);}
.scan-head {display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
.eyebrow {font-size:.72rem;color:#a17a30;font-weight:700;}
.scan-head h2 {font-size:1.24rem;margin:4px 0 14px;font-weight:700;}
.close {border:0;background:transparent;color:#aaa294;cursor:pointer;font-size:1rem;padding:4px;}
.summary {display:flex;gap:20px;flex-wrap:wrap;border-bottom:1px solid #ece6d8;padding:0 0 14px;font-size:.83rem;color:#72717c;}
.summary strong {color:#a27e35;}
.scan-state {padding:22px 4px;color:#6d7483;font-size:.9rem;}
.scan-state button {margin-inline-start:10px;color:#8d702e;background:none;border:0;text-decoration:underline;cursor:pointer;}
.error {color:#a45747;}
.filter-wrap {display:flex;align-items:center;gap:12px;margin:15px 0;font-size:.8rem;color:#64718b;}
.filter-wrap select {max-width:100%;padding:8px 12px;border:1px solid #dfd5be;border-radius:8px;background:#fff;color:#1a2744;font:inherit;}
.scan-results {display:grid;gap:0;max-height:520px;overflow:auto;}
.match-row {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 2px;border-bottom:1px solid #efe9dd;}
.match-copy {display:flex;flex-direction:column;gap:3px;min-width:0;}
.word {font-weight:700;font-size:.88rem;}
.value {font-size:.75rem;color:#ae8532;margin-inline-start:6px;}
.reference {font-size:.72rem;color:#6f7b8e;}
.match-text {font-size:.88rem;color:#293958;overflow-wrap:anywhere;}
.open {flex-shrink:0;border:1px solid #ddc89b;background:#faf5e9;border-radius:8px;padding:8px 10px;color:#8c6928;font:inherit;font-size:.77rem;cursor:pointer;}
.open:hover {background:#f3e8ce;}
.open:focus-visible,.close:focus-visible,.load-more:focus-visible {outline:2px solid #ae8738;outline-offset:2px;}
.scan-footer {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:14px;font-size:.75rem;color:#787e8c;}
.load-more {padding:9px 13px;border:1px solid #dec999;border-radius:8px;background:#fcf7ec;color:#8c6928;font:inherit;cursor:pointer;}
.load-more:disabled {opacity:.6;cursor:default;}
.scan-footnote {font-size:.74rem;color:#787e8c;margin:12px 0 0;}
@media(max-width:560px) {.weekly-scan{padding:15px}.match-row{align-items:start;flex-direction:column}.open{align-self:flex-start}.scan-results{max-height:430px}}
</style>
