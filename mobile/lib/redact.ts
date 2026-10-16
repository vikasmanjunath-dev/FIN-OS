// Redaction for anything that is stored for feedback, usage or crash reports: figures, identifiers and contact details are
// removed BEFORE a value is written, so what is on the phone (and anything the person later shares) never held them.
//
// `redactBase` is a line-for-line port of FinosFeedback.redact in js/finos-feedback.js (the website). A parity test runs the real
// website file against it on adversarial and random input, so the two cannot drift apart.
//
// `redact` is what the phone uses: the website's rules PLUS the cases that rule leaves through. Found by the parity corpus:
//   - UPI handles ("rahul@okhdfcbank", "9876543210@ybl"): no dot, so the website's e-mail rule does not see them
//   - digits split by spaces or dashes ("98 76 54 32 10", "12-34-56"): every piece is under four digits
//   - lower-case PAN ("abcde1234f") and IFSC codes
//   - amounts in words ("five lakh", "twenty five thousand") and short amounts with a unit ("500 rupees", "$25")
// What no pattern can remove: a name or an address written in words. The screens that take free text say so.
// Pure: no React Native imports.

export const MAX_COMMENT = 500;

/** The website's rule, unchanged. Exported for the parity test. */
export function redactBase(text: unknown): string {
  let t = String(text == null ? '' : text);
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');                                   // emails
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]');                                    // links
  t = t.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[id]');                                           // PAN
  t = t.replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[id]');                                    // Aadhaar-style
  t = t.replace(/(?:₹|\brs\.?|\binr\b)\s*\d(?:[\d,.]*\d)?(?:\s*(?:lakhs?|lacs?|crores?|cr|k|l)\b)?/gi, '[amount]');   // ₹1,50,000 / Rs 5 lakh
  t = t.replace(/\b\d+(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr|k)\b/gi, '[amount]');           // 12 lakh, 5k
  t = t.replace(/\d[\d,.]*/g, (m) => {                                                        // any run holding 4+ digits, even glued to letters ("ref1234")
    const core = m.replace(/[,.]+$/, '');
    return core.replace(/\D/g, '').length >= 4 ? '[number]' + m.slice(core.length) : m;
  });
  return t.replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT);
}

const SMALL_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half';
const WORDS_AMOUNT = new RegExp(`\\b(?:(?:${SMALL_WORDS})[\\s-]+)+(?:lakhs?|lacs?|crores?|thousand|million|billion)\\b`, 'gi');

/** Digits of other scripts (Devanagari "९८७६५४३२१०", Arabic-Indic, full-width) become ASCII digits, so every digit rule below sees them. */
function asciiDigits(s: string): string {
  if (!/[^\x00-\x7f]/.test(s)) return s;
  const isNd = (cp: number) => /^\p{Nd}$/u.test(String.fromCodePoint(cp));
  return s.replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0)!;
    if (cp < 128) return ch;
    let start = cp;
    while (start > 0 && cp - start < 9 && isNd(start - 1)) start--;
    const v = (cp - start) % 10;
    return String(v);
  });
}

/** Applied before the website's rule, so a handle is not left half-redacted ("[number]@ybl"). */
function before(raw: string): string {
  let t = asciiDigits(raw);
  t = t.replace(/(?:https?:\/\/|www\.)\S+/gi, '[link]');                                        // a link glued to a word has no word boundary for the website's rule
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');                                    // same e-mail rule, so "a@b.com" is one token
  t = t.replace(/[\w.-]+@\w[\w-]*/g, '[upi]');                                 // UPI handle: name@bank, 98xxxxxxxx@ybl
  t = t.replace(/\b[a-z]{5}\d{4}[a-z]\b/gi, '[id]');                                          // PAN in any case
  t = t.replace(/\b[a-z]{4}0[a-z0-9]{6}\b/gi, (m) => (/\d/.test(m) ? '[id]' : m));            // IFSC (needs a digit, so a long word is left alone)
  return t;
}

/** Applied after the website's rule, on what it leaves. */
function after(t: string): string {
  let s = t;
  s = s.replace(/\d+(?:[ /-]\d+)+/g, (m) => (m.replace(/\D/g, '').length >= 6 ? '[number]' : m));   // "98 76 54 32 10", "12/10/26"
  s = s.replace(/\b\d[\d,]*(?:\.\d+)?\s*(?:rupees?|rs\.?|inr|rupaye|paise)\b/gi, '[amount]');   // "500 rupees"
  s = s.replace(/[$€£]\s*\d[\d,.]*(?:\s*(?:k|m|mn|bn|million|billion|thousand)\b)?/gi, '[amount]');   // "$25"
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:thousand|million|billion|mn|bn)\b/gi, '[amount]');
  s = s.replace(WORDS_AMOUNT, '[amount]');                                                      // "five lakh", "twenty-five thousand"
  return s;
}

function once(text: string): string {
  let t = redactBase(before(text));
  t = after(t);
  return t.replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT);
}

/** What the phone stores and shares. Runs until nothing changes (a replacement can create a new word boundary), so redact(redact(x)) === redact(x). */
export function redact(text: unknown): string {
  let t = once(String(text == null ? '' : text));
  for (let i = 0; i < 4; i++) {
    const next = once(t);
    if (next === t) break;
    t = next;
  }
  return t;
}

/** A short single-line version for error messages and other machine text (shorter cap, quoted free text removed). */
export function redactShort(text: unknown, max = 160): string {
  const r = redact(String(text == null ? '' : text).slice(0, 2000));
  return r.slice(0, max);
}
