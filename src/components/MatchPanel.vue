<template>
  <div class="match-panel" v-if="hasInput">
    <!-- Primary matches: full gematria -->
    <div class="matches-section">
      <div class="matches-header">
        <span class="matches-title">התאמות שמורות</span>
        <span class="matches-value primary-accent" v-if="gematria">{{ gematria }}</span>
      </div>

      <div v-if="isAlreadySaved" class="already-saved-badge">כבר שמור ✓</div>

      <template v-if="primary.length > 0">
        <div
          v-for="(m, i) in visiblePrimary"
          :key="'p' + i"
          class="match-item primary-item"
        >
          <template v-if="m.type === 'entry'">
            <div class="match-text">{{ m.original_text }}</div>
            <div class="match-num">{{ m.full_gematria }}</div>
          </template>
          <template v-else>
            <div class="match-text">{{ m.word }}</div>
            <div class="match-source">מתוך: {{ m.entry_text }}</div>
            <div class="match-num">{{ m.gematria }}</div>
          </template>
        </div>
        <button v-if="primary.length > showPrimaryCount" class="show-more" @click="showPrimaryCount += 5">
          הצג עוד ({{ primary.length - showPrimaryCount }})
        </button>
      </template>
      <div v-else-if="gematria" class="no-matches">אין התאמות</div>
    </div>

    <!-- Secondary matches: ראשי תיבות gematria — only shown when there are actual matches -->
    <div class="matches-section secondary-section" v-if="secondary.length > 0">
      <div class="matches-header">
        <span class="matches-title secondary-title">התאמות לפי ראשי תיבות</span>
        <span class="matches-value secondary-accent" v-if="initialsGematria">{{ initialsGematria }}</span>
      </div>

      <template v-if="secondary.length > 0">
        <div
          v-for="(m, i) in visibleSecondary"
          :key="'s' + i"
          class="match-item secondary-item"
        >
          <div class="match-text">{{ m.original_text }}</div>
          <div class="match-meta">ר״ת: {{ m.initials }}</div>
          <div class="match-num secondary-num">{{ m.initials_gematria }}</div>
        </div>
        <button v-if="secondary.length > showSecondaryCount" class="show-more" @click="showSecondaryCount += 5">
          הצג עוד ({{ secondary.length - showSecondaryCount }})
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  primary: { type: Array, default: () => [] },
  secondary: { type: Array, default: () => [] },
  gematria: { type: Number, default: 0 },
  initialsGematria: { type: Number, default: 0 },
  isAlreadySaved: { type: Boolean, default: false },
  hasInput: { type: Boolean, default: false },
});

const showPrimaryCount = ref(5);
const showSecondaryCount = ref(3);

// Reset pagination when match set changes
watch(() => props.primary, () => { showPrimaryCount.value = 5; });
watch(() => props.secondary, () => { showSecondaryCount.value = 3; });

const visiblePrimary = computed(() => props.primary.slice(0, showPrimaryCount.value));
const visibleSecondary = computed(() => props.secondary.slice(0, showSecondaryCount.value));
</script>

<style scoped>
.match-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.matches-section {
  background: #fff;
  border: 1px solid #E6DFD0;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(26, 39, 68, 0.06);
}

.secondary-section {
  opacity: 0.85;
}

.matches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.matches-title {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #6B7A94;
  text-transform: uppercase;
}

.secondary-title {
  font-size: 0.72rem;
}

.matches-value {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: "Source Sans Pro", Arial, sans-serif;
}

.primary-accent { color: #C09840; }
.secondary-accent { color: #8A9ABF; font-size: 1.15rem; }

.already-saved-badge {
  display: inline-flex;
  align-items: center;
  background: #EBF5EB;
  color: #388E3C;
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 10px;
}

.match-item {
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 6px;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
  border: 1px solid transparent;
  transition: background 0.15s;
}

.primary-item {
  background: #FBF8F3;
  border-color: #EDE5D4;
}

.primary-item:hover { background: #F5EDD8; }

.secondary-item {
  background: #F5F7FB;
  border-color: #E0E7F0;
}

.secondary-item:hover { background: #EBF0F8; }

.match-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1A2744;
  direction: rtl;
  text-align: right;
  width: 100%;
}

.match-source, .match-meta {
  font-size: 0.72rem;
  color: #8A9ABF;
  direction: rtl;
  text-align: right;
}

.match-num {
  font-size: 0.8rem;
  font-weight: 700;
  color: #C09840;
  align-self: flex-end;
}

.secondary-num { color: #8A9ABF; }

.show-more {
  width: 100%;
  margin-top: 8px;
  padding: 6px;
  font-size: 0.78rem;
  color: #6B7A94;
  background: none;
  border: 1px dashed #D0CBBe;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  direction: rtl;
}

.show-more:hover { background: #F7F4EF; color: #1A2744; }

.no-matches {
  font-size: 0.85rem;
  color: #ADB5BD;
  text-align: center;
  padding: 12px 0;
  direction: rtl;
}

.no-matches-sm { font-size: 0.78rem; padding: 8px 0; }
</style>
