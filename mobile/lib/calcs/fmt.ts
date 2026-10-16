// The number formats the website's calculator pages use. They differ slightly from page to page (whether the amount is
// rounded first, which locale groups the digits), and the phone shows exactly what the page shows, so each is kept.

// An overflowed or empty input gives a dash on the website pages (never Infinity or NaN); the phone matches.
const bad = (n: number) => typeof n === 'number' && !Number.isFinite(n);

/** ₹1.25 Cr / ₹4.50 L / ₹12,345 (rounded). The most common one. */
export const money = (n: number): string =>
  bad(n) ? '—' : n >= 10000000 ? '₹' + (n / 10000000).toFixed(2) + ' Cr' : n >= 100000 ? '₹' + (n / 100000).toFixed(2) + ' L' : '₹' + Math.round(n).toLocaleString();

/** Same, but amounts under ₹1 L are not rounded first. */
export const moneyRaw = (n: number): string =>
  bad(n) ? '—' : n >= 10000000 ? '₹' + (n / 10000000).toFixed(2) + ' Cr' : n >= 100000 ? '₹' + (n / 100000).toFixed(2) + ' L' : '₹' + n.toLocaleString();

/** Same, grouping digits the Indian way. */
export const moneyIN = (n: number): string =>
  bad(n) ? '—' : n >= 10000000 ? '₹' + (n / 10000000).toFixed(2) + ' Cr' : n >= 100000 ? '₹' + (n / 100000).toFixed(2) + ' L' : '₹' + n.toLocaleString('en-IN');

/** Same as `money` with a minus sign in front of negatives. */
export const moneySigned = (n: number): string =>
  bad(n) ? '—' : n < 0 ? '-₹' + Math.abs(n).toLocaleString() : money(n);

/** ₹12,345 (rounded, no lakh/crore shortening). */
export const rupee = (n: number): string => bad(n) ? '—' : '₹' + Math.round(n).toLocaleString();

/** ₹12,345 not rounded. */
export const rupeeRaw = (n: number): string => bad(n) ? '—' : '₹' + n.toLocaleString();

/** x.toFixed(d), or a dash when x is NaN or infinite (an empty or zero box on the website page). */
export const fx = (x: number, d: number): string => (Number.isFinite(x) ? x.toFixed(d) : '—');
