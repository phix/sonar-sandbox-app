// Check the planted smells still match the catalogue.
//
// The first-scan gate does not accept "the scan completed" as success — it
// diffs reported rule keys against the planted catalogue, and a planted smell
// that never fires is treated as a real defect in the oracle. This is that
// same diff, run locally against the analyzer so a drift is caught before a
// scan is spent on it.
//
//   npm run smells:verify
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import config, { RULE_MAP } from '../eslint.smells.config.mjs';

const LOCAL_TO_SONAR = { js: {}, ts: {} };
for (const [sonarKey, localRule] of Object.entries(RULE_MAP)) {
  LOCAL_TO_SONAR[sonarKey.startsWith('javascript:') ? 'js' : 'ts'][localRule] = sonarKey;
}

const catalogue = JSON.parse(readFileSync('smells/catalogue.json', 'utf8'));
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
const results = await eslint.lintFiles(['api/src', 'web/src']);

// Compare on (file, line, rule) — the same identity the catalogue records.
const key = (f, l, r) => `${f}:${l}:${r}`;
const observed = new Map();
for (const result of results) {
  const file = result.filePath.replace(`${process.cwd()}/`, '');
  const lang = file.startsWith('api/') ? 'js' : 'ts';
  for (const m of result.messages) {
    const sonarKey = LOCAL_TO_SONAR[lang][m.ruleId];
    if (!sonarKey) {
      console.error(`unmapped local rule ${m.ruleId} at ${file}:${m.line}`);
      process.exitCode = 1;
      continue;
    }
    observed.set(key(file, m.line, sonarKey), { file, line: m.line, rule: sonarKey });
  }
}

const expected = new Map(
  catalogue.smells.map((s) => [key(s.file, s.line_hint, s.sonar_rule_key), s])
);

const missing = [...expected.entries()].filter(([k]) => !observed.has(k)).map(([, s]) => s);
const unexpected = [...observed.entries()].filter(([k]) => !expected.has(k)).map(([, o]) => o);

for (const s of missing) {
  console.error(`MISSING     ${s.id} ${s.sonar_rule_key} expected at ${s.file}:${s.line_hint}`);
}
for (const o of unexpected) {
  console.error(`UNEXPECTED  ${o.rule} at ${o.file}:${o.line} is not in the catalogue`);
}

const ok = missing.length === 0 && unexpected.length === 0;
console.log(
  `${ok ? 'PASS' : 'FAIL'}  ${observed.size} finding(s) observed, ${expected.size} catalogued, ` +
    `${missing.length} missing, ${unexpected.length} unexpected`
);
if (!ok) process.exitCode = 1;
