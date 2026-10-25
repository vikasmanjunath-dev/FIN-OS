import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText } from '@/lib/safeStore';
import { DEFAULT_VOICE_PREFS, VOICE_PREFS_KEY, parseVoicePrefs, type VoicePrefs } from '@/lib/reels/voicePrefs';

export async function loadVoicePrefs(): Promise<VoicePrefs> { try { return parseVoicePrefs(await getText(VOICE_PREFS_KEY)); } catch { return { ...DEFAULT_VOICE_PREFS, voice: {} }; } }
export async function saveVoicePrefs(p: VoicePrefs): Promise<void> { try { await AsyncStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(p)); } catch { /* the choice is only a convenience */ } }
export async function resetVoicePrefs(): Promise<void> { try { await AsyncStorage.removeItem(VOICE_PREFS_KEY); } catch { /* ignore */ } }
