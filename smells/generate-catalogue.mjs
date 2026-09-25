// Generate smells/catalogue.json from a real SonarQube scan.
//
//   node smells/generate-catalogue.mjs --issues <sonar-issues.json>
//
// The catalogue is the oracle every downstream assertion is measured against,
// so it is derived from what SonarQube ACTUALLY REPORTED — not from intent, and
// not from a local stand-in.
//
// It used to be generated from eslint-plugin-sonarjs run locally. That was
// wrong, and the first real PR scan proved it: the local analyzer reported
// typescript:S6606 twice where Sonar reported it zero times, and reported none
// of javascript:S6582, S7737 or S7765 where Sonar found five. A local proxy is
// a useful pre-flight. It is not the oracle.
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') && a.push([v.slice(2), all[i + 1]]), a), [])
);
if (!args.issues) {
  console.error('usage: node smells/generate-catalogue.mjs --issues <sonar-issues.json>');
  process.exit(2);
}

// What each rule is planted to prove. `role` decides which branch of the fix
// engine the finding exercises; `fixer` names the deterministic codemod where
// one is possible. A rule absent from here is a finding nobody classified yet,
// which is a failure — the catalogue must not silently absorb the unknown.
const ROLE = {
  'javascript:S1121': ['non_automatable', null, 'Trivially fixable by codemod, and refused anyway because it sits in api/src/auth/. Proves eligibility refuses by location and risk, not by difficulty.'],
  'javascript:S2004': ['non_automatable', null, 'Untangling a callback pyramid in session handling is a behavioural rewrite in a security-sensitive path. Must escalate, never patch.'],
  'javascript:S1128': ['codemod_fixable', 'remove-unused-import', 'The cheapest possible deterministic fix: delete the import specifier.'],
  'typescript:S1128': ['codemod_fixable', 'remove-unused-import', 'The cheapest possible deterministic fix: delete the import specifier.'],
  'javascript:S1481': ['codemod_fixable', 'remove-unused-variable', 'Deterministic deletion of a declaration nothing reads.'],
  'javascript:S1854': ['codemod_fixable', 'remove-dead-store', 'Deterministic deletion of an assignment whose value is never read.'],
  'javascript:S3504': ['codemod_fixable', 'var-to-const', 'Mechanical: a module-scope var never reassigned becomes const.'],
  'typescript:S3504': ['codemod_fixable', 'var-to-const', 'Mechanical: a module-scope var never reassigned becomes const.'],
  'javascript:S6582': ['codemod_fixable', 'to-optional-chain', 'Mechanical `a && a.b` to `a?.b` rewrite. Not planted deliberately — found by the first real scan in code written for other smells, and kept because it fires reliably.'],
  'javascript:S7765': ['codemod_fixable', 'some-to-includes', 'Mechanical `.some(x => x === v)` to `.includes(v)`. Surfaced by the first real scan rather than planted.'],
  'javascript:S7737': ['claude_fallback', null, 'Replacing an object-literal default parameter changes call semantics; the safe rewrite depends on how callers use it.'],
  'javascript:S3776': ['claude_fallback', null, 'Reducing cognitive complexity means restructuring control flow while preserving behaviour. No mechanical fixer exists.'],
  'typescript:S3776': ['claude_fallback', null, 'Reducing cognitive complexity means restructuring control flow while preserving behaviour. No mechanical fixer exists.'],
  'javascript:S4144': ['claude_fallback', null, 'Deduplicating two identical functions requires deciding which name survives and updating callers.'],
  'typescript:S4144': ['claude_fallback', null, 'Deduplicating two identical functions requires deciding which name survives and updating callers.'],
  'typescript:S3358': ['claude_fallback', null, 'Extracting a nested ternary requires naming the intermediate concept, which is a judgement call rather than a rewrite rule.']
};

const raw = JSON.parse(readFileSync(args.issues, 'utf8'));
const issues = (Array.isArray(raw) ? raw : [raw]).flatMap((p) => p.issues || []);
if (!issues.length) {
  console.error('no issues in the scan payload — refusing to write an empty catalogue');
  process.exit(1);
}

const filePath = (component) => component.slice(component.indexOf(':') + 1);
const unclassified = [...new Set(issues.map((i) => i.rule))].filter((r) => !ROLE[r]);
if (unclassified.length) {
  console.error(`unclassified rule(s): ${unclassified.join(', ')}`);
  console.error('add them to ROLE with a role and a reason, or exclude them in sonar-project.properties.');
  process.exit(1);
}

const smells = issues
  .map((i) => {
    const [role, fixer, why] = ROLE[i.rule];
    const file = filePath(i.component);
    return {
      id: '',
      file,
      line_hint: i.line ?? null,
      module_prefix: file.split('/')[0],
      sonar_rule_key: i.rule,
      expected_severity: i.severity,
      // Fingerprint on the content hash, not the line — a deliberate deviation
      // from spec §8.1, since line numbers shift on unrelated edits above.
      finding_fingerprint: `${i.rule}|${file}|${i.hash ?? `line:${i.line}`}`,
      role,
      fixer,
      why_planted: why
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file) || (a.line_hint ?? 0) - (b.line_hint ?? 0) || a.sonar_rule_key.localeCompare(b.sonar_rule_key));

smells.forEach((s, i) => { s.id = `smell-${String(i + 1).padStart(3, '0')}`; });

const byRole = smells.reduce((a, s) => ({ ...a, [s.role]: (a[s.role] || 0) + 1 }), {});
const groups = {};
for (const s of smells) {
  const k = `${s.module_prefix}|${s.sonar_rule_key}|${s.expected_severity}`;
  groups[k] = (groups[k] || 0) + 1;
}

writeFileSync('smells/catalogue.json', JSON.stringify({
  $comment: 'Oracle for the remediation pipeline. Generated from a real SonarQube PR scan by smells/generate-catalogue.mjs — never hand-edited, and never derived from the local ESLint stand-in, which disagrees with Sonar.',
  generated_by: 'smells/generate-catalogue.mjs --issues <sonar-issues.json>',
  repository: 'phix/sonar-sandbox-app',
  grouping_note: 'group = module_prefix + sonar_rule_key + expected_severity, matching the plan grouping strategy in architecture spec §9.',
  totals: { findings: smells.length, by_role: byRole, groups: Object.keys(groups).length },
  group_sizes: groups,
  smells
}, null, 2) + '\n');

console.log(`wrote smells/catalogue.json — ${smells.length} findings, ${Object.keys(groups).length} groups`);
console.log('by role:', byRole);
