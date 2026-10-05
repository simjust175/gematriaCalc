import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { normalize } from './useGematria.js';

export function useCorpusAutocomplete(input, { onSelect, debounceMs = 220, fetchImpl = fetch } = {}) {
  const suggestions = ref([]);
  const open = ref(false);
  const activeIndex = ref(-1);
  const loading = ref(false);
  const error = ref('');
  let timer;
  let controller;
  let requestId = 0;
  let selecting = false;
  let composing = false;

  function cancel() {
    clearTimeout(timer);
    controller?.abort();
    requestId++;
    loading.value = false;
  }
  function dismiss() {
    cancel();
    open.value = false;
    activeIndex.value = -1;
  }
  function search() {
    if (selecting) return;
    cancel();
    suggestions.value = [];
    open.value = false;
    activeIndex.value = -1;
    error.value = '';
    const query = normalize(input.value || '');
    if (composing || query.replace(/\s/g, '').length < 3 || input.value.length > 160) return;
    const id = requestId;
    timer = setTimeout(async () => {
      controller = new AbortController();
      loading.value = true;
      try {
        const response = await fetchImpl(`/api/corpus/suggestions?${new URLSearchParams({ q: input.value, limit: '8' })}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('suggestions');
        const data = await response.json();
        if (id !== requestId) return;
        suggestions.value = Array.isArray(data.results) ? data.results : [];
        open.value = suggestions.value.length > 0;
      } catch (reason) {
        if (id !== requestId || reason.name === 'AbortError') return;
        error.value = 'הצעות טקסט אינן זמינות כרגע';
        // Corpus suggestions are optional; ordinary calculation stays usable.
        open.value = false;
      } finally {
        if (id === requestId) loading.value = false;
      }
    }, debounceMs);
  }
  async function select(index) {
    const suggestion = suggestions.value[index];
    if (!suggestion) return;
    dismiss();
    selecting = true;
    input.value = suggestion.text;
    // Also suppress the focus callback while returning focus after a tap.
    try { await onSelect?.(); }
    finally { selecting = false; }
  }
  function onKeydown(event) {
    if (event.isComposing || composing) return false;
    if (!open.value || !suggestions.value.length) {
      if (event.key === 'Escape') dismiss();
      return false;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
      return true;
    }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const length = suggestions.value.length;
      activeIndex.value = event.key === 'ArrowDown'
        ? (activeIndex.value + 1) % length
        : (activeIndex.value < 0 ? length - 1 : (activeIndex.value - 1 + length) % length);
      return true;
    }
    if (event.key === 'Enter' && activeIndex.value >= 0) {
      event.preventDefault();
      select(activeIndex.value);
      return true;
    }
    return false;
  }
  function onOutside(event) {
    if (!event.target.closest?.('.input-card')) dismiss();
  }
  function onCompositionStart() { composing = true; dismiss(); }
  function onCompositionEnd() { composing = false; search(); }
  watch(input, () => { if (!selecting) search(); }, { flush: 'sync' });
  onMounted(() => document.addEventListener('pointerdown', onOutside));
  onBeforeUnmount(() => {
    cancel();
    document.removeEventListener('pointerdown', onOutside);
  });
  return { suggestions, open, activeIndex, loading, error, search, dismiss, select, onKeydown, onCompositionStart, onCompositionEnd };
}
