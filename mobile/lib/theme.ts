// The person's appearance choice (system / dark / light) and the patch that makes every screen follow it.
// Screens are written against the dark palette; in light mode the core components map the colours they are about to draw.
import { useSyncExternalStore } from 'react';
import { Appearance, StyleSheet, View, Text, TextInput, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, Switch, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLOR_KEYS, lightColor, lightStyle } from '@/lib/themeCore';

export type ThemeChoice = 'system' | 'dark' | 'light';
export type ThemeMode = 'dark' | 'light';
export const THEME_KEY = 'finos_theme_mobile';

let choice: ThemeChoice = 'dark';
let mode: ThemeMode = 'dark';
const listeners = new Set<() => void>();

const systemMode = (): ThemeMode => (Appearance.getColorScheme() === 'light' ? 'light' : 'dark');
const resolve = (c: ThemeChoice): ThemeMode => (c === 'system' ? systemMode() : c);
function apply(c: ThemeChoice) {
  choice = c;
  const next = resolve(c);
  if (next !== mode) { mode = next; listeners.forEach(l => l()); }
}
Appearance.addChangeListener(() => { if (choice === 'system') apply('system'); });

export const getThemeChoice = () => choice;
export const getMode = (): ThemeMode => mode;
export function useMode(): ThemeMode { return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => mode, () => mode); }

export async function loadTheme(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw === 'system' || raw === 'dark' || raw === 'light') apply(raw);
  } catch { /* keep dark */ }
}
export async function setThemeChoice(c: ThemeChoice): Promise<void> {
  apply(c);
  try { await AsyncStorage.setItem(THEME_KEY, c); } catch { /* not remembered */ }
}

/** For the few places that draw colours outside a core component (SVG, gradients, status bar). Dark values pass through unchanged. */
export function useThemed(): (c: string) => string {
  const m = useMode();
  return (c: string) => (m === 'light' ? lightColor(c) : c);
}
export const themedColors = (arr: readonly string[], m: ThemeMode = mode): string[] => (m === 'light' ? arr.map(c => lightColor(c)) : [...arr]);

// ── the patch ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PROP_COLORS = ['placeholderTextColor', 'selectionColor', 'underlineColorAndroid', 'tintColor', 'color', 'underlayColor', 'thumbColor', 'activeThumbColor', 'ios_backgroundColor'];
let installed = false;

function themeStyle(style: any): any {
  if (style == null) return style;
  if (typeof style === 'function') return (...a: any[]) => themeStyle(style(...a));
  return lightStyle(StyleSheet.flatten(style) as any);
}

function themeProps(props: any): any {
  if (props == null) return props;
  let out: any = null;
  const set = (k: string, v: any) => { if (!out) out = { ...props }; out[k] = v; };
  for (const k of ['style', 'contentContainerStyle', 'columnWrapperStyle', 'indicatorStyle']) {
    if (props[k] != null && k !== 'indicatorStyle') { const m = themeStyle(props[k]); if (m !== props[k]) set(k, m); }
  }
  for (const k of PROP_COLORS) {
    const v = props[k];
    if (typeof v === 'string') { const m = lightColor(v); if (m !== v) set(k, m); }
  }
  if (props.trackColor && typeof props.trackColor === 'object') {
    const t: any = {}; let changed = false;
    for (const k of Object.keys(props.trackColor)) { const v = props.trackColor[k]; const m = typeof v === 'string' ? lightColor(v) : v; t[k] = m; if (m !== v) changed = true; }
    if (changed) set('trackColor', t);
  }
  if (Array.isArray(props.colors)) {
    const m = props.colors.map((c: any) => (typeof c === 'string' ? lightColor(c) : c));
    set('colors', m);
  }
  return out ?? props;
}

/** Text grows with the person's system font size up to twice its size (WCAG asks for 200%); beyond that fixed-size cards would clip. */
export const MAX_FONT_SCALE = 2;

/** Every touchable is at least 44 x 44: Apple's guideline, and 24 dp above WCAG 2.2 AA. The size is set here once instead of on 56 screens, so a
 *  new button cannot forget it. Overlays (absolute-positioned backdrops), controls the author hid from assistive technology and styles that
 *  already ask for 44 or more are left alone. */
const MIN_TARGET = 44;
function withTouchTarget(props: any): any {
  if (!props || props.accessible === false || props.importantForAccessibility === 'no' || typeof props.style === 'function') return props;
  const st: any = StyleSheet.flatten(props.style) ?? {};
  if (st.position === 'absolute') return props;
  const extra: any = {};
  if ((st.minHeight == null || st.minHeight < MIN_TARGET) && (typeof st.height !== 'number' || st.height < MIN_TARGET)) extra.minHeight = MIN_TARGET;
  if ((st.minWidth == null || st.minWidth < MIN_TARGET) && (typeof st.width !== 'number' || st.width < MIN_TARGET) && st.flex == null && st.flexGrow == null) extra.minWidth = MIN_TARGET;   // icon buttons and short chips; anything that stretches is already wide
  if (!extra.minHeight && !extra.minWidth) return props;
  // A small control that is made taller than its content keeps that content in the middle (a column container would put it at the top).
  // Padded cards and rows (padding >= 12) are laid out by their author and are left exactly as written.
  const pad = Math.max(Number(st.padding) || 0, Number(st.paddingVertical) || 0, ((Number(st.paddingTop) || 0) + (Number(st.paddingBottom) || 0)) / 2);
  if (pad < 12) {
    const row = st.flexDirection === 'row' || st.flexDirection === 'row-reverse';
    if (!row && st.justifyContent == null) extra.justifyContent = 'center';
    if (row && st.alignItems == null) extra.alignItems = 'center';
  }
  return { ...props, style: [props.style, extra] };
}

/** Single-line text fields are at least 44 px tall (multi-line ones grow past it anyway). */
function withInputHeight(props: any): any {
  if (!props || props.multiline) return props;
  const st: any = StyleSheet.flatten(props.style) ?? {};
  if ((st.minHeight != null && st.minHeight >= MIN_TARGET) || (typeof st.height === 'number' && st.height >= MIN_TARGET)) return props;
  return { ...props, style: [props.style, { minHeight: MIN_TARGET }] };
}

function wrap(component: any, capFont = false, touch: boolean | 'input' = false) {
  if (!component) return;
  const target = typeof component.render === 'function' ? component : component.type && typeof component.type.render === 'function' ? component.type : null;
  if (!target || target.__finosThemed) return;
  const orig = target.render;
  target.render = function (props: any, ref: any) {
    const m = useMode();                                  // every wrapped component redraws when the choice changes: no screen reload
    let p = m === 'light' ? themeProps(props) : props;
    if (capFont && p && p.maxFontSizeMultiplier == null) p = { ...p, maxFontSizeMultiplier: MAX_FONT_SCALE };
    if (touch === true) p = withTouchTarget(p); else if (touch === 'input') p = withInputHeight(p);
    return orig.call(this, p, ref);
  };
  target.__finosThemed = true;
}

export function installThemePatch() {
  if (installed) return;
  installed = true;
  [[View, false, false], [Text, true, false], [TextInput, true, 'input'], [ScrollView, false, false], [TouchableOpacity, false, true], [Pressable, false, true], [ActivityIndicator, false, false], [Switch, false, false], [RefreshControl, false, false]]
    .forEach(([c, cap, touch]) => { try { wrap(c, cap as boolean, touch as boolean | 'input'); } catch { /* a component that is not wrappable keeps the dark palette */ } });
}
void COLOR_KEYS;
