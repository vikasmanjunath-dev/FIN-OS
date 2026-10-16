// Where this app keeps things that are NOT ordinary tracker data, and which of them must never leave the device they were made on.
// One list, used by the backup (never exported or restored), the data export (never includes secrets), the erase flow (which
// secure-storage items to delete) and by the guard test __tests__/storageKeys.test.mts, which fails when a new key looks private
// but is not listed here, when a SecureStore key is not erased, or when this list and the sync rules disagree.
// Pure: no React Native.

/** Items in the phone's secure storage (Keychain / Keystore). Erase deletes every one of them. */
export const SECURE_KEYS = ['finos_applock_verifier', 'finos_applock_meta', 'finos_applock_fail', 'finos_session_key'] as const;

/** AsyncStorage keys that belong to this phone only: never synced to the cloud, never in a backup, never restored from one. */
export const DEVICE_ONLY_KEYS = [
  'finos_applock_verifier', 'finos_applock_meta', 'finos_applock_fail',        // on the web preview the lock lives here
  'finos_vault', 'finos_vault_meta', 'finos_unlocked',                          // the website's encrypted vault
  'finos_host_ip', 'finos_theme_mobile', 'finos_reminders_mobile', 'finos_onboarding_mobile',
  'finos_consents', 'finos_feedback_log', 'finos_usage', 'finos_usage_v1', 'finos_diag_crashes',
  'finos_tracker_sync_meta', 'finos_holdings_owner', 'finos_holdings_last_sync', 'finos_holdings_tombstones_v1',   // links this phone to an account
  'finos_schema_version', 'finos_session_key',
] as const;

/** Words that mark a key as private by name. A key containing one must be device-only (the guard test enforces it). */
export const PRIVATE_NAME = /applock|vault|token|secret|passphrase|password|verifier|consent|session_key|diag_|onboarding|_mobile$/i;

/** Backup / export: keys that are never included and never overwritten by a restore. */
export const NEVER_BACKUP = new RegExp(`^(${DEVICE_ONLY_KEYS.join('|')}|finos_notif)`);

/** Never in "Export my data" either: they are secrets, not the person's records. */
export const NEVER_EXPORT = /^(finos_applock|finos_vault|finos_session_key)/;

/** AsyncStorage keys the app writes that do not start with "finos_" (third-party libraries' own). Erase clears them all with the rest. */
export const FOREIGN_KEY_PATTERNS = [/^sb-.*-auth-token(-code-verifier)?$/];

/**
 * Files this app leaves in the cache directory: encrypted backups waiting to be shared, copies made by the document picker, and the
 * calendar export (.ics, plan/mydates.tsx; deleted at once on iOS, but on Android the share sheet may still be reading it).
 */
export const TEMP_FILE_PATTERNS = [/^finos-backup-.*\.json$/, /^DocumentPicker$/, /^finos-calendar-.*\.ics$/];
