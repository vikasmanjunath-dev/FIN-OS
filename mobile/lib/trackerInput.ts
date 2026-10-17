export type InputResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Keep tracker amounts precise to paise and below the largest safely representable integer number of paise.
export const MAX_TRACKER_RUPEES = Number.MAX_SAFE_INTEGER / 100;

/** Parse the exact text in a rupee field. Invalid text is never silently converted to zero. */
export function parseTrackerMoney(raw: string): InputResult<number> {
  const value = raw.trim().replace(/[₹\s]/g, '');
  if (value === '') return { ok: true, value: 0 };
  const valid = /^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(value);
  if (!valid) return { ok: false, error: 'Enter a non-negative amount with up to two decimal places.' };

  const digits = value.replace(/,/g, '');
  const [whole, fraction = ''] = digits.split('.');
  const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: 'That amount is too large to track accurately.' };
  }
  return { ok: true, value: Number(paise) / 100 };
}

/** Parse bounded numeric fields without silently clamping invalid or out-of-range input. */
export function parseTrackerNumber(raw: string, min: number, max?: number): InputResult<number> {
  const value = raw.trim();
  if (!value || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
    return { ok: false, error: 'Enter a valid number.' };
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return { ok: false, error: 'Enter a finite number.' };
  if (number < min || (max != null && number > max)) {
    const range = max == null ? `at least ${min}` : `between ${min} and ${max}`;
    return { ok: false, error: `Enter a number ${range}.` };
  }
  return { ok: true, value: number };
}
