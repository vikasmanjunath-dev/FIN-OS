#!/usr/bin/env node
/**
 * summarize-feedback.js — turn exported FIN-OS feedback reports into counts the team can act on.
 *
 *   node scripts/summarize-feedback.js reports/*.json            readable summary
 *   node scripts/summarize-feedback.js --json reports/*.json     the same as JSON
 *   node scripts/summarize-feedback.js reports/                  every .json file in a folder
 *
 * Reports are the files people download from the Feedback page. Each is re-sanitised here (amounts, emails, links and IDs
 * removed again, odd paths and huge counts rejected), so a tampered file cannot put personal data in front of the team.
 * Exit code 1 if no valid report was found.
 */
const fs = require('fs');
const path = require('path');
const F = require('../js/finos-feedback.js');

function filesFrom(args) {
  const out = [];
  for (const a of args) {
    if (!fs.existsSync(a)) { console.error('Not found: ' + a); continue; }
    if (fs.statSync(a).isDirectory()) fs.readdirSync(a).filter((f) => /\.json$/i.test(f)).sort().forEach((f) => out.push(path.join(a, f)));
    else out.push(a);
  }
  return out;
}

function load(files) {
  return files.map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('Skipping ' + f + ': not valid JSON'); return null; } });
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : 'n/a');
const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

function render(s) {
  const L = [];
  L.push('FIN-OS feedback summary', '='.repeat(24), `Reports read: ${s.reports}${s.skipped ? ` (skipped ${s.skipped} that were not valid)` : ''}`, '');
  const f = s.feedback;
  L.push(`Feedback: ${f.total} items, ${f.up} positive, ${f.down} negative (${pct(f.up, f.up + f.down)} positive)`);
  const topics = Object.entries(f.byTopic).sort((a, b) => (b[1].up + b[1].down) - (a[1].up + a[1].down));
  if (topics.length) { L.push('', 'By topic (positive / negative / comments):'); topics.forEach(([t, v]) => L.push(`  ${t.padEnd(14)} ${String(v.up).padStart(3)} / ${String(v.down).padStart(3)} / ${String(v.comments).padStart(3)}   ${pct(v.up, v.up + v.down)} positive`)); }
  const pages = top(f.byPage, 8);
  if (pages.length) { L.push('', 'Pages people gave feedback on:'); pages.forEach(([p, n]) => L.push(`  ${String(n).padStart(3)}  ${p}`)); }
  if (s.comments.length) { L.push('', `Comments (newest first, ${Math.min(20, s.comments.length)} of ${s.comments.length}):`); s.comments.slice(0, 20).forEach((c) => L.push(`  [${c.day}] ${c.topic}${c.rating ? ' ' + (c.rating === 'up' ? '+' : '-') : ''}  ${c.comment}`)); }
  const use = top(s.usage.byPage, 10);
  if (use.length) { L.push('', `Usage (opt-in counts over ${s.usage.days} day${s.usage.days === 1 ? '' : 's'}), most opened pages:`); use.forEach(([p, n]) => L.push(`  ${String(n).padStart(5)}  ${p}`)); }
  return L.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const files = filesFrom(args.filter((a) => a !== '--json'));
  if (!files.length) { console.error('Usage: node scripts/summarize-feedback.js [--json] <report.json ...|folder>'); process.exit(1); }
  const summary = F.summarize(load(files));
  console.log(asJson ? JSON.stringify(summary, null, 2) : render(summary));
  process.exit(summary.reports ? 0 : 1);
}

module.exports = { render, filesFrom };
