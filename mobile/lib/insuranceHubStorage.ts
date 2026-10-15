// The person's own checklist answers for their recorded policies, kept on this phone only (never synced).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Answer, type Answers, normaliseAnswers, pruneAnswers, setAnswer } from './insuranceHub.ts';
import { asRecord, keepIfUnreadable } from './safeStore.ts';

export const CHECKS_KEY = 'finos_insurance_checks_v1';

// Read-modify-write on one key: serialise so two quick taps cannot lose an answer.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function readStrict(): Promise<Answers> {
  return normaliseAnswers(asRecord(await AsyncStorage.getItem(CHECKS_KEY)) ?? {});
}
export async function loadAnswers(): Promise<Answers> {
  try { return await readStrict(); } catch { return {}; }
}

const write = async (a: Answers) => { await keepIfUnreadable(CHECKS_KEY, 'object'); await AsyncStorage.setItem(CHECKS_KEY, JSON.stringify(a)); };

/** Sets (or, with null, clears) one answer and returns everything as stored. */
export function saveAnswer(policyId: string, checkId: string, answer: Answer | null): Promise<Answers> {
  return exclusive(async () => {
    const next = setAnswer(await readStrict(), policyId, checkId, answer);
    await write(next);
    return next;
  });
}

/** Drops answers of policies that were deleted. */
export function pruneStoredAnswers(policyIds: string[]): Promise<Answers> {
  return exclusive(async () => {
    const cur = await readStrict();
    const next = pruneAnswers(cur, policyIds);
    if (Object.keys(next).length !== Object.keys(cur).length) await write(next);
    return next;
  });
}
