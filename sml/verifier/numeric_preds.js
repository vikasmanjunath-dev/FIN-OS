// Run the live numeric check over every pool claim: flag = "a figure in the claim is not in the retrieved evidence". Writes {claim_id, flag} files for score_gate.py.
//   node sml/verifier/numeric_preds.js        -> sml/verifier/numeric_preds_all.jsonl (any unmatched figure) and numeric_preds_moneypct.jsonl (money / percent only)
const fs = require('fs'), path = require('path');
const NC = require('../../js/sml/numeric-check.js');
const dir = __dirname;
const rows = fs.readFileSync(path.join(dir, 'pool_claims.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const all = [], mp = [];
for (const r of rows) {
  const res = NC.check(r.claim, r.evidence.map((e) => e.text));
  const un = res.unmatched || [];
  all.push({ claim_id: r.claim_id, flag: un.length > 0 });
  mp.push({ claim_id: r.claim_id, flag: un.some((n) => n.kind === 'money' || n.kind === 'percent') });
}
fs.writeFileSync(path.join(dir, 'numeric_preds_all.jsonl'), all.map((x) => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'numeric_preds_moneypct.jsonl'), mp.map((x) => JSON.stringify(x)).join('\n') + '\n');
console.log(rows.length, 'claims;', all.filter((x) => x.flag).length, 'flagged (any figure),', mp.filter((x) => x.flag).length, 'flagged (money/percent)');
