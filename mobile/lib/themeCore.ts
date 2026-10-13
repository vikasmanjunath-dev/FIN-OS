// Light-theme colour mapping. The app's screens are written against the dark palette (constants/theme.ts); in light mode every
// colour a component is about to draw is mapped here. Pure: a colour string in, a colour string out.
//   • the palette tokens map to a hand-tuned light value (text, surfaces, borders, accents with enough contrast on white);
//   • white overlays become dark overlays (rgba(255,255,255,a) -> rgba(15,23,42,a));
//   • accents with an alpha keep their alpha and get the darker accent;
//   • anything unknown is darkened if it is a bright colour, left alone if it is already dark.
// Shadows and transparent colours are never touched.

export const COLOR_KEYS = ['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
  'borderStartColor', 'borderEndColor', 'textDecorationColor', 'tintColor', 'overlayColor', 'outlineColor'] as const;

/** exact dark value (upper-case hex or rgba without spaces) -> light value */
const TOKENS: Record<string, string> = {
  '#080B14': '#F4F6FA', '#0D1117': '#FFFFFF', '#111827': '#EEF2F8',
  '#F5F7FA': '#0F172A', '#8892A4': '#475569',
  '#00D4FF': '#075985', '#22D3A6': '#065F46', '#7B2FF7': '#6D28D9', '#B28CFF': '#6D28D9', '#F0A500': '#92400E', '#FF4444': '#B91C1C', '#FF6B35': '#A3330A',
  '#FFB347': '#92400E', '#FF6B6B': '#B91C1C', '#4F7CFF': '#2447C7', '#34D399': '#065F46', '#60A5FA': '#1E40AF', '#A78BFA': '#6D28D9', '#C7F000': '#3F6212',
  '#F97316': '#A3330A', '#EF4444': '#B91C1C', '#FFA07A': '#A3330A',
  'RGBA(255,255,255,0.03)': 'rgba(15,23,42,0.04)', 'RGBA(255,255,255,0.06)': 'rgba(15,23,42,0.10)', 'RGBA(255,255,255,0.12)': 'rgba(15,23,42,0.16)',
  'RGBA(255,255,255,0.2)': 'rgba(15,23,42,0.28)', 'RGBA(255,255,255,0.5)': '#4F5F76',
};

/** rgb of the accent tokens, so rgba(accent, alpha) keeps the alpha and takes the darker accent */
const ACCENT_RGB: Record<string, [number, number, number]> = {};
['#00D4FF', '#22D3A6', '#7B2FF7', '#B28CFF', '#F0A500', '#FF4444', '#FF6B35', '#4F7CFF', '#FFB347', '#FF6B6B', '#34D399', '#60A5FA', '#A78BFA', '#C7F000', '#F97316', '#EF4444'].forEach(h => {
  const p = parseHex(h)!; ACCENT_RGB[`${p.r},${p.g},${p.b}`] = hexToRgb(TOKENS[h]);
});

function parseHex(s: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = h.split('').map(c => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}
function hexToRgb(h: string): [number, number, number] { const p = parseHex(h)!; return [p.r, p.g, p.b]; }
function parseRgba(s: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s.trim());
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}
const rgba = (r: number, g: number, b: number, a: number) => (a >= 1 ? `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`);

function hslOf(r: number, g: number, b: number) {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === R ? ((G - B) / d + (G < B ? 6 : 0)) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}
function rgbOfHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const cache = new Map<string, string>();
/** Every colour this module can return. Mapping one of them again leaves it alone: a style that passes through two themed
 *  components (a TouchableOpacity renders a View) must not be flipped twice. */
const produced = new Set<string>();
const canon = (c: string) => c.trim().replace(/\s+/g, '').toUpperCase();
Object.values(TOKENS).forEach(v => produced.add(canon(v)));
produced.add('#FFFFFF'); produced.add('#F4F6FA'); produced.add('#0F172A');

/** The light-mode value of a colour. `key` is the style property it came from (shadows are left alone). */
export function lightColor(input: string, key?: string): string {
  if (typeof input !== 'string' || !input) return input;
  if (key === 'shadowColor' || key === 'textShadowColor') return input;
  const hit = cache.get(input);
  if (hit !== undefined) return hit;
  let out: string;
  const k = canon(input);
  if (produced.has(k) || /^RGBA\(15,23,42,[\d.]+\)$/.test(k)) out = input;           // already a light-theme colour
  else { out = compute(input); produced.add(canon(out)); }
  if (cache.size < 2000) cache.set(input, out);
  return out;
}

function compute(input: string): string {
  const t = input.trim();
  if (t === 'transparent') return input;
  const hex = t.toUpperCase();
  if (TOKENS[hex]) return TOKENS[hex];
  const compact = t.replace(/\s+/g, '').toUpperCase();
  if (TOKENS[compact]) return TOKENS[compact];
  const c = parseHex(t) ?? parseRgba(t);
  if (!c) return input;                               // named colour or something else: leave it
  const norm = `RGBA(${+c.r},${+c.g},${+c.b},${+c.a})`;      // 0.50 and 0.5 are the same token
  if (TOKENS[norm]) return TOKENS[norm];
  if (c.a === 0) return input;
  const solid = c.a >= 1;
  // eight-digit hex of a token (colour + '30'): map the colour, keep the alpha
  const base = rgba(c.r, c.g, c.b, 1);
  if (!solid && TOKENS[base]) { const [r, g, b] = hexToRgb(TOKENS[base]); return rgba(r, g, b, c.a); }
  const key = `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
  if (ACCENT_RGB[key]) { const [r, g, b] = ACCENT_RGB[key]; return rgba(r, g, b, c.a); }
  const white = c.r >= 245 && c.g >= 245 && c.b >= 245, black = c.r <= 12 && c.g <= 12 && c.b <= 12;
  if (white) return solid ? input : rgba(15, 23, 42, c.a);                 // a solid white (knob, text on a fill) stays; an overlay flips
  if (black) return solid ? '#FFFFFF' : input;                              // dark text on a bright fill becomes light text on the darker fill; scrims stay
  const { h, s, l } = hslOf(c.r, c.g, c.b);
  if (l > 0.72 && s < 0.25) return rgba(15, 23, 42, c.a);                  // near-white neutral
  if (l < 0.18) return solid ? '#F4F6FA' : input;                           // a near-black surface becomes the light page; scrims stay
  if (l > 0.42) { const [r, g, b] = rgbOfHsl(h, Math.max(s, 0.5), 0.36); return rgba(r, g, b, c.a); }
  return input;
}

/** Maps the colour entries of a flat style object; returns the same object when nothing changed. */
export function lightStyle<T extends Record<string, any>>(style: T): T {
  let out: Record<string, any> | null = null;
  for (const k of COLOR_KEYS) {
    const v = style[k];
    if (typeof v === 'string') {
      const m = lightColor(v, k);
      if (m !== v) { if (!out) out = { ...style }; out[k] = m; }
    }
  }
  return (out ?? style) as T;
}

// ── contrast helpers (used by the tests and the settings preview) ───────────────────────────────────────────────────────────
function lum(r: number, g: number, b: number) {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(fg: string, bg: string): number {
  const a = parseHex(fg), b = parseHex(bg);
  if (!a || !b) return 0;
  const L1 = lum(a.r, a.g, a.b), L2 = lum(b.r, b.g, b.b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
export const LIGHT_BG = '#F4F6FA';
export const LIGHT_SURFACE = '#FFFFFF';
export const LIGHT_TOKENS = TOKENS;
