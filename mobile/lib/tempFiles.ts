// Files this app leaves in the phone's cache: an encrypted backup written so it could be shared, and the copies the document
// picker makes of a file the person chose (a backup, a bank statement, a holdings file). They hold the person's data, so they are
// deleted as soon as they have been used, on every launch, and on erase. Native only: the web preview has no file system.
import { Platform } from 'react-native';
import { TEMP_FILE_PATTERNS } from '@/lib/storageKeys';

function fs(): any | null {
  if (Platform.OS === 'web') return null;
  try { return require('expo-file-system'); } catch { return null; }
}

/** Deletes one file by uri. Never throws. */
export async function deleteTempFile(uri: string | null | undefined): Promise<void> {
  const FS = fs();
  if (!FS || !uri) return;
  try { await FS.deleteAsync(uri, { idempotent: true }); } catch { /* already gone */ }
}

/** Removes every leftover backup file and picker copy from the cache directory. Returns how many were removed. */
export async function sweepTempFiles(): Promise<number> {
  const FS = fs();
  if (!FS?.cacheDirectory) return 0;
  let n = 0;
  try {
    const names: string[] = await FS.readDirectoryAsync(FS.cacheDirectory);
    for (const name of names) {
      if (!TEMP_FILE_PATTERNS.some(re => re.test(name))) continue;
      try { await FS.deleteAsync(`${FS.cacheDirectory}${name}`, { idempotent: true }); n++; } catch { /* in use: next time */ }
    }
  } catch { /* no cache directory */ }
  return n;
}
