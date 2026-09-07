# Pipeline diagram

The remediation pipeline, drawn from its own workflow files. Live copy:
<https://phix.github.io/sonar-sandbox-app/> — every node and edge carries a
`SRC` chip that opens the workflow line it was read from, pinned to the commit
that was rendered.

```
.github/workflows/*.yml ──▶ generate-ir.mjs ──▶ docs/pipeline/architecture.json ──▶ archify ──▶ HTML
                              ▲          ▲
                     manual.json      layout.json
```

| File | Owns |
|---|---|
| `generate-ir.mjs` | What the YAML says: one node per workflow, edges from job `uses:`, `workflow_run`, `gh workflow run`, `gh pr create`, cross-repo checkouts, service actions and the secrets each workflow touches. |
| `manual.json` | What the YAML cannot say: service nodes behind a secret or action, nodes with no YAML footprint (tinman, the app), edges the YAML only implies, label overrides, merges (`04` into `03`), exclusions (this workflow itself). |
| `layout.json` | Geometry only: `nodes` → `pos`/`size`; `edges` → sides, `via`, `labelAt`. |
| `pr-comment.mjs` | Renders an `archify compare` receipt as the PR comment. |
| `docs/pipeline/architecture.json` | The committed output. CI fails if it drifts from the workflows. |
| `docs/pipeline/architecture.edges.json` | Sidecar: which line each edge came from, and which edges were folded. |

## Day to day

```bash
npm run diagram            # regenerate docs/pipeline/architecture.json
npm run diagram:check      # what CI runs: is the committed IR still current?
npm run test:diagram
```

Validate and render locally by checking archify out beside the repo (CI pins
the same commit in `98-pipeline-diagram.yml`):

```bash
git clone --depth 1 https://github.com/tt-a1i/archify ../archify
node ../archify/archify/bin/archify.mjs validate architecture docs/pipeline/architecture.json --repo-root . --quality standard
node ../archify/archify/bin/archify.mjs render   architecture docs/pipeline/architecture.json pipeline.html --repo-root .
```

## Adding a workflow

1. Write the workflow. `npm run diagram` now fails: `no layout entry for: <id>`.
   That is the contract — archify has no auto-layout, and an unplaced node is
   how a diagram rots.
2. Add `"<id>": { "pos": [x, y], "size": [180, 64] }` under `nodes` in
   `layout.json`. Columns sit at x = 40, 260, 480, 700, 920; rows at
   y = 110 + 120·n. Keep long edges in empty columns: the validator rejects an
   edge that crosses an unrelated node.
3. Run archify `validate`. Label overlaps come back with a suggested
   `labelAt`; put it under `edges` in `layout.json` keyed `from->to`.
4. If the node needs a label or sublabel that is not its `name:`, add it to
   `overrides` in `manual.json`.
5. Commit the regenerated `docs/pipeline/`.

## Why it is shaped this way

Decisions live on the wayfinder map, [issue #25](https://github.com/phix/sonar-sandbox-app/issues/25):
add-on beside the prose in `.github/workflows/README.md`, not a replacement;
checked-in layout with fail-closed unknown nodes; `standard` quality bar;
`compare` delta as a PR comment; archify pinned by commit, not vendored; nodes
outside this repo pinned to the sandbox line that references them.

The spike that chose archify, with the effort and trade-offs measured, is
`docs/research/archify/README.md`.
