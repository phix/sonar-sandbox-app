// Fast local pre-flight. NOT the oracle.
//
//   npm run smells:verify
//
// The oracle is a real SonarQube scan, diffed by assert-catalogue-coverage.mjs
// in the automation repo. This runs the same SonarJS analyzer as ESLint rules
// so a drifted smell is caught in seconds instead of after a scan — but it can
// only see the rules the standalone plugin implements, and it has been proven
// to disagree with Sonar in BOTH directions:
//
//   typescript:S6606   local reported 2, Sonar reported 0
//   javascript:S6582   local reported 0, Sonar reported 3
//   javascript:S7737   local reported 0, Sonar reported 1
//   javascript:S7765   local reported 0, Sonar reported 1
//
// So it checks only the catalogue entries whose rule it can actually see, and
// says out loud how many it skipped. A pre-flight that quietly ignores most of
// the catalogue while printing PASS would be worse than no pre-flight at all.
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import config, { RULE_MAP } from '../eslint.smells.config.mjs';

const LOCAL_TO_SONAR = { js: {}, ts: {} };
for (const [sonarKey, localRule] of Object.entries(RULE_MAP)) {
  LOCAL_TO_SONAR[sonarKey.startsWith('javascript:') ? 'js' : 'ts'][localRule] = sonarKey;
}
const COVERED = new Set(Object.keys(RULE_MAP));

const catalogue = JSON.parse(readFileSync('smells/catalogue.json', 'utf8'));
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
const results = await eslint.lintFiles(['api/src', 'web/src']);

const key = (f, l, r) => `${f}:${l}:${r}`;
const observed = new Map();
for (const result of results) {
  const file = result.filePath.replace(`${process.cwd()}/`, '');
  const lang = file.startsWith('api/') ? 'js' : 'ts';
  for (const m of result.messages) {
    const sonarKey = LOCAL_TO_SONAR[lang][m.ruleId];
    if (sonarKey) observed.set(key(file, m.line, sonarKey), { file, line: m.line, rule: sonarKey });
  }
}

const checkable = catalogue.smells.filter((s) => COVERED.has(s.sonar_rule_key));
const skipped = catalogue.smells.length - checkable.length;
const expected = new Map(checkable.map((s) => [key(s.file, s.line_hint, s.sonar_rule_key), s]));

const missing = [...expected].filter(([k]) => !observed.has(k)).map(([, s]) => s);
const unexpected = [...observed].filter(([k]) => !expected.has(k)).map(([, o]) => o);

for (const s of missing) console.error(`MISSING     ${s.id} ${s.sonar_rule_key} expected at ${s.file}:${s.line_hint}`);
for (const o of unexpected) console.error(`UNEXPECTED  ${o.rule} at ${o.file}:${o.line} is not in the catalogue`);

const ok = !missing.length && !unexpected.length;
console.log(
  `${ok ? 'PASS' : 'FAIL'}  ${checkable.length}/${catalogue.smells.length} catalogue entries checkable locally ` +
    `(${skipped} skipped: rule not implemented by the local plugin), ${missing.length} missing, ${unexpected.length} unexpected`
);
console.log('This is a pre-flight. The authoritative gate is a real Sonar scan.');
if (!ok) process.exitCode = 1;
