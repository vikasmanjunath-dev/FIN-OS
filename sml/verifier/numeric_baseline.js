// Deterministic numeric detector on the W2 test set: flags a claim when SmlNumericCheck finds a figure
// in the claim that is not in the evidence. Writes numeric_flags.json (row index -> bool) and prints a summary.
const fs = require('fs'), path = require('path');
const NC = require(path.resolve(__dirname, '../../js/sml/numeric-check.js'));
const split = process.argv[2] || 'test';
const rows = fs.readFileSync(path.join(__dirname, split + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const flags = rows.map((r) => { try { return NC.check(r.claim, [r.evidence]).unmatched.length > 0; } catch (e) { return false; } });
fs.writeFileSync(path.join(__dirname, `numeric_flags_${split}.json`), JSON.stringify(flags));
const tab = {};
rows.forEach((r, i) => { const k = r.label + (r.label === 'contradicted' ? '/' + r.change_type : ''); (tab[k] = tab[k] || { n: 0, flagged: 0 }); tab[k].n++; if (flags[i]) tab[k].flagged++; });
for (const [k, v] of Object.entries(tab)) console.log(k.padEnd(24), `${v.flagged}/${v.n}`, (v.flagged / v.n).toFixed(3));
