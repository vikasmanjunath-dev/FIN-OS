// The app's language: stored under the website's key (finos_lang), changed from Settings, and applied to every <Text> and
// placeholder through lib/i18nPatch.ts so no screen has to be edited to be translated.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translateWith, templateKey, type Lang, type Table } from '@/lib/i18nCore';
import { HI } from '@/lib/i18nHi';

export const LANG_KEY = 'finos_lang';
export const LANGUAGES: { id: Lang; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'hi', label: 'हिन्दी' }];
const TABLES: Record<Lang, Table> = { en: {}, hi: HI };

let current: Lang = 'en';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const getLang = () => current;
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export async function loadLang(): Promise<Lang> {
  try {
    const raw = (await AsyncStorage.getItem(LANG_KEY)) ?? 'en';
    const v = String(raw).replace(/^"|"$/g, '');
    current = v === 'hi' ? 'hi' : 'en';
  } catch { current = 'en'; }
  emit();
  return current;
}

export async function setLang(l: Lang): Promise<void> {
  current = l === 'hi' ? 'hi' : 'en';
  emit();
  try { await AsyncStorage.setItem(LANG_KEY, current); } catch { /* the choice still applies for this session */ }
}

/** Text in the current language (unchanged when there is no entry, or in English). */
export const translate = (text: string) => translateWith(text, TABLES[current], current);

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Strings that were asked for in Hindi and had no entry, so a translator can see what is missing (development aid). The keys are
 *  in template form, exactly what the table needs: every number-like token is {n}. */
const missing = new Set<string>();
export function noteMissing(text: string) {
  if (current === 'en' || !text.trim() || !/[A-Za-z]{3}/.test(text)) return;
  missing.add(templateKey(text));
}
export const missingStrings = () => [...missing].sort();
if (typeof window !== 'undefined') (window as any).__finosMissing = () => missingStrings();
