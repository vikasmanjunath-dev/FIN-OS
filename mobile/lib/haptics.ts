import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptics are a nicety: never throw, never on web, and only for moments that mean something.
const run = (f: () => Promise<unknown> | undefined) => { if (Platform.OS === 'web') return; try { f()?.catch?.(() => {}); } catch { /* ignore */ } };

/** A saved entry, a finished task: one calm "success" tap. */
export const hapticSuccess = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
/** Something needs attention (a rejected input, a destructive confirm). */
export const hapticWarning = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
/** A choice changed (segmented control, toggle). */
export const hapticSelect = () => run(() => Haptics.selectionAsync());
