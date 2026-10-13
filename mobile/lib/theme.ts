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

function wrap(component: any) {
  if (!component) return;
  const target = typeof component.render === 'function' ? component : component.type && typeof component.type.render === 'function' ? component.type : null;
  if (!target || target.__finosThemed) return;
  const orig = target.render;
  target.render = function (props: any, ref: any) {
    const m = useMode();                                  // every wrapped component redraws when the choice changes: no screen reload
    return orig.call(this, m === 'light' ? themeProps(props) : props, ref);
  };
  target.__finosThemed = true;
}

export function installThemePatch() {
  if (installed) return;
  installed = true;
  [View, Text, TextInput, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, Switch, RefreshControl].forEach(c => { try { wrap(c); } catch { /* a component that is not wrappable keeps the dark palette */ } });
}
void COLOR_KEYS;
