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
          <span class="base-relationship">נכנס <b class="base-multiplier">{{ item.times }}</b> {{ item.times === 1 ? 'פעם' : 'פעמים' }} ({{ toHebrewNumber(item.times) }})</span>
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
.base-disclosure {
  background: #fffdf8;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 1px 2px rgba(26, 39, 68, 0.025);
  overflow: hidden;
}

.base-toggle {
  width: 100%;
  min-height: 62px;
  border: 0;
  background: #fffdf8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 16px;
  color: var(--navy);
  font: inherit;
  text-align: right;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease;
}

.base-toggle:hover,
.base-toggle:focus-visible,
.base-toggle[aria-expanded="true"] {
  background: #fbf8f1;
}

.base-toggle:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -3px;
}

.base-toggle > span {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px 10px;
  min-width: 0;
  line-height: 1.25;
}

.base-toggle b {
  font-size: .88rem;
  font-weight: 650;
  white-space: nowrap;
}

.base-toggle small {
  color: var(--text-secondary);
  font-size: .69rem;
  font-weight: 500;
  white-space: nowrap;
}

.base-toggle i {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  color: var(--gold);
}

.base-results {
  padding: 0 14px;
  border-top: 1px solid var(--border);
}

.base-result {
  min-height: 52px;
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 10px;
  padding: 13px 3px;
  border-bottom: 1px solid #f0ebe2;
  text-align: right;
}

.base-result:last-child {
  border-bottom: 0;
}

.base-result strong {
  color: var(--navy);
  font-size: .93rem;
  font-weight: 650;
  line-height: 1.35;
  white-space: nowrap;
}

.base-result span,
.base-state {
  color: var(--text-secondary);
  font-size: .77rem;
}

.base-relationship {
  line-height: 1.4;
  white-space: nowrap;
}

.base-multiplier {
  color: var(--gold);
  font-size: inherit;
  font-weight: 700;
}

.base-state {
  min-height: 45px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 4px;
  text-align: right;
}

@media (max-width:520px){
  .base-toggle {
    min-height: 60px;
    padding-inline: 13px;
  }

  .base-toggle > span {
    gap: 3px 8px;
  }

  .base-toggle small {
    flex-basis: 100%;
  }

  .base-results {
    padding-inline: 10px;
  }

  .base-result {
    min-height: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 8px 2px;
  }

  .base-result strong {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .base-result span {
    max-width: 100%;
    font-size: .72rem;
    white-space: normal;
  }

  .base-state {
    min-height: 42px;
    padding-inline: 2px;
  }
}
</style>