/** Shared, deterministic Persian search. No network or inferred product attributes. */
export function latinDigits(value) {
  return String(value ?? '').replace(/[۰-۹٠-٩]/g, char =>
    String('۰۱۲۳۴۵۶۷۸۹'.includes(char) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(char) : '٠١٢٣٤٥٦٧٨٩'.indexOf(char)));
}
export function parseAmount(value) {
  const text = latinDigits(value).replace(/[,٬\s]/g, '').replace(/٫/g, '.');
  if (!text || !/^\d+(?:\.\d+)?$/.test(text)) return 0;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}
export function normalizeSearch(value) {
  return latinDigits(value).toLowerCase().replace(/ي|ى/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u200e\u200f]/g, '')
    .replace(/[\u200c\s\-_/،]+/g, ' ').trim()
    .replace(/لپ\s*تاپ|laptop/g, 'لپ تاپ')
    .replace(/کتونی/g, 'کتانی').replace(/آیفون|ایفون|iphone/g, 'آیفون');
}
export function parseSearchIntent(value) {
  let query = normalizeSearch(value), budget = null;
  const match = query.match(/(?:تا|زیر|حداکثر|بودجه)\s+(\d+(?:[.٫]\d+)?)\s*(میلیون|هزار)?(?:\s*تومان)?/);
  if (match) {
    const multiplier = match[2] === 'میلیون' ? 1e6 : match[2] === 'هزار' ? 1e3 : 1;
    budget = parseAmount(match[1]) * multiplier;
    if (!Number.isSafeInteger(budget) || budget <= 0) budget = null;
    if (budget) query = (query.slice(0, match.index) + ' ' + query.slice(match.index + match[0].length)).trim();
  }
  return {query: query.replace(/\s+/g, ' '), budget};
}
const normalizedRows = new WeakMap();
export function matchesQuery(row, query) {
  let text = normalizedRows.get(row);
  if (!text) { text = normalizeSearch(row[1] + ' ' + row[2]); normalizedRows.set(row, text); }
  return normalizeSearch(query).split(' ').filter(Boolean).every(term => text.includes(term));
}
