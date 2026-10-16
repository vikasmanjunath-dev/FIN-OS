// Records crashes on the phone and installs the global handlers. Everything stays in AsyncStorage (finos_diag_crashes): there is no
// network call in this file, and a test (privacy.test.mts) fails if one appears. Recording never throws and never recurses.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appInfo } from '@/lib/appInfo';
import { CRASH_KEY, addCrash, buildDiagnosticReport, makeRecord, parseCrashes, type CrashKind, type CrashRecord, type DiagnosticReport } from '@/lib/diagnostics';
import { cleanScreen } from '@/lib/usage';
import { consentGranted, loadUsage } from '@/lib/feedbackStorage';

let screen = 'unknown';
export function setCurrentScreen(route: string | null | undefined) { screen = cleanScreen(route ?? 'unknown'); }
export const getCurrentScreen = () => screen;

let chain: Promise<unknown> = Promise.resolve();
let recording = false;

export async function loadCrashes(): Promise<CrashRecord[]> {
  try { return parseCrashes(await AsyncStorage.getItem(CRASH_KEY)); } catch { return []; }
}
export async function clearCrashes(): Promise<void> { await AsyncStorage.removeItem(CRASH_KEY); }

/** Stores a redacted record of `err`. Safe to call from any error path. */
export function recordCrash(err: unknown, o: { kind: CrashKind; fatal?: boolean } = { kind: 'js-error' }): Promise<void> {
  if (recording) return Promise.resolve();          // an error while recording an error must not loop
  recording = true;
  let rec: CrashRecord;
  try { rec = makeRecord(err, { kind: o.kind, fatal: o.fatal, screen, env: appInfo(), now: new Date() }); }
  catch { recording = false; return Promise.resolve(); }
  recording = false;
  const p = chain.then(async () => { await AsyncStorage.setItem(CRASH_KEY, JSON.stringify(addCrash(await loadCrashes(), rec))); }).catch(() => {});
  chain = p;
  return p;
}

/** Everything Diagnostics would share, built from what is stored right now. Usage only when asked for and the usage consent is on. */
export async function currentDiagnosticReport(opts: { includeUsage?: boolean } = {}): Promise<DiagnosticReport> {
  const includeUsage = !!opts.includeUsage && (await consentGranted('usage'));
  return buildDiagnosticReport({ crashes: await loadCrashes(), usage: includeUsage ? await loadUsage() : null, env: appInfo(), now: new Date(), includeUsage });
}

let installed = false;
/** Records uncaught errors and unhandled promise rejections, then lets the platform's own handling run as before. */
export function installCrashHandlers(): void {
  if (installed) return;
  installed = true;
  try {
    const EU = (globalThis as any).ErrorUtils;
    if (EU?.setGlobalHandler) {
      const prev = EU.getGlobalHandler?.();
      EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        const done = recordCrash(error, { kind: 'js-error', fatal: isFatal === true });
        const pass = () => { try { prev?.(error, isFatal); } catch { /* the platform handler's own failure is not ours to record */ } };
        // A fatal error ends the app as soon as the platform handler runs, and the write above is asynchronous: give it a moment.
        if (isFatal) Promise.race([done, new Promise<void>(r => setTimeout(r, 1500))]).then(pass, pass);
        else pass();
      });
    }
  } catch { /* no ErrorUtils on this platform */ }
  try {
    // Hermes (production builds). In development React Native installs its own tracker that shows a warning; keep that.
    const h = (globalThis as any).HermesInternal;
    if (!(globalThis as any).__DEV__ && h?.enablePromiseRejectionTracker) {
      h.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: (_id: number, error: unknown) => { recordCrash(error, { kind: 'unhandled-rejection' }); } });
    }
  } catch { /* not Hermes */ }
  try {
    const w: any = typeof window !== 'undefined' ? window : null;
    if (w?.addEventListener && typeof w.document !== 'undefined') {
      w.addEventListener('error', (e: any) => { recordCrash(e?.error ?? e?.message ?? 'Error', { kind: 'js-error' }); });
      w.addEventListener('unhandledrejection', (e: any) => { recordCrash(e?.reason ?? 'Unhandled rejection', { kind: 'unhandled-rejection' }); });
    }
  } catch { /* no window */ }
}
