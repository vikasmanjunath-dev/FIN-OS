// Storage side of the Home status strip: one device-only preference (hide / show), nothing else is stored.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText, parseJSON } from '@/lib/safeStore';
import { PERSONA_KEY, normalisePrefs, type PersonaPrefs } from '@/lib/persona';

export async function loadPersonaPrefs(): Promise<PersonaPrefs> {
  const p = parseJSON(await getText(PERSONA_KEY));
  return normalisePrefs(p.ok ? p.value : null);
}
export async function savePersonaPrefs(p: PersonaPrefs): Promise<void> {
  try { await AsyncStorage.setItem(PERSONA_KEY, JSON.stringify(normalisePrefs(p))); } catch { /* the choice still applies for this session */ }
}
