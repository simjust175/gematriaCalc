import { getCurrentScope, onScopeDispose, ref, watch } from 'vue';

export function emptyMultipleState() {
  return {
    currentValue: 0,
    groups: [],
    loading: false,
    error: false,
  };
}

/**
 * On-demand, debounced saved-library multiple discovery.
 * The open ref is part of the watched state so a closed disclosure never
 * starts a request and closing it invalidates any response already in flight.
 */
export function useMultipleDiscovery(value, open, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const debounceMs = options.debounceMs ?? 350;
  const state = ref(emptyMultipleState());

  let debounceTimer = null;
  let activeController = null;
  let latestRequestId = 0;

  function cancelPendingRequest() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    activeController?.abort();
    activeController = null;
  }

  const stopWatching = watch([value, open], ([newValue, isOpen]) => {
    cancelPendingRequest();
    const requestId = ++latestRequestId;
    state.value = {
      ...emptyMultipleState(),
      currentValue: Number(newValue) || 0,
    };

    if (!isOpen || !Number.isSafeInteger(newValue) || newValue <= 0) return;

    state.value.loading = true;
    const snapshot = newValue;
    debounceTimer = setTimeout(async () => {
      const controller = new AbortController();
      activeController = controller;

      try {
        const params = new URLSearchParams({ value: String(snapshot) });
        const response = await fetchImpl(`/api/multiples?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (requestId === latestRequestId && !controller.signal.aborted) {
            state.value = {
              ...emptyMultipleState(),
              currentValue: snapshot,
              error: true,
            };
          }
          return;
        }

        const data = await response.json();
        if (requestId !== latestRequestId || controller.signal.aborted) return;

        state.value = {
          currentValue: Number(data.currentValue) || snapshot,
          groups: Array.isArray(data.groups) ? data.groups : [],
          loading: false,
          error: false,
        };
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Multiple discovery fetch error:', error);
          if (requestId === latestRequestId) {
            state.value = {
              ...emptyMultipleState(),
              currentValue: snapshot,
              error: true,
            };
          }
        }
      } finally {
        if (requestId === latestRequestId) activeController = null;
      }
    }, debounceMs);
  }, { flush: 'sync' });

  function stop() {
    latestRequestId += 1;
    cancelPendingRequest();
    stopWatching();
  }

  if (getCurrentScope()) onScopeDispose(stop);

  return { state, stop };
}