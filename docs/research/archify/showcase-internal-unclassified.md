# Why `--quality showcase` reports `internal/unclassified` (2026-09-07)

**Short version.** It is not a renderer crash. The renderer validates the
diagram, finds 170 showcase diagnostics, serialises them as a 292 KB JSON
payload, writes it to stderr with one `fs.writeSync`, and calls
`process.exit(1)`. stderr is a pipe to the CLI; a single `writeSync` on a
pipe is a partial write (64 KB on macOS, ~146 KB on Linux), the return value
is ignored, and `process.exit` drops the rest. The CLI gets a truncated JSON
document, fails to parse it, and reports `internal/unclassified` "Renderer
failed before emitting a structured diagnostic". Two facts, then:

1. **Our diagram genuinely fails showcase**, with 33 proper-crossing, 37
   ambiguous-corridor and 100 label-route-clearance diagnostics.
2. **archify hides that behind a truncation bug** in its renderer failure
   boundary. Any diagram whose diagnostic payload exceeds the pipe buffer
   gets the same misleading verdict, on either platform.

## Evidence

Pinned archify `920543b` (== upstream `main` at time of writing), Node 24.

| Step | Result |
|---|---|
| Renderer run directly, stderr to a **file** | valid JSON, 292,035 bytes, 170 diagnostics |
| Renderer run via `spawnSync` with stderr **piped**, macOS | 65,536 bytes received, not valid JSON |
| Same, Linux (`node:24` in Docker) | `archify validate … --json` → `internal/unclassified` |
| Isolated repro: `fs.writeSync(stderr, 300 KB)` then `process.exit` | macOS: `writeSync` returns 65,536, no error. Linux: returns 146,176 |
| Boundary patched to loop until all bytes are written | CLI returns `ok:false` with all 170 diagnostics |

The isolated repro (`child2.mjs`, 6 lines) rules archify's logic out: the
mechanism is Node writing to a non-blocking pipe.

## Where it is in archify

`archify/renderers/shared/diagnostics.mjs`, `installRendererDiagnosticBoundary`:

```js
process.on('uncaughtException', (error) => {
  const payload = `${JSON.stringify(rendererFailure(error))}\n`;
  try {
    fs.writeSync(process.stderr.fd, payload);   // partial write, return value ignored
  } catch { /* swallowed */ }
  process.exit(1);                              // drops whatever did not fit the pipe
});
```

`bin/archify.mjs` then does `JSON.parse(result.stderr.trim())` inside a
`try` and falls back to the unclassified diagnostic on failure — deliberately
"fail-closed", which is why no stack or byte count ever surfaces.

## Upstream already fixed the sibling, not this one

[tt-a1i/archify#311](https://github.com/tt-a1i/archify/issues/311) (closed
2026-09-06, the day before our pin) reports the same truncation on the
artifact-checker's **stdout** receipt, with the identical Linux number
(146,176 bytes). The fix, PR 321 / commit `559aee0`, switched
`scripts/check-render-output.mjs` from `process.exit()` to `process.exitCode`
so stdout drains. It did not touch the renderer's stderr boundary above, so
that path still truncates.

A minimal fix for the boundary, verified locally:

```js
const buf = Buffer.from(payload);
let off = 0;
while (off < buf.length) {
  try { off += fs.writeSync(process.stderr.fd, buf, off, buf.length - off); }
  catch (e) { if (e.code !== 'EAGAIN') throw e; }
}
```

(`process.exitCode` alone is not enough here: the handler is on
`uncaughtException`, so the process is already unwinding.)

## What this means for us

- `standard` is unaffected: its diagnostic payloads are small. The gate
  decision on the map (issue #31) stands.
- Reaching `showcase` is a layout project, not a bug fix. Showcase forbids
  any edge crossing; the pipeline is a hub (every module talks to the
  automation repo, the state branch and SonarCloud), so 29 edges among 18
  nodes cannot be drawn planar without folding more edges away. Not pursued.
- If the bug gets fixed upstream, bump `ARCHIFY_SHA` and showcase will report
  its real diagnostics. Until then, run the renderer directly with stderr to
  a file to see them:

```bash
ARCHIFY_DIAGNOSTIC_FORMAT=json ARCHIFY_QUALITY_PROFILE=showcase ARCHIFY_REPO_ROOT=. \
  node ../archify/archify/renderers/architecture/render-architecture.mjs \
  site/architecture.json /tmp/x.html 2> showcase.json
```
