const pdfFailure = message => Object.assign(new Error(message), { userMessage: message });

export async function downloadSavedMatchesPdf({ params }, { signal } = {}) {
  const query = params instanceof URLSearchParams ? Object.fromEntries(params) : { ...params };
  delete query.page;
  delete query.limit;
  delete query.offset;
  delete query.focus;
  const response = await fetch('/api/entries/curated-matches/export.pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw pdfFailure({
      pdf_busy: 'כבר נוצר דוח. אפשר לנסות שוב בעוד רגע.',
      pdf_too_large: 'הדוח גדול מדי. אפשר לבחור פרשה או לצמצם את הסינון ולנסות שוב.',
      pdf_unavailable: 'לא ניתן ליצור PDF כרגע. אפשר לנסות שוב בעוד רגע.',
      not_authenticated: 'תוקף הכניסה פג. יש להיכנס מחדש כדי להוריד את הדוח.',
    }[data.error] || 'יצירת ה־PDF נכשלה. אפשר לנסות שוב.');
  }
  if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
    throw pdfFailure('הדוח לא התקבל כראוי. אפשר לנסות שוב.');
  }
  const blob = await response.blob();
  if (await blob.slice(0, 5).text() !== '%PDF-') throw pdfFailure('הדוח לא התקבל כראוי.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
    || 'gematria-saved-matches.pdf';
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { filename, count: Number(response.headers.get('x-result-count')) };
}
