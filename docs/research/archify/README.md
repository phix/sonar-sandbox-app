# archify as the cross-repo dependency graph — investigation (2026-09-07)

**Question.** Level of effort, gains, losses of switching "the graph ability" to
show repo ↔ repo and dependency connections using [tt-a1i/archify](https://github.com/tt-a1i/archify).

**Verdict.** Good fit for a *curated* topology diagram (10–30 nodes) of the
pipeline / portfolio, pinned to source. Not a replacement for graphify: the two
are different axes (auto-extracted symbol index vs. hand-authored, validated,
rendered diagram). Frame it as *add*, not *switch*.

## What exists today

- This repo has no graph feature. The only "graph ability" in the setup is
  `graphify` (`~/.bun/bin/graphify`): a per-repo symbol graph, JSON only, no
  renderer, consumed by agents. mcp's graph is 2,314 nodes / 5,329 links.
- The cross-repo wiring is documented in prose only:
  `.github/workflows/README.md`.

## What archify is (verified against the clone, v2.17.0-dev.1)

- Node ≥18, zero runtime deps, MIT. Distributed as an agent *skill* directory
  (`npx skills add tt-a1i/archify -g`), not an npm package.
- Input: typed JSON IR (`architecture | workflow | sequence | dataflow | lifecycle`).
  Output: one self-contained HTML (730 KB for our 14-node diagram) with dark/light,
  PNG/SVG/WebM export, share card.
- `validate` is fail-closed with machine-readable diagnostics and suggested fixes
  (`labelAt`, side hints). Two quality bars: `standard`, `showcase`.
- **No auto-layout.** Grid mode uses fixed 120 px cells (real names overflow);
  manual `pos`/`size` needed for anything with long labels.
- `--repo-root` pins nodes to `path` + `line` at a commit; the viewer shows
  "VERIFIED SOURCE … L42-49" with a GitHub blob link. Single repo only.
- `compare architecture base.json head.json` emits a delta HTML + receipt.

## Measured effort (this spike)

| Step | Time |
|---|---|
| Clone, read schema + contract | ~10 min |
| Author IR (14 nodes, 18 edges, 13 source pins) | ~15 min |
| Validate loop to `standard` green | 3 rounds, ~10 min |
| `showcase` | still 4 diagnostics (crossings/corridors), not chased |

Result: `sonar-pipeline.architecture.json` (here) → `sonar-pipeline.html`.

## Gains

- Git-verified evidence per node; diagram claims are checkable, drift is visible.
- One file, no runtime, works in a PR comment / docs / README share card.
- Validator diagnostics are agent-loopable → cheap to keep green in CI.
- `compare` gives an architecture delta on PRs that touch `.github/workflows/**`.
- Replaces the prose "which workflow do I run" graph with something legible.

## Losses / costs

- Hand layout. Every added node is a placement decision; 30+ nodes gets painful.
- Not data-driven: cannot ingest graphify's thousands of nodes. Curated only.
- Evidence is single-repo: automation-repo files, tinman, Jira can't be pinned
  from here. Cross-repo pins need one IR per repo or a monorepo checkout.
- Pinned commit goes stale; needs a regen job or it lies.
- Vendored skill dir, `-dev` version, 49 "visual evolution" rounds in docs → churn.
- IR duplicates what YAML already says unless generated from it.

## Recommendation

1. Generate the IR from `.github/workflows/*.yml` (`uses:`, `repository:`,
   `workflow_run`, `secrets.*`) with a ~150-line script; keep only positions
   hand-authored in a checked-in layout file.
2. Render on push to `.github/workflows/**`, publish `docs/pipeline.html`,
   run `compare` on PRs. ~1–2 days including CI.
3. Portfolio-wide (all repos in `~/Developer`): add a discovery pass over
   `package.json` / workflows; 3–5 days, and layout is the bottleneck.

## Outcome

Adopted 2026-09-07 as an add-on: `tools/pipeline-diagram/` generates the IR
from the workflow YAML, `98-pipeline-diagram.yml` validates, renders, publishes
to <https://phix.github.io/sonar-sandbox-app/> and comments the `compare` delta
on PRs. Decisions are indexed on the wayfinder map, issue #25.
