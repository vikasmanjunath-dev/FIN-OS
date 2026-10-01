#!/usr/bin/env node
/**
 * minify.js — optional, non-destructive build step.
 *
 * Minifies every js/*.js and css/*.css with esbuild into dist-min/{js,css}/ and
 * prints the size saving. Sources are never modified and Vercel does not run this;
 * it exists to (a) measure the payoff of minification and (b) give a ready
 * output dir if you later point vercel.json at a built bundle.
 *
 *   npm run minify
 *
 * Uses `npx esbuild` so no dependency is added to package.json.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-min');

const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
let totals = { raw: 0, min: 0, gz: 0 };

for (const [dir, loader] of [['js', 'js'], ['css', 'css']]) {
  const outDir = path.join(OUT, dir);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.' + loader))) {
    const src = path.join(ROOT, dir, f);
    const dst = path.join(outDir, f);
    try {
      execFileSync('npx', ['--yes', 'esbuild@0.25', src, '--minify', `--loader:.${loader}=${loader}`, `--outfile=${dst}`, '--log-level=error', '--legal-comments=none'], { stdio: ['ignore', 'ignore', 'inherit'] });
    } catch {
      console.warn(`⚠ skipped ${dir}/${f} (esbuild could not parse it)`);
      continue;
    }
    const raw = fs.statSync(src).size;
    const min = fs.statSync(dst).size;
    totals.raw += raw;
    totals.min += min;
    totals.gz += zlib.gzipSync(fs.readFileSync(dst)).length;
  }
}
console.log(`raw ${kb(totals.raw)} → minified ${kb(totals.min)} (${(100 - (100 * totals.min) / totals.raw).toFixed(0)}% smaller) → gzipped ${kb(totals.gz)}`);
console.log(`output: ${path.relative(process.cwd(), OUT)}/`);
