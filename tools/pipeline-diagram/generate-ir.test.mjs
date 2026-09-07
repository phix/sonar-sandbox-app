// Runs the generator against this repo's real workflows. The assertions are
// the wiring the README describes in prose; if one fails, either the
// workflows changed (regenerate and re-read the README) or the generator
// stopped seeing something it used to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate-ir.mjs';
import { render } from './pr-comment.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const manual = JSON.parse(readFileSync(join(here, 'manual.json'), 'utf8'));
const layout = JSON.parse(readFileSync(join(here, 'layout.json'), 'utf8'));
const revision = 'a'.repeat(40);

const ir = generate({ repoRoot, manual, layout, revision });
const ids = new Set(ir.components.map((c) => c.id));
const edge = (from, to) => ir.connections.find((e) => e.from === from && e.to === to);

test('every workflow file except the excluded ones becomes a node', () => {
  for (const id of ['demo-create-pr', 'sonar-pr-scan', 'onboard-backlog', 'remediate', 'demo-reset', 'file-ticket', 'branch-pr', 'settle-notify', 'auto-continue-watch', 'tinman-health-check']) {
    assert.ok(ids.has(id), `missing node ${id}`);
  }
  assert.ok(!ids.has('track-finding'), '04 is merged into 03');
  assert.ok(!ids.has('pipeline-diagram'), 'the diagram workflow excludes itself');
});

test('reusable-module calls, workflow_run and dispatch become edges with evidence', () => {
  assert.equal(edge('sonar-pr-scan', 'settle-notify')?.label, 'settle');
  assert.equal(edge('sonar-pr-scan', 'auto-continue-watch')?.label, 'workflow_run');
  assert.equal(edge('auto-continue-watch', 'remediate')?.label, 'gh workflow run');
  assert.equal(edge('demo-create-pr', 'sonar-pr-scan')?.label, 'opens PR');
  assert.match(edge('sonar-pr-scan', 'settle-notify')._evidence, /^\.github\/workflows\/sonar-pr-scan\.yml:\d+$/);
});

test('external repos, services and secrets are derived, then folded through modules', () => {
  assert.ok(ids.has('sonar-remediation-automation'));
  assert.equal(edge('file-ticket', 'jira')?.label, 'JIRA_API_TOKEN');
  assert.equal(edge('settle-notify', 'telegram')?.label, 'TELEGRAM_BOT_TOKEN');
  assert.equal(edge('remediate', 'tailscale')?.label, 'join tailnet');
  assert.equal(edge('onboard-backlog', 'sonarcloud'), undefined, '03 → SonarCloud is drawn from _file-ticket instead');
  assert.equal(ir._folded['onboard-backlog->sonarcloud'], 'drawn from file-ticket');
});

test('dispatch-only workflows are tagged manual', () => {
  const byId = Object.fromEntries(ir.components.map((c) => [c.id, c]));
  assert.equal(byId['demo-reset'].tag, 'manual');
  assert.equal(byId['sonar-pr-scan'].tag, 'auto on PR');
});

test('the IR is complete: ids are stable, endpoints exist, every node is placed', () => {
  for (const e of ir.connections) {
    assert.equal(e.id, `${e.from}--${e.to}`);
    assert.ok(ids.has(e.from) && ids.has(e.to), `${e.id} has a missing endpoint`);
  }
  for (const c of ir.components) assert.ok(Array.isArray(c.pos) && Array.isArray(c.size), `${c.id} is unplaced`);
  assert.deepEqual(ir.meta.repository, { url: manual.meta.repository_url, revision });
});

test('a node with no layout entry fails, naming it', () => {
  const partial = { ...layout, nodes: { ...layout.nodes } };
  delete partial.nodes.jira;
  assert.throws(() => generate({ repoRoot, manual, layout: partial, revision }), /no layout entry for: jira/);
});

test('the PR comment summarises a receipt and copes without one', () => {
  const md = render(
    {
      summary: { components: { added: 1, changed: 0, removed: 0 }, connections: { added: 0, removed: 2 }, boundaries: {} },
      changes: { components: [{ id: 'x', status: 'added', changedFields: [] }], connections: [], boundaries: [] },
    },
    { runUrl: 'https://run', pagesUrl: 'https://pages' },
  );
  assert.match(md, /^<!-- pipeline-diagram -->/);
  assert.match(md, /nodes: 1 added · edges: 2 removed/);
  assert.match(md, /\| node \| `x` \| added \|/);
  assert.match(render(null, { runUrl: 'https://run' }), /nothing to diff/);
});
