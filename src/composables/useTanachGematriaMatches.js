import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';

const FILTERS = ['all', 'whole_word', 'whole_phrase', 'partial'];

export function useTanachGematriaMatches(targetRef, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const methodRef = options.methodRef;
  const sequenceRef = options.sequenceRef;
  const orderIndependentRef = options.orderIndependentRef;
  const sourceRef = options.sourceRef;
  const tefillotOccasionRef = options.tefillotOccasionRef;
  const tefillotServiceRef = options.tefillotServiceRef;
  const debounceMs = options.debounceMs ?? 350;
  const limit = options.limit ?? 12;
  const results = ref([]);
  const counts = ref({ whole_word: 0, whole_phrase: 0, partial: 0 });
  const total = ref(0);
  const page = ref(1);
  const filter = ref('all');
  const search = ref('');
  const includeKollel = ref(false);
  const bookOrder = ref(0);
  const parshaId = ref('');
  const chapterBook = ref('');
  const chapter = ref(0);
  const verse = ref(0);
  const currentParshah = ref(false);
  const weeklyParshah = ref(null);
  const loading = ref(false);
  const error = ref('');
  const hasMore = ref(false);
  const sourceCounts = ref({ tanach: 0, tefillot: 0 });

  let timer = null;
  let controller = null;
  let requestId = 0;

  function valueOfTarget() {
    const raw = typeof targetRef === 'function' ? targetRef() : targetRef?.value ?? targetRef;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  function targetForRequest() {
    const target = valueOfTarget();
    if (target === null) return null;
    return target + (
      currentMethod() === 'gematria' && includeKollel.value && kollelAvailable.value ? 1 : 0
    );
  }
  function valueOf(refOrValue) {
    return typeof refOrValue === 'function' ? refOrValue() : refOrValue?.value ?? refOrValue;
  }
  function currentMethod() {
    const method = valueOf(methodRef);
    return ['initials', 'finals'].includes(method) ? method : 'gematria';
  }
  const kollelAvailable = computed(() => {
    const target = valueOfTarget();
    return currentMethod() === 'gematria'
      && target !== null
      && Number.isSafeInteger(target)
      && target < Number.MAX_SAFE_INTEGER;
  });
  function currentSequence() {
    return String(valueOf(sequenceRef) ?? '').trim();
  }
  function currentWordCount() {
    return [...currentSequence()].length;
  }
  function currentOrderIndependent() {
    return currentMethod() !== 'gematria' && valueOf(orderIndependentRef) === true;
  }
  function currentSource() {
    const source = valueOf(sourceRef);
    if (source === 'all' || source === 'tefillot') return source;
    return 'tanach';
  }
  function canRequest() {
    return currentMethod() === 'gematria' ? !!valueOfTarget() : currentWordCount() >= 1;
  }

  function cancel() {
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  }

  async function request(nextPage, append = false) {
    const target = valueOfTarget();
    const method = currentMethod();
    if (!canRequest()) return;
    const currentId = ++requestId;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    loading.value = true;
    error.value = '';

    try {
      const params = new URLSearchParams({
        method,
        page: String(nextPage),
        limit: String(limit),
      });
      if (method === 'gematria') {
        params.set('value', String(targetForRequest()));
        params.set('type', filter.value);
      } else {
        params.set('sequence', currentSequence());
        if (currentOrderIndependent()) params.set('order_independent', 'true');
      }
      if (search.value.trim()) params.set('search', search.value.trim());
       if (bookOrder.value) params.set('book_order', String(bookOrder.value));
       if (parshaId.value) params.set('parsha_id', parshaId.value);
       if (chapterBook.value) params.set('chapter_book', chapterBook.value);
       if (chapter.value) params.set('chapter', String(chapter.value));
       if (verse.value) params.set('verse', String(verse.value));
      if (currentParshah.value) params.set('parsha', 'current');
      const source = currentSource();
      const requests = [];
      if (source !== 'tefillot') {
        requests.push(fetchImpl(`/api/tanach/gematria-matches?${params}`, {
          signal: requestController.signal,
        }).then(async response => {
          if (!response.ok) throw new Error('לא ניתן לטעון התאמות מן התנ״ך');
          return { source: 'tanach', data: await response.json() };
        }));
      }
      if (source !== 'tanach') {
        const tefillotParams = new URLSearchParams(params);
        for (const key of ['book_order', 'parsha_id', 'chapter_book', 'chapter', 'verse', 'parsha']) {
          tefillotParams.delete(key);
        }
        const occasion = String(valueOf(tefillotOccasionRef) || '');
        const service = String(valueOf(tefillotServiceRef) || '');
        if (occasion) tefillotParams.set('occasion', occasion);
        if (service) tefillotParams.set('service', service);
        requests.push(fetchImpl(`/api/tefillot/gematria-matches?${tefillotParams}`, {
          signal: requestController.signal,
        }).then(async response => {
          if (!response.ok) throw new Error('לא ניתן לטעון התאמות מן התפילות');
          return { source: 'tefillot', data: await response.json() };
        }));
      }
      const outcomes = await Promise.allSettled(requests);
      const payloads = outcomes
        .filter(outcome => outcome.status === 'fulfilled')
        .map(outcome => outcome.value);
      if (payloads.length === 0) {
        throw outcomes.find(outcome => outcome.status === 'rejected')?.reason
          || new Error('אירעה שגיאה בטעינת ההתאמות');
      }
      if (source !== 'all' && outcomes.some(outcome => outcome.status === 'rejected')) {
        throw outcomes.find(outcome => outcome.status === 'rejected').reason;
      }
      if (currentId !== requestId || requestController.signal.aborted) return;
      const bySource = Object.fromEntries(payloads.map(item => [item.source, item.data]));
      const tanachResults = (bySource.tanach?.results || []).map(item => ({ ...item, sourceType: 'tanach' }));
      const tefillotResults = bySource.tefillot?.results || [];
      const incoming = [];
      for (let index = 0; index < Math.max(tanachResults.length, tefillotResults.length); index += 1) {
        if (tanachResults[index]) incoming.push(tanachResults[index]);
        if (tefillotResults[index]) incoming.push(tefillotResults[index]);
      }
      results.value = append ? [...results.value, ...incoming] : incoming;
      if (!(append && outcomes.some(outcome => outcome.status === 'rejected'))) {
        counts.value = ['all', 'whole_word', 'whole_phrase', 'partial'].reduce((result, key) => {
          result[key] = Number(bySource.tanach?.counts?.[key] || 0) + Number(bySource.tefillot?.counts?.[key] || 0);
          return result;
        }, {});
      }
      sourceCounts.value = {
        tanach: bySource.tanach
          ? Number(bySource.tanach.total || 0)
          : (append ? sourceCounts.value.tanach : 0),
        tefillot: bySource.tefillot
          ? Number(bySource.tefillot.total || 0)
          : (append ? sourceCounts.value.tefillot : 0),
      };
      total.value = sourceCounts.value.tanach + sourceCounts.value.tefillot;
      page.value = nextPage;
      hasMore.value = payloads.some(item => item.data.hasMore === true);
      weeklyParshah.value = bySource.tanach?.weeklyParshah
        || (append ? weeklyParshah.value : null);
    } catch (reason) {
      if (reason?.name !== 'AbortError' && currentId === requestId) {
        error.value = reason?.message || 'אירעה שגיאה בטעינת ההתאמות';
      }
    } finally {
      if (currentId === requestId) {
        loading.value = false;
        if (controller === requestController) controller = null;
      }
    }
  }

  function schedule() {
    cancel();
    requestId += 1;
    results.value = [];
    counts.value = { whole_word: 0, whole_phrase: 0, partial: 0 };
    total.value = 0;
    page.value = 1;
    hasMore.value = false;
    weeklyParshah.value = null;
    sourceCounts.value = { tanach: 0, tefillot: 0 };
    error.value = '';
    if (!canRequest()) {
      loading.value = false;
      return;
    }
    loading.value = true;
    timer = setTimeout(() => request(1), debounceMs);
  }

  function setFilter(nextFilter) {
    if (!FILTERS.includes(nextFilter) || filter.value === nextFilter) return;
    filter.value = nextFilter;
    schedule();
  }

  function setSearch(nextSearch) {
    const nextValue = String(nextSearch ?? '');
    if (search.value === nextValue) return;
    search.value = nextValue;
    schedule();
  }

  function setIncludeKollel(nextValue) {
    const next = nextValue === true;
    if (includeKollel.value === next) return;
    includeKollel.value = next;
    schedule();
  }

  function setBookOrder(nextBookOrder) {
    const nextValue = Number(nextBookOrder) || 0;
    if (bookOrder.value === nextValue && !parshaId.value && !chapter.value && !currentParshah.value) return;
    bookOrder.value = nextValue;
    parshaId.value = '';
    chapterBook.value = '';
    chapter.value = 0;
    verse.value = 0;
    currentParshah.value = false;
    schedule();
  }

  function setParshaId(nextParshaId) {
    const nextValue = String(nextParshaId ?? '');
    if (parshaId.value === nextValue && !currentParshah.value) return;
    parshaId.value = nextValue;
    chapterBook.value = '';
    chapter.value = 0;
    verse.value = 0;
    currentParshah.value = false;
    schedule();
  }

  function setChapter(nextChapterBook, nextChapter) {
    const nextBook = String(nextChapterBook ?? '');
    const nextValue = Number(nextChapter) || 0;
    if (chapterBook.value === nextBook && chapter.value === nextValue && !verse.value && !currentParshah.value) return;
    chapterBook.value = nextBook;
    chapter.value = nextValue;
    verse.value = 0;
    currentParshah.value = false;
    schedule();
  }

  function setVerse(nextVerse) {
    const nextValue = Number(nextVerse) || 0;
    if (verse.value === nextValue && !currentParshah.value) return;
    verse.value = nextValue;
    currentParshah.value = false;
    schedule();
  }

  function toggleCurrentParshah() {
    currentParshah.value = !currentParshah.value;
    if (currentParshah.value) {
      bookOrder.value = 0;
      parshaId.value = '';
      chapterBook.value = '';
      chapter.value = 0;
      verse.value = 0;
    }
    schedule();
  }

  function refresh() {
    schedule();
  }

  function loadMore() {
    if (loading.value || !hasMore.value) return;
    return request(page.value + 1, true);
  }

  const stop = watch(
    () => [
      valueOfTarget(),
      currentMethod(),
      currentSequence(),
      currentWordCount(),
      currentOrderIndependent(),
      currentSource(),
      valueOf(tefillotOccasionRef),
      valueOf(tefillotServiceRef),
      includeKollel.value,
    ],
    () => {
      if (includeKollel.value && !kollelAvailable.value) {
        includeKollel.value = false;
        return;
      }
      schedule();
    },
    { immediate: true, flush: 'sync' },
  );

  function dispose() {
    requestId += 1;
    cancel();
    stop();
  }
  if (getCurrentScope()) onScopeDispose(dispose);

  return {
    results, counts, total, sourceCounts, loading, error, filter, search, includeKollel, bookOrder, parshaId, chapterBook, chapter, verse, currentParshah, weeklyParshah,
    page, hasMore, setFilter, setSearch, setIncludeKollel, setBookOrder, setParshaId, setChapter, setVerse, toggleCurrentParshah, loadMore, refresh, stop: dispose,
  };
}