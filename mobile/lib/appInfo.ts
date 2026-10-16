// App version and operating system, for reports the person can read and share. Loaded lazily so Node tests never touch native modules.
export interface AppInfo { appVersion: string; os: string; osVersion: string }

export function appInfo(): AppInfo {
  let appVersion = 'unknown', os = 'unknown', osVersion = 'unknown';
  try {
    const C = require('expo-constants');
    const v = (C.default ?? C)?.expoConfig?.version;
    if (typeof v === 'string' && /^[0-9A-Za-z.\-+]{1,20}$/.test(v)) appVersion = v;
  } catch { /* not available */ }
  try {
    const { Platform } = require('react-native');
    if (typeof Platform?.OS === 'string') os = Platform.OS;
    if (Platform?.Version != null && /^[0-9A-Za-z.\-]{1,20}$/.test(String(Platform.Version))) osVersion = String(Platform.Version);
  } catch { /* not available */ }
  return { appVersion, os, osVersion };
}
