<template>
  <div class="match-panel" v-if="hasInput">
    <div class="matches-section">
      <div class="matches-header">
        <div>
          <div class="matches-title">התאמות שמורות</div>
          <div class="matches-context" v-if="gematria">
            התאמות לחישוב הנוכחי:
            <strong class="primary-accent">{{ gematria }} · {{ currentGematriaHebrew }}</strong>
          </div>
        </div>
      </div>

      <div v-if="isAlreadySaved" class="already-saved-badge">כבר שמור ✓</div>

      <template v-if="matches.length > 0">
        <div
          v-for="match in visibleMatches"
          :key="match.id"
          class="match-item"
          :class="{ 'match-item--full': hasMatchType(match, 'full_gematria') }"
        >
          <div class="match-text">
            <template v-if="match.matched_words?.length">
              <span
                v-for="(part, index) in highlightParts(match)"
                :key="`${match.id}-part-${index}`"
                :class="{ 'match-text__word': part.highlighted }"
              >{{ part.text }}</span>
            </template>
            <template v-else>{{ match.original_text }}</template>
          </div>

          <div class="match-badges" aria-label="סיבות להתאמה">
            <span
              v-for="type in match.matchTypes"
              :key="type"
              class="match-badge"
              :class="getMatchTypeMeta(type).badgeClass"
            >
              {{ getMatchTypeMeta(type).label }}
            </span>
          </div>

          <div class="match-details">
            <span v-if="hasMatchType(match, 'full_gematria')" class="match-detail match-detail--full">
              גימטריה מלאה: {{ match.full_gematria }}
            </span>
            <span v-if="hasMatchType(match, 'initials_text')" class="match-detail">
              ר״ת: {{ match.initials }}
            </span>
            <span v-if="hasMatchType(match, 'initials_gematria')" class="match-detail">
              גימטריית ר״ת: {{ match.initials_gematria }}
            </span>
          </div>

          <div v-if="match.matched_words?.length" class="matched-word-detail">
            <span>{{ match.matched_words.length > 1 ? 'תיבות מתאימות:' : 'תיבה מתאימה:' }}</span>
            <strong>{{ matchedWordNames(match) }}</strong>
            <span aria-hidden="true">·</span>
            <b>{{ match.matched_words[0].gematria }}</b>
          </div>
        </div>
        <button v-if="matches.length > showCount" class="show-more" @click="showCount += 5">
          הצג עוד ({{ matches.length - showCount }})
        </button>
      </template>
      <div v-else-if="gematria" class="no-matches">אין התאמות</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { getMatchTypeMeta } from '@/utils/matchTypes.js';
import { normalize, toHebrewNumber } from '@/composables/useGematria.js';

const props = defineProps({
  matches: { type: Array, default: () => [] },
  gematria: { type: Number, default: 0 },
  isAlreadySaved: { type: Boolean, default: false },
  hasInput: { type: Boolean, default: false },
});

const showCount = ref(5);

// Reset pagination when match set changes
watch(() => props.matches, () => { showCount.value = 5; });

const visibleMatches = computed(() => props.matches.slice(0, showCount.value));
const currentGematriaHebrew = computed(() => (
  props.gematria ? toHebrewNumber(props.gematria) : ''
));

function hasMatchType(match, type) {
  return match.matchTypes?.includes(type);
}

function highlightParts(match) {
  const matchingWords = new Set(
    (match.matched_words || []).map(word => normalize(String(word.word || ''))).filter(Boolean)
  );
  return String(match.original_text || '').split(/(\s+)/).map(text => ({
    text,
    highlighted: !/^\s+$/.test(text) && matchingWords.has(normalize(text)),
  }));
}

function matchedWordNames(match) {
  return [...new Set((match.matched_words || []).map(word => word.word).filter(Boolean))].join(' ו');
}
</script>

<style scoped>
.match-panel {
  display: flex;
  flex-direction: column;
}

.matches-section {
  background: #fff;
  border: 1px solid #E6DFD0;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(26, 39, 68, 0.06);
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

.matches-context {
  margin-top: 4px;
  color: #6B7A94;
  font-size: 0.78rem;
  line-height: 1.35;
}

.primary-accent {
  color: #C09840;
  font-family: "Source Sans Pro", Arial, sans-serif;
}

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
  padding: 12px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 8px;
  background: #F7F8FB;
  border: 1px solid #E0E7F0;
  transition: background 0.15s;
}

.match-item--full {
  background: #FBF8F3;
  border-color: #EDE5D4;
}

.match-item:hover { background: #F1F4F8; }
.match-item--full:hover { background: #F5EDD8; }

.match-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1A2744;
  direction: rtl;
  text-align: right;
  width: 100%;
}

.match-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  direction: rtl;
}

.match-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 0.69rem;
  font-weight: 700;
  line-height: 1.2;
  border: 1px solid transparent;
}

.match-badge--full {
  color: #765812;
  background: #F5E8C5;
  border-color: #E6CE91;
}

.match-badge--initials {
  color: #40547A;
  background: #E9EEF7;
  border-color: #CBD6E9;
}

.match-badge--initials-gematria {
  color: #604B7A;
  background: #F0EBF7;
  border-color: #DCD0EB;
}

.match-badge--word, .match-badge--default {
  color: #456357;
  background: #EAF3EE;
  border-color: #CEE1D6;
}

.match-details {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  direction: rtl;
  color: #6B7A94;
  font-size: 0.75rem;
}

.match-detail--full {
  color: #8C6A20;
  font-weight: 700;
}

.matched-word-detail {
  width: 100%;
  border-top: 1px solid #E4E8EF;
  padding-top: 7px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  direction: rtl;
  font-size: 0.76rem;
  color: #6B7A94;
}

.matched-word-detail strong {
  color: #1A2744;
  font-weight: 700;
}

.matched-word-detail b {
  color: #8C6A20;
  font-weight: 700;
}

.match-text__word {
  display: inline;
  padding: 1px 4px;
  border-radius: 4px;
  background: #F5E8C5;
  color: #624A13;
}

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

</style>
