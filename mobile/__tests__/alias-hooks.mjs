// Node module-resolution hook: makes the app's "@/..." import alias (tsconfig paths) work under `node --test`,
// so the pure lib/ modules can be tested without a bundler. Loaded via register-aliases.mjs.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const stubs = {
  '@react-native-async-storage/async-storage': pathToFileURL(path.join(root, '__tests__/stubs/async-storage.mjs')).href,
};

export async function resolve(specifier, context, next) {
  if (stubs[specifier]) return next(stubs[specifier], context);
  if (specifier.startsWith('@/')) {
    const base = path.join(root, specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
