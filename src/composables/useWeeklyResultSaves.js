import { computed, ref } from 'vue';
import { useBaseWords } from './useBaseWords.js';
import { normalize } from './useGematria.js';
import { savedRangeKey, tanachContextOf } from '../utils/tefillotContext.js';

// Weekly results belong to the base word that generated the row. The calculator
// may be empty or show an unrelated value, so it must never supply this parent.
export function useWeeklyResultSaves() {
  const baseWords = useBaseWords(0, true, { preserveOriginalText: true });
  const baseKeys = computed(() => new Set(baseWords.items.value.map(item => item.normalizedText || normalize(item.originalText))));
  const parents = ref(new Map());
  const checking = ref(new Set());
  const pending = ref(new Set());
  const notice = ref(null);
  const controller = new AbortController();
  let generation = 0;

  const parentKey = item => normalize(item.baseWordText);
  const matchKey = item => `${parentKey(item)}\u0000${savedRangeKey(item)}`;
  const baseSaved = item => baseKeys.value.has(normalize(item.text));
  const matchSaved = item => parents.value.get(parentKey(item))?.has(savedRangeKey(item)) || false;
  const saving = item => pending.value.has(`base:${normalize(item.text)}`) || pending.value.has(`match:${matchKey(item)}`);

  async function checkMatch(item) {
    const key = parentKey(item);
    if (parents.value.has(key) || checking.value.has(key)) return;
    const version = generation;
    checking.value.add(key);
    try {
      const params = new URLSearchParams({ parentOriginalText: item.baseWordText, limit: '100' });
      const response = await fetch(`/api/entries?${params}`, { signal: controller.signal });
      if (!response.ok) return;
      const payload = await response.json();
      if (version !== generation || controller.signal.aborted) return;
      const parent = (payload.entries || []).find(entry =>
        !entry.tanach_book_slug && !entry.tefillot_context && !entry.tefillotContext
        && !['tanach', 'tefillot'].includes(entry.sourceType || entry.source_type)
        && entry.normalized_text === key);
      const keys = new Set((parent?.curated_matches || [])
        .filter(match => (match.reasonCodes || match.reason_codes || []).includes('full_gematria'))
        .map(savedRangeKey));
      // A save may have completed while this older hydration request was in flight.
      parents.value.set(key, new Set([...keys, ...(parents.value.get(key) || [])]));
    } catch {
      // The existing save endpoints remain idempotent if hydration is unavailable.
    } finally {
      if (version === generation) checking.value.delete(key);
    }
  }

  async function saveBase(item) {
    const key = `base:${normalize(item.text)}`;
    if (baseSaved(item) || pending.value.has(key) || baseWords.loading.value) return;
    pending.value.add(key);
    notice.value = null;
    try {
      const result = await baseWords.save(item.text, 'tanach');
      if (!result.ok && !result.duplicate) throw new Error('save');
      if (result.duplicate) {
        // Keep duplicate state immediately even if the next collection refresh fails.
        baseWords.items.value.push({ originalText: item.text, normalizedText: normalize(item.text) });
      }
      notice.value = { text: result.duplicate ? 'כבר נשמר כמילת יסוד' : 'נשמר כמילת יסוד', error: false };
      return true;
    } catch {
      notice.value = { text: 'לא ניתן לשמור כמילת יסוד כרגע. נסו שוב.', error: true };
      return false;
    } finally { pending.value.delete(key); }
  }

  async function saveMatch(item) {
    const key = `match:${matchKey(item)}`;
    if (matchSaved(item) || pending.value.has(key) || checking.value.has(parentKey(item))) return;
    pending.value.add(key);
    notice.value = null;
    try {
      const response = await fetch('/api/entries/curated-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentOriginalText: item.baseWordText,
          matches: [{ originalText: item.text, tanachContext: tanachContextOf(item), reasonCode: 'full_gematria' }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true || !payload.matches?.length
        || !Number.isSafeInteger(Number(payload.parentId)) || Number(payload.parentId) < 1
        || !Number.isSafeInteger(Number(payload.matches[0].id)) || Number(payload.matches[0].id) < 1) {
        throw new Error('save');
      }
      const parent = parentKey(item);
      parents.value.set(parent, new Set([...(parents.value.get(parent) || []), savedRangeKey(item)]));
      notice.value = { text: 'נשמר כהתאמה', error: false };
      return true;
    } catch {
      notice.value = { text: 'לא ניתן לשמור כהתאמה כרגע. נסו שוב.', error: true };
      return false;
    } finally { pending.value.delete(key); }
  }

  function refresh() {
    generation += 1;
    parents.value.clear();
    checking.value.clear();
    baseWords.load();
  }
  function dispose() { generation += 1; controller.abort(); }
  return { baseSaved, matchSaved, saving, checking, baseLoading: baseWords.loading, notice, checkMatch, saveBase, saveMatch, refresh, reloadBase: baseWords.load, dispose };
}
