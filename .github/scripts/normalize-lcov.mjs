/**
 * Rewrite lcov SF: paths so they are repo-root relative.
 *
 * vitest writes paths relative to the workspace it ran in — `src/store.js` —
 * but the scanner runs at the repo root, where that path does not exist. Sonar
 * then resolves nothing, reports 0% coverage, and says so only in a line of
 * scanner log nobody reads. The quality gate goes red for a reason that looks
 * exactly like "you wrote no tests".
 *
 * So: prefix each SF path with its workspace, and ASSERT the result exists on
 * disk. A prefix that is wrong fails the build here rather than becoming a
 * silent zero three steps later.
 *
 * Usage:  node .github/scripts/normalize-lcov.mjs <lcov-file> <prefix>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [file, prefix] = process.argv.slice(2);
if (!file || !prefix) {
  console.error('usage: normalize-lcov.mjs <lcov-file> <prefix>');
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`no lcov at ${file} — did the coverage run actually produce one?`);
  process.exit(1);
}

const clean = prefix.replace(/\/$/, '');
let rewritten = 0;
let already = 0;
const missing = [];

const out = readFileSync(file, 'utf8').split('\n').map((line) => {
  if (!line.startsWith('SF:')) return line;
  const p = line.slice(3).trim();
  const next = p.startsWith(`${clean}/`) ? p : `${clean}/${p}`;
  if (p === next) already += 1; else rewritten += 1;
  if (!existsSync(next)) missing.push(next);
  return `SF:${next}`;
}).join('\n');

if (missing.length) {
  console.error(`::error::${missing.length} lcov path(s) do not exist after prefixing with "${clean}":`);
  for (const m of missing.slice(0, 10)) console.error(`  ${m}`);
  console.error('Coverage would silently report 0%. Fix the prefix rather than shipping this.');
  process.exit(1);
}

writeFileSync(file, out);
console.log(`${file}: ${rewritten} path(s) prefixed with "${clean}/", ${already} already correct, all verified on disk`);
