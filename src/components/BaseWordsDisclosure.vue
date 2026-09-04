<template>
  <section class="base-disclosure" dir="rtl">
    <button class="base-toggle" type="button" :aria-expanded="open" @click="open = !open">
      <span><b>מילות יסוד</b><small>כניסות שלמות בלבד</small></span>
      <i class="ui-chevron" :class="open ? 'ui-chevron--up' : 'ui-chevron--down'" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="base-results" aria-live="polite">
      <div v-if="loading" class="base-state">בודק…</div>
      <div v-else-if="error" class="base-state">{{ error }}</div>
      <div v-else-if="!matches.length" class="base-state">אין התאמה במילות יסוד</div>
      <template v-else>
        <div v-for="item in matches" :key="item.id" class="base-result">
          <strong>{{ item.originalText }}</strong>
          <span>נכנס {{ item.times }} {{ item.times === 1 ? 'פעם' : 'פעמים' }} ({{ toHebrewNumber(item.times) }})</span>
        </div>
      </template>
    </div>
  </section>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { toHebrewNumber } from '@/composables/useGematria.js';
import { useBaseWords } from '@/composables/useBaseWords.js';
const props = defineProps({ value: { type: Number, default: 0 } });
const open = ref(false);
const value = computed(() => props.value);
const { matches, matchLoading: loading, matchError: error, loadMatches } = useBaseWords(value, open, { loadCollection: false });
onMounted(() => window.addEventListener('base-words-changed', loadMatches));
onBeforeUnmount(() => window.removeEventListener('base-words-changed', loadMatches));
</script>
<style scoped>
.base-disclosure{background:#fff;border:1.5px solid var(--border);border-radius:var(--radius);overflow:hidden}.base-toggle{width:100%;min-height:48px;border:0;background:#fffdf8;display:flex;align-items:center;justify-content:space-between;padding:9px 16px;color:var(--navy);font:inherit;text-align:right;cursor:pointer}.base-toggle:hover,.base-toggle:focus-visible{background:#fbf8f1}.base-toggle:focus-visible{outline:2px solid var(--gold);outline-offset:-3px}.base-toggle span{display:flex;align-items:baseline;gap:8px}.base-toggle small{font-size:.69rem;color:var(--text-secondary)}.base-toggle i{color:var(--gold);width:9px;height:9px}.base-results{padding:4px 14px}.base-result{display:flex;flex-direction:column;gap:2px;padding:11px 3px;border-bottom:1px solid #f0ebe2}.base-result:last-child{border:0}.base-result strong{font-size:.93rem}.base-result span,.base-state{color:var(--text-secondary);font-size:.77rem}.base-state{text-align:center;padding:14px 4px}
</style>