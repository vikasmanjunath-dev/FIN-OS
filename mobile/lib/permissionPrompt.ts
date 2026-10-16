// Shows the explanation (lib/permissions.ts) and resolves true only when the person taps the "yes" button.
// The phone's own permission prompt is requested after this, never before.
import { Alert, Platform } from 'react-native';
import type { PermissionCopy } from '@/lib/permissions';

export function confirmPermission(c: PermissionCopy): Promise<boolean> {
  const body = `${c.why}\n\n${c.whatHappens}\n\n${c.ifNo}`;
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${c.title}\n\n${body}`));
  return new Promise(res => Alert.alert(c.title, body, [
    { text: c.notNow, style: 'cancel', onPress: () => res(false) },
    { text: c.ask, onPress: () => res(true) },
  ], { cancelable: true, onDismiss: () => res(false) }));
}
