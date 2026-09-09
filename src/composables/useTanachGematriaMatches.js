import { getCurrentScope, onScopeDispose, ref, watch } from 'vue';

const FILTERS = ['all', 'whole_word', 'whole_phrase', 'partial'];

export function useTanachGematriaMatches(targetRef, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const methodRef = options.methodRef;
  const sequenceRef = options.sequenceRef;
  const orderIndependentRef = options.orderIndependentRef;
  const debounceMs = options.debounceMs ?? 350;
  const limit = options.limit ?? 12;
  const results = ref([]);
  const counts = ref({ whole_word: 0, whole_phrase: 0, partial: 0 });
  const total = ref(0);
  const page = ref(1);
  const filter = ref('all');
  const search = ref('');
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

  let timer = null;
  let controller = null;
  let requestId = 0;

  function valueOfTarget() {
    const raw = typeof targetRef === 'function' ? targetRef() : targetRef?.value ?? targetRef;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  function valueOf(refOrValue) {
    return typeof refOrValue === 'function' ? refOrValue() : refOrValue?.value ?? refOrValue;
  }
  function currentMethod() {
    const method = valueOf(methodRef);
    return ['initials', 'finals'].includes(method) ? method : 'gematria';
  }
  function currentSequence() {
    return String(valueOf(sequenceRef) ?? '').trim();
  }
  function currentWordCount() {
    return [...currentSequence()].length;
  }
  function currentOrderIndependent() {
    return currentMethod() !== 'gematria' && valueOf(orderIndependentRef) === true;
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
        params.set('value', String(target));
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
      const response = await fetchImpl(`/api/tanach/gematria-matches?${params}`, {
        signal: requestController.signal,
      });
      if (!response.ok) throw new Error('לא ניתן לטעון התאמות מן התנ״ך');
      const data = await response.json();
      if (currentId !== requestId || requestController.signal.aborted) return;
      const incoming = Array.isArray(data.results) ? data.results : [];
      results.value = append ? [...results.value, ...incoming] : incoming;
      counts.value = data.counts || { whole_word: 0, whole_phrase: 0, partial: 0 };
      total.value = Number(data.total) || 0;
      page.value = Number(data.page) || nextPage;
      hasMore.value = data.hasMore === true;
      weeklyParshah.value = data.weeklyParshah || null;
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
    request(page.value + 1, true);
  }

  const stop = watch(
    () => [
      valueOfTarget(),
      currentMethod(),
      currentSequence(),
      currentWordCount(),
      currentOrderIndependent(),
    ],
    schedule,
    { immediate: true, flush: 'sync' },
  );

  function dispose() {
    requestId += 1;
    cancel();
    stop();
  }
  if (getCurrentScope()) onScopeDispose(dispose);

  return {
    results, counts, total, loading, error, filter, search, bookOrder, parshaId, chapterBook, chapter, verse, currentParshah, weeklyParshah,
    page, hasMore, setFilter, setSearch, setBookOrder, setParshaId, setChapter, setVerse, toggleCurrentParshah, loadMore, refresh, stop: dispose,
  };
}