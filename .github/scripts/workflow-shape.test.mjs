/**
 * Workflow SHAPE, checked locally, because GitHub's parser is the only other
 * thing that checks it and it checks it far too late.
 *
 * `YAML.parse` accepts a lot that GitHub rejects. On 2026-09-25 a job was
 * inserted in the middle of another one, orphaning the first job's `with:` and
 * `secrets:` onto a job that had no `uses:`. Every local check passed — YAML is
 * valid, the diagram regenerated, `test:diagram` was green — and the failure
 * arrived as a rejected API call at dispatch time:
 *
 *   could not create workflow dispatch event: HTTP 422: Invalid Argument
 *   - failed to parse workflow: (Line: 359, Col: 5): Unexpected value 'with'
 *
 * That is the shape of failure this repository is built against: the check that
 * would have caught it ran in the wrong place, after the fact, on the server.
 * These are the three rules that actually bit, so they are the three checked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const workflowsDir = join(repoRoot, '.github/workflows');

const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml'));

// Parsed one at a time, collecting failures rather than throwing at import: a
// malformed file should fail THIS check with its name attached, not blow up the
// test file before any test runs. Found by doing exactly that while proving the
// checks below catch what they were written for.
const workflows = [];
const parseErrors = [];
for (const file of files) {
  try {
    workflows.push({ file, doc: parse(readFileSync(join(workflowsDir, file), 'utf8')) });
  } catch (e) {
    parseErrors.push(`${file}: ${String(e.message).split('\n')[0]}`);
  }
}

test('every workflow file parses as YAML', () => {
  assert.deepEqual(parseErrors, [], parseErrors.join('\n'));
});

test('there is something to check', () => {
  assert.ok(files.length > 5, `expected several workflows, found ${files.length}`);
});

test('with/secrets appear only on a job that calls a reusable workflow', () => {
  // `with` and `secrets` are only meaningful alongside `uses`; GitHub rejects
  // the whole file when they are not. This is the 422 above.
  const bad = [];
  for (const { file, doc } of workflows) {
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      if (!job.uses) {
        for (const key of ['with', 'secrets']) {
          if (job[key] !== undefined) bad.push(`${file}: job "${id}" has "${key}" but no "uses"`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('a job that calls a reusable workflow carries no steps or runner of its own', () => {
  const bad = [];
  for (const { file, doc } of workflows) {
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      if (!job.uses) continue;
      for (const key of ['steps', 'runs-on', 'container', 'services']) {
        if (job[key] !== undefined) bad.push(`${file}: job "${id}" has "uses" AND "${key}"`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('every `needs` names a job that exists in the same file', () => {
  // Hit while splitting demo-reset.yml into jobs: `clear-groups` kept
  // `needs: reset` after `reset` stopped existing. A dangling `needs` is a
  // workflow that GitHub refuses to run, and grep found it by luck that time.
  const bad = [];
  for (const { file, doc } of workflows) {
    const ids = new Set(Object.keys(doc.jobs ?? {}));
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      const needs = job.needs === undefined ? [] : [].concat(job.needs);
      for (const n of needs) {
        if (!ids.has(n)) bad.push(`${file}: job "${id}" needs "${n}", which does not exist`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('every local reusable-workflow path points at a file that exists', () => {
  const bad = [];
  for (const { file, doc } of workflows) {
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      if (typeof job.uses !== 'string' || !job.uses.startsWith('./')) continue;
      const p = join(repoRoot, job.uses.replace(/^\.\//, ''));
      if (!existsSync(p)) bad.push(`${file}: job "${id}" uses ${job.uses}, which is not there`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});
