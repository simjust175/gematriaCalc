import { getCurrentScope, onScopeDispose, ref, watch } from 'vue';

export function emptyMatchState() {
  return {
    matches: [],
    isAlreadySaved: false,
    allMiluiFormsSaved: false,
    error: false,
  };
}

/**
 * Debounced live matching with immediate stale-result removal and protection
 * against out-of-order responses, including an A → B → A input sequence.
 */
export function useLiveMatching(result, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const debounceMs = options.debounceMs ?? 350;
  const matches = ref(emptyMatchState());

  let debounceTimer = null;
  let activeController = null;
  let latestRequestId = 0;

  function cancelPendingRequest() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    activeController?.abort();
    activeController = null;
  }

  const context = options.context;
  const watchSources = context ? [result, context] : [result];
  const stopWatching = watch(watchSources, ([newResult, newContext]) => {
    cancelPendingRequest();
    const requestId = ++latestRequestId;

    // Match reasons from the previous value must disappear immediately.
    matches.value = emptyMatchState();
    if (!newResult) return;

    const snapshot = {
      fullGematria: newResult.fullGematria,
      normalizedText: newResult.normalizedText,
    };

    debounceTimer = setTimeout(async () => {
      const controller = new AbortController();
      activeController = controller;

      try {
        const params = new URLSearchParams({
          normalizedText: snapshot.normalizedText,
        });
        if (newContext?.bookSlug) {
          params.set('bookSlug', newContext.bookSlug);
          params.set('chapter', String(newContext.chapter));
          params.set('verse', String(newContext.verse));
          params.set('start', String(newContext.start));
          params.set('end', String(newContext.end));
        }
        if (Number.isInteger(newContext?.explicitMiluiTotal) && newContext.explicitMiluiTotal > 0) {
          params.set('explicitMiluiTotal', String(newContext.explicitMiluiTotal));
        }
        const response = await fetchImpl(`/api/matches?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (requestId === latestRequestId && !controller.signal.aborted) {
            matches.value = { ...emptyMatchState(), error: true };
          }
          return;
        }

        const data = await response.json();
        if (requestId !== latestRequestId || controller.signal.aborted) return;

        matches.value = {
          matches: Array.isArray(data.matches) ? data.matches : [],
          isAlreadySaved: data.isAlreadySaved === true,
          allMiluiFormsSaved: data.allMiluiFormsSaved === true,
          error: false,
        };
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Match fetch error:', error);
          if (requestId === latestRequestId) {
            matches.value = { ...emptyMatchState(), error: true };
          }
        }
      } finally {
        if (requestId === latestRequestId) activeController = null;
      }
    }, debounceMs);
  }, { flush: 'sync', immediate: true });

  function stop() {
    latestRequestId += 1;
    cancelPendingRequest();
    stopWatching();
  }

  if (getCurrentScope()) onScopeDispose(stop);

  return { matches, stop };
}