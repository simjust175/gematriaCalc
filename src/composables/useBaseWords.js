import { computed, isRef, ref, watch } from 'vue';
import { calcGematria, normalize } from './useGematria.js';

export function useBaseWords(value = ref(0), enabled = ref(true), options = {}) {
  value = isRef(value) ? value : ref(value);
  enabled = isRef(enabled) ? enabled : ref(enabled);
  const items = ref([]);
  const serverMatches = ref([]);
  const matchLoading = ref(false);
  const matchError = ref('');
  const loading = ref(false);
  const error = ref('');
  let controller;
  let requestId = 0;
  let matchRequestId = 0;
  let matchController;

  function notifyChanged() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('base-words-changed'));
    }
  }

  async function load() {
    if (!enabled.value) return;
    const id = ++requestId;
    controller?.abort();
    controller = new AbortController();
    loading.value = true; error.value = '';
    try {
      const response = await fetch('/api/base-words', { signal: controller.signal });
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      if (id === requestId) items.value = Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      if (e.name !== 'AbortError' && id === requestId) error.value = 'לא ניתן לטעון את מילות היסוד';
    } finally { if (id === requestId) loading.value = false; }
  }
  async function loadMatches() {
    const currentRequest = ++matchRequestId;
    matchController?.abort();
    const current = Number(value.value) || 0;
    if (!enabled.value || !current) {
      serverMatches.value = [];
      matchLoading.value = false;
      matchError.value = '';
      return;
    }
    matchLoading.value = true; matchError.value = '';
    matchController = new AbortController();
    try {
      const response = await fetch(`/api/base-words/matches?value=${encodeURIComponent(current)}`, { signal: matchController.signal });
      if (!response.ok) throw new Error('matches');
      const data = await response.json();
      if (currentRequest === matchRequestId) serverMatches.value = Array.isArray(data.results) ? data.results : [];
    } catch (e) {
      if (e.name !== 'AbortError' && currentRequest === matchRequestId) { serverMatches.value = []; matchError.value = 'לא ניתן לבדוק מילות יסוד כרגע'; }
    } finally {
      if (currentRequest === matchRequestId) matchLoading.value = false;
    }
  }

  async function save(originalText, sourceType) {
    const text = originalText?.trim();
    if (!text) return { ok: false, message: 'יש להזין מילה או ביטוי' };
    const response = await fetch('/api/base-words', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalText: text, ...(sourceType ? { sourceType } : {}) }),
    });
    if (response.status === 409) return { ok: false, duplicate: true, message: 'כבר קיים במילות יסוד' };
    if (!response.ok) return { ok: false, message: 'לא ניתן לשמור כרגע' };
    const data = await response.json();
    items.value = [...items.value.filter(item => item.id !== data.item.id), data.item];
    notifyChanged();
    return { ok: true, item: data.item };
  }
  async function update(id, originalText) {
    const response = await fetch(`/api/base-words/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalText }),
    });
    if (response.status === 409) return { ok: false, duplicate: true, message: 'כבר קיים במילות יסוד' };
    if (!response.ok) return { ok: false, message: 'לא ניתן לעדכן כרגע' };
    const data = await response.json();
    items.value = items.value.map(item => item.id === id ? (data.item || data) : item);
    notifyChanged();
    return { ok: true };
  }
  async function remove(id) {
    const response = await fetch(`/api/base-words/${id}`, { method: 'DELETE' });
    if (!response.ok) return false;
    items.value = items.value.filter(item => item.id !== id);
    notifyChanged();
    return true;
  }
  const matches = computed(() => {
    const current = Number(value.value) || 0;
    return serverMatches.value.map(item => ({ ...item, times: Number(item.times) }))
      .filter(item => Number(item.fullGematria) > 0 && current > 0 && current % Number(item.fullGematria) === 0);
  });
  watch(enabled, (on) => { if (on) { if (options.loadCollection !== false && !items.value.length) load(); loadMatches(); } else serverMatches.value = []; }, { immediate: true });
  watch(value, () => { if (enabled.value) loadMatches(); });
  return { items, matches, loading, error, matchLoading, matchError, load, save, update, remove, preview: text => calcGematria(normalize(text || '')) };
}