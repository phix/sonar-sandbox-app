#!/usr/bin/env node
// Generates the archify architecture IR for the remediation pipeline from the
// workflow YAML, so the diagram is derived from the wiring rather than
// re-described beside it.
//
// What is derived (each edge carries the path + line it was read from):
//   - one node per workflow file in .github/workflows/
//   - job `uses: ./.github/workflows/X.yml`          -> workflow -> reusable module
//   - `on.workflow_run.workflows: [...]`             -> watched workflow -> watcher
//   - `gh workflow run <file>` inside a run: script  -> dispatcher -> dispatched
//   - `gh pr create` inside a run: script            -> opener -> every `on: pull_request` workflow
//   - `actions/checkout` with `repository:`          -> workflow -> external repo node
//   - third-party actions listed in manual.json      -> workflow -> service node
//   - `secrets.NAME` listed in manual.json           -> workflow -> service node (security edge)
//   - local composite actions listed in manual.json  -> workflow -> that node
//
//   - a workflow whose only trigger is workflow_dispatch  -> tag "manual"
//
// Two reductions keep the drawing readable without lying about the wiring:
//   - fold: a caller's edge to a target is dropped when a reusable module it
//     calls already carries the same edge (03 → SonarCloud is drawn once, from
//     _file-ticket, not again from 03). Folded edges are listed in the sidecar.
//   - merge (manual.json): two workflow files drawn as one node, e.g. 03 and 04
//     are the same shape with different inputs.
//
// What stays hand-authored (tools/pipeline-diagram/manual.json): nodes that
// have no YAML footprint (tinman, the app itself), edges the YAML only implies
// (a `git push` re-triggering the PR scan), label overrides, and edges to omit.
//
// Geometry — node positions and per-edge routing (sides, via, labelAt) — comes
// from tools/pipeline-diagram/layout.json and nothing else. A generated node
// with no layout entry is an error, on purpose: archify has no auto-layout,
// and a node dropped somewhere "for now" is how a diagram rots.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, LineCounter, isMap, isSeq, isScalar } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));

export function generate({ repoRoot, manual, layout, revision }) {
  const wfDir = join(repoRoot, '.github/workflows');
  const files = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort();
  // The diagram workflow is not part of the pipeline it draws.
  const excluded = new Set(manual.exclude ?? []);
  const workflows = files.map((f) => readWorkflow(wfDir, f)).filter((w) => !excluded.has(w.id));
  const merge = manual.merge ?? {};
  for (const w of workflows) w.id = merge[w.id] ?? w.id;
  const byName = new Map(workflows.map((w) => [w.name, w]));
  const byFile = new Map(workflows.map((w) => [w.file, w]));

  const components = new Map();
  const connections = [];
  const seen = new Set();

  const addComponent = (id, fields) => {
    if (!components.has(id)) components.set(id, { id, ...fields });
    return components.get(id);
  };
  const folded = {};
  const addEdge = (from, to, fields) => {
    const key = `${from}->${to}`;
    if (seen.has(key) || manual.omit?.includes(key) || from === to) return;
    seen.add(key);
    // A stable id per relationship is what lets `archify compare` diff two revisions.
    connections.push({ id: `${from}--${to}`, from, to, ...fields });
  };
  // Modules each workflow calls, for the fold rule.
  const calls = new Map();
  for (const w of workflows) {
    for (const job of w.jobs) {
      const m = /^\.\/\.github\/workflows\/([^/]+\.ya?ml)$/.exec(job.uses ?? '');
      if (m && byFile.has(m[1])) calls.set(w.id, [...(calls.get(w.id) ?? []), byFile.get(m[1]).id]);
    }
  }

  for (const w of workflows) {
    const c = addComponent(w.id, {
      type: w.reusable ? 'backend' : 'frontend',
      label: w.name,
      ...(w.manualOnly ? { tag: 'manual' } : {}),
      sources: [],
    });
    c.sources.push({ path: w.path, line: w.nameLine, label: w.name });
  }

  for (const w of workflows) {
    // Reusable modules called from jobs.
    for (const job of w.jobs) {
      const m = /^\.\/\.github\/workflows\/([^/]+\.ya?ml)$/.exec(job.uses ?? '');
      if (m && byFile.has(m[1])) {
        addEdge(w.id, byFile.get(m[1]).id, { label: job.id, variant: 'emphasis', ...evidence(w, job.usesLine) });
      }
    }
    // workflow_run watchers.
    for (const watched of w.watches) {
      const src = byName.get(watched);
      if (src) addEdge(src.id, w.id, { label: 'workflow_run', ...evidence(w, w.watchesLine) });
    }
    for (const step of w.steps) {
      // Explicit dispatch of another workflow.
      for (const m of step.run.matchAll(/gh workflow run\s+([\w.-]+\.ya?ml)/g)) {
        if (byFile.has(m[1])) addEdge(w.id, byFile.get(m[1]).id, { label: 'gh workflow run', ...evidence(w, step.line) });
      }
      // Opening a PR fires every pull_request-triggered workflow.
      if (/gh pr create\b/.test(step.run)) {
        for (const t of workflows.filter((x) => x.onPullRequest)) {
          addEdge(w.id, t.id, { label: 'opens PR', variant: 'emphasis', ...evidence(w, step.line) });
        }
      }
      // Cross-repo checkouts.
      if (/^actions\/checkout(@|$)/.test(step.uses) && step.with.repository) {
        const repo = resolveEnv(step.with.repository, w.env);
        if (repo && !/\$\{\{/.test(repo)) {
          const id = repo.split('/').pop();
          addComponent(id, { type: 'backend', label: repo, sublabel: 'checked out into the job', sources: [{ path: w.path, line: step.line }] });
          addEdge(w.id, id, { label: 'checkout', ...evidence(w, step.line) });
        }
      }
      // Third-party actions that stand for a service.
      for (const [action, target] of Object.entries(manual.actions ?? {})) {
        if (step.uses.startsWith(action)) {
          addComponent(target.id, { ...target.node, sources: [{ path: w.path, line: step.line }] });
          addEdge(w.id, target.id, { label: target.label ?? action, variant: target.variant, ...evidence(w, step.line) });
        }
      }
    }
    // Secrets that name a service.
    for (const [secret, target] of Object.entries(manual.secrets ?? {})) {
      const line = w.secretLines.get(secret);
      if (line === undefined) continue;
      addComponent(target.id, { ...target.node, sources: [{ path: w.path, line }] });
      addEdge(w.id, target.id, { label: secret, variant: 'security', ...evidence(w, line) });
    }
  }

  // Fold: drop a caller's edge when a module it calls carries the same edge.
  for (let i = connections.length - 1; i >= 0; i--) {
    const e = connections[i];
    const via = (calls.get(e.from) ?? []).find((mod) => seen.has(`${mod}->${e.to}`));
    if (via && !(calls.get(e.from) ?? []).includes(e.to)) {
      folded[`${e.from}->${e.to}`] = `drawn from ${via}`;
      seen.delete(`${e.from}->${e.to}`);
      connections.splice(i, 1);
    }
  }

  // Hand-authored nodes, edges and overrides.
  for (const c of manual.components ?? []) addComponent(c.id, c);
  for (const [id, over] of Object.entries(manual.overrides ?? {})) {
    const c = components.get(id);
    if (!c) throw new Error(`manual.json overrides "${id}", which the generator never produced`);
    Object.assign(c, over);
  }
  for (const e of manual.connections ?? []) {
    seen.delete(`${e.from}->${e.to}`);
    addEdge(e.from, e.to, e);
  }

  for (const e of connections) {
    for (const end of [e.from, e.to]) {
      if (!components.has(end)) throw new Error(`edge ${e.from}->${e.to} references unknown node "${end}"`);
    }
  }

  const nodeLayout = layout.nodes ?? {};
  const edgeLayout = layout.edges ?? {};
  const missing = [...components.keys()].filter((id) => !nodeLayout[id]);
  if (missing.length) {
    throw new Error(
      `no layout entry for: ${missing.join(', ')}\n` +
        `Add each under "nodes" in tools/pipeline-diagram/layout.json as "<id>": { "pos": [x, y], "size": [w, h] }.`,
    );
  }
  const stale = Object.keys(nodeLayout).filter((id) => !components.has(id));
  if (stale.length) console.warn(`layout.json has entries for nodes that no longer exist: ${stale.join(', ')}`);
  const staleEdges = Object.keys(edgeLayout).filter((k) => !seen.has(k));
  if (staleEdges.length) console.warn(`layout.json has geometry for edges that no longer exist: ${staleEdges.join(', ')}`);

  const ordered = [...components.values()].map((c) => ({ ...c, ...nodeLayout[c.id] }));
  for (const e of connections) Object.assign(e, edgeLayout[`${e.from}->${e.to}`]);
  const { repository_url, ...meta } = manual.meta;
  // Source pins are only accepted alongside a pinned revision. The committed
  // IR records the commit it was generated at; CI re-generates with
  // --revision so the published evidence links pin to the deployed commit.
  meta.repository = { url: repository_url, revision };
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta,
    components: ordered,
    boundaries: (manual.boundaries ?? []).map((b) => ({ ...b, wraps: b.wraps.filter((id) => components.has(id)) })),
    connections,
    _folded: folded,
  };
}

function evidence(w, line) {
  return line === undefined ? {} : { _evidence: `${w.path}:${line}` };
}

// Reads one workflow file into the handful of facts the generator needs.
function readWorkflow(dir, file) {
  const text = readFileSync(join(dir, file), 'utf8');
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, keepSourceTokens: true });
  const lineOf = (node) => (node?.range ? lc.linePos(node.range[0]).line : undefined);
  const root = doc.contents;
  const get = (map, key) => (isMap(map) ? map.get(key, true) : undefined);
  const str = (node) => (isScalar(node) ? String(node.value) : undefined);

  const name = str(get(root, 'name')) ?? file;
  const on = get(root, 'on');
  const watchesNode = get(get(on, 'workflow_run'), 'workflows');
  const watches = isSeq(watchesNode) ? watchesNode.items.map(str) : [];
  const env = {};
  const envNode = get(root, 'env');
  if (isMap(envNode)) for (const p of envNode.items) env[str(p.key)] = str(p.value);

  const jobs = [];
  const steps = [];
  const jobsNode = get(root, 'jobs');
  if (isMap(jobsNode)) {
    for (const pair of jobsNode.items) {
      const job = pair.value;
      const usesNode = get(job, 'uses');
      jobs.push({ id: str(pair.key), uses: str(usesNode), usesLine: lineOf(usesNode) });
      const stepsNode = get(job, 'steps');
      if (!isSeq(stepsNode)) continue;
      for (const s of stepsNode.items) {
        const withNode = get(s, 'with');
        const withObj = {};
        if (isMap(withNode)) for (const p of withNode.items) withObj[str(p.key)] = str(p.value);
        steps.push({ uses: str(get(s, 'uses')) ?? '', run: str(get(s, 'run')) ?? '', with: withObj, line: lineOf(s) });
      }
    }
  }

  const secretLines = new Map();
  text.split('\n').forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    for (const m of l.matchAll(/secrets\.([A-Z0-9_]+)/g)) if (!secretLines.has(m[1])) secretLines.set(m[1], i + 1);
  });

  return {
    file,
    path: `.github/workflows/${file}`,
    // Archify ids must start with a letter, so `03-onboard-backlog` becomes
    // `onboard-backlog` and `_file-ticket` becomes `file-ticket`.
    id: basename(file).replace(/\.ya?ml$/, '').replace(/^_/, '').replace(/^\d+-/, ''),
    name,
    nameLine: lineOf(get(root, 'name')) ?? 1,
    reusable: isMap(on) && on.has('workflow_call'),
    onPullRequest: isMap(on) && on.has('pull_request'),
    manualOnly: isMap(on) && on.items.length === 1 && on.has('workflow_dispatch'),
    watches,
    watchesLine: lineOf(watchesNode),
    env,
    jobs,
    steps,
    secretLines,
  };
}

function resolveEnv(value, env) {
  return value?.replace(/\$\{\{\s*env\.([A-Z0-9_]+)\s*\}\}/g, (_, k) => env[k] ?? `\${{ env.${k} }}`);
}

// Edge evidence is not part of archify's schema (only components carry
// `sources`), so it is stripped from the IR and written to a sidecar the PR
// comment can cite.
function split(ir) {
  const edges = {};
  for (const e of ir.connections) {
    edges[`${e.from}->${e.to}`] = e._evidence ?? 'manual.json';
    delete e._evidence;
  }
  const folded = ir._folded;
  delete ir._folded;
  return { ir, sidecar: { edges, folded } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i === -1 ? dflt : args[i + 1];
  };
  const repoRoot = resolve(opt('--root', join(here, '../..')));
  const out = resolve(opt('--out', join(repoRoot, 'docs/pipeline/architecture.json')));
  const revision = opt('--revision', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim());
  const manual = JSON.parse(readFileSync(join(here, 'manual.json'), 'utf8'));
  const layout = JSON.parse(readFileSync(join(here, 'layout.json'), 'utf8'));
  const { ir, sidecar } = split(generate({ repoRoot, manual, layout, revision }));
  if (args.includes('--check')) {
    // Is the committed IR still what the workflows say? Revision is ignored:
    // it changes every commit, the wiring does not.
    const strip = (x) => JSON.stringify({ ...x, meta: { ...x.meta, repository: undefined } });
    const committed = JSON.parse(readFileSync(out, 'utf8'));
    if (strip(committed) !== strip(ir)) {
      console.error(`${out} is stale — run \`npm run diagram\` and commit the result.`);
      process.exit(1);
    }
    console.log(`${out} is up to date.`);
    process.exit(0);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(ir, null, 2) + '\n');
  writeFileSync(out.replace(/\.json$/, '.edges.json'), JSON.stringify(sidecar, null, 2) + '\n');
  console.log(`${ir.components.length} nodes, ${ir.connections.length} edges -> ${out}`);
}
