// FIN·OS Bloomberg Dark Design System
// Mirrors css/design-tokens.css from the web app

export const Colors = {
  // Backgrounds
  bg:        '#080B14',   // page background
  surface:   '#0D1117',   // card surface
  surfaceAlt:'#111827',   // elevated card
  overlay:   'rgba(255,255,255,0.03)',

  // Borders
  border:    'rgba(255,255,255,0.06)',
  borderMed: 'rgba(255,255,255,0.12)',
  borderHi:  'rgba(255,255,255,0.20)',

  // Brand accents
  cyan:      '#00D4FF',
  teal:      '#22D3A6',
  purple:    '#7B2FF7',
  purpleInk: '#B28CFF',   // purple for TEXT on dark surfaces (7.6:1; #7B2FF7 is 3.4:1 and only fine for fills)
  gold:      '#F0A500',
  red:       '#FF4444',
  orange:    '#FF6B35',

  // Text
  textPrimary: '#F5F7FA',
  textMuted:   '#8892A4',
  textDim:     'rgba(255,255,255,0.50)',   // 5.3:1 on bg; 0.30 was 2.6:1 and failed contrast for text

  // Gradients (as arrays for LinearGradient)
  gradientCard:  ['#0D1117', '#111827'] as const,
  gradientCyan:  ['rgba(0,212,255,0.15)', 'rgba(0,212,255,0.0)'] as const,
  gradientTeal:  ['rgba(34,211,166,0.15)', 'rgba(34,211,166,0.0)'] as const,
  gradientPurple:['rgba(123,47,247,0.15)', 'rgba(123,47,247,0.0)'] as const,
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const Radii = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  full: 9999,
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: Colors.textPrimary },
  h2: { fontSize: 22, fontWeight: '700' as const, color: Colors.textPrimary },
  h3: { fontSize: 18, fontWeight: '700' as const, color: Colors.textPrimary },
  body: { fontSize: 14, fontWeight: '400' as const, color: Colors.textPrimary },
  caption: { fontSize: 12, fontWeight: '400' as const, color: Colors.textMuted },
  label: { fontSize: 11, fontWeight: '600' as const, color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  mono: { fontSize: 13, fontFamily: 'monospace' as const, color: Colors.textPrimary },
};

/** Shared button geometry. Every button is at least 48 px tall (Apple asks 44 pt, Android 48 dp), uses the same corner radius and the
 *  same label size, so screens stop inventing their own. Colours stay per screen (the accent of the feature it belongs to). */
export const Btn = {
  base: { minHeight: 48, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 12, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: Spacing.sm },
  text: { fontSize: 15, fontWeight: '800' as const },
  small: { minHeight: 44, borderRadius: Radii.full, paddingHorizontal: Spacing.md, paddingVertical: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  link: { minHeight: 44, justifyContent: 'center' as const },
};
