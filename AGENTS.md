# sonar-sandbox-app — project context

> ⚠️ **The defects in this repo are the point.** Every smell is planted on
> purpose, catalogued in `smells/catalogue.json`, and exists so the remediation
> pipeline has something real to find, ticket, fix, and verify.

Inherits `~/Developer/AGENTS.md` (portfolio rules); in a DSH session also
`~/.dsh/AGENTS.md`. This file carries the *pair-level* context: what the two
sonar repos are, what an agent's job is inside each, and where the system
actually runs. Read it before touching either repo.

**Not a Sector.** Neither repo has a `sector.json`, so the Master Control daemon
never dispatches here and a filed issue is not picked up by the factory — work
happens in-session, by hand. Two consequences worth stating plainly:

- The portfolio's **"no GitHub Actions, portfolio-wide"** rule is scoped to
  Sectors. This repo's workflows are the product, not dead configuration. Do not
  "clean them up".
- The "file it, don't build it" division of labour does not bind here.

## The pair, one line each

| Repo | Holds | Role |
|---|---|---|
| `phix/sonar-sandbox-app` — **this repo** | target code **and every workflow** | intentionally defective Angular 22 + Express 5 app; 32 planted findings; the CI that drives the pipeline |
| `phix/sonar-remediation-automation` | engine code, decision records | deterministic codemods first, one LLM call last; Jira, settle. Never touches git — the workflow owns commits and pushes |

Both repos are **public**. Never commit a secret to either; credentials are
GitHub Actions encrypted secrets, and locally the macOS Keychain
(`sonar-remediation-automation/config/secrets.md` names them all, holds none).

## What this repo is, and what you do in it

Two modules, deliberately — `api/` and `web/` as siblings is what makes the
pipeline's `module_prefix` grouping meaningful rather than degenerate:

```
web/      Angular 22 (@sandbox/web) — build + ng test, lcov to web/coverage/web/lcov.info
api/      Express 5 (@sandbox/api)  — vitest + supertest, lcov to api/coverage/lcov.info
smells/   catalogue.json: every planted defect and the Sonar rule it must raise
tools/    pipeline-diagram — reads .github/workflows and emits an archify IR
archive/  SonarScanGenesis, an untracked copy of the pre-split automation repo — dead weight, not source
```

`smells/` and `eslint.smells.config.mjs` are **excluded from Sonar analysis on
purpose**: the catalogue is the oracle, and findings in the oracle would muddy
the diff the scan gate performs against it. The catalogue is **generated from
observed findings in a real Sonar scan** (`npm run smells:generate`), never
hand-written — some plants raise two rules on one line, so a construct-shaped
catalogue would show phantom findings. `npm run smells:verify` checks it.

Your job in this repo is the *pipeline*, not the code. Concretely:

- **Never "fix" a planted smell by hand.** The automation is supposed to find and
  fix them; a hand fix defeats the demonstration and desynchronises the
  catalogue.
- **Never copy a pattern out of `api/` or `web/`** into anything real. If you
  need an example, read `sonar-remediation-automation`.
- If you find a defect that is **not** in `smells/catalogue.json`, that is
  genuinely interesting — open an issue on the automation repo (this repo's own
  README rule).

### The two tags are load-bearing

| Ref | Meaning |
|---|---|
| `v0-pristine` | the **complete, un-remediated** set of planted defects — the dirtiest this code ever gets, and the base for the demo branch. "Pristine" means pristine *as a test fixture*, not clean code |
| `v0-clean` / `main` | the clean baseline. `main` is where remediated work lands |

`01 - create the demo PR` force-pushes `v0-pristine` onto `demo/planted-smells`
and opens the PR (it refuses if `v0-pristine` is an ancestor of `v0-clean`, which
would make the PR diff empty). `06 - reset the demo` restores that state, so the
demo is repeatable rather than a recording.

## Where it runs — and what is *not* deployed

**There is no deployed instance of the app, on purpose.** CD is explicitly out of
scope (`sonar-remediation-automation` `docs/IMPLEMENTATION_PLAN.md` §3): a CI
re-scan is the proof a fix worked. `web/` and `api/` are built and tested in CI
and nowhere else; `npm run start:api` / `ng serve` are local conveniences.

**The one public deployment** is the pipeline diagram, drawn from these workflow
files and published to GitHub Pages:

| | |
|---|---|
| URL | <https://phix.github.io/sonar-sandbox-app/> — verified live 2026-09-24 |
| Published by | `98 - pipeline diagram` on push to `main` touching `.github/workflows/**`, `.github/actions/**`, `tools/pipeline-diagram/**`, `docs/pipeline/**` |
| Pages config | `build_type: workflow`, source `main`, HTTPS enforced |
| Renderer | [archify](https://github.com/tt-a1i/archify) at pinned `ARCHIFY_SHA` — bumped on purpose, never tracked to HEAD |
| On a PR | deploys nothing; comments the topology delta against `main` instead |

The automation repo has no Pages site, and exactly one workflow of its own:
`sandbox-build.yml`, manual-only, which re-proves the container contract without
needing a PR.

**The real runtime is GitHub Actions in this repo** — that *is* the deployment.
Every external surface it reaches:

| Surface | Detail |
|---|---|
| SonarQube Cloud | org `phix`, project `phix_sonar-sandbox-app` (`sonar-project.properties`) |
| Jira | `https://1337software.atlassian.net`, project `SONAR` |
| tinman | Ollama `/v1` on Nick's LAN (`192.168.1.217`, tailnet `100.102.1.50`); jobs join the tailnet in-job with `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET`, ACL tag `tag:ci` |
| `automation-state` | orphan branch in **this** repo holding `plan.json`, so "which group already has a ticket/branch/PR" survives across separately-triggered runs |

There is **no notification channel**, and that is deliberate. Telegram was
removed 2026-09-24 (it had replaced Teams, which died on M365 licensing). The
terminal verdict is the `<!-- sonar-settle -->` comment `settle` posts on the PR
itself — so the outcome can never drift from the change it describes. Do not add
a chat channel back without a decision record.

Secrets set on this repo (verified 2026-09-24): `JIRA_API_TOKEN`,
`JIRA_USER_EMAIL`, `SANDBOX_REPO_TOKEN`, `SONAR_TOKEN`, `TS_OAUTH_CLIENT_ID`,
`TS_OAUTH_SECRET`.

## Which workflow to run

`.github/workflows/README.md` is the authoritative map — read it rather than
inferring from filenames. Short version:

- **Path 1, demo walkthrough** (this repo's own planted smells): `01 - create the
  demo PR` is the only step you start by hand; `02 - scan, gate & settle` fires
  automatically; `05 - remediate a PR` is manual; `06 - reset the demo` returns
  to `v0-pristine`. Repeat 05 ⇄ 02 until green or the attempt cap is hit.
- **Path 2, finding-driven and Jira-tracked** (a real backlog): enter at
  `03 - onboard a backlog` (bulk, throttled by `max_concurrent`, resumable) or
  `04 - track a finding` (one specific group, any stage). `auto-continue watch`
  is glue, not something you run.
- **Shared engine** both paths funnel into: `02` and `05`.
- **Reusable modules — never run directly**: `_file-ticket`, `_branch-pr`,
  `_settle-notify`. They exist because GitHub lists every workflow in the sidebar.
- **Utility**: `99 - tinman health check`, `98 - pipeline diagram`.

### The switches

- **Jira** is genuinely opt-in: `05 - remediate a PR` takes a `jira` input,
  default `false`, and the settle stage only records an outcome against groups
  that already carry a ticket key. A PR that never turned Jira on files nothing.
- **Auto-merge** is off unless the repo variable `AUTO_MERGE_ENABLED` is `true`.
  It is **not set**, so `settle` never merges and every merge here is a human or
  agent action.
- **Notification** is not a switch at all any more — there is no channel. The
  verdict is the PR comment (see above).

## Derive state, never remember it

No PR numbers, SHAs or "currently open" lists in this file — they rotate. `gh` is
at `/opt/homebrew/bin/gh`, not on the default `PATH`:

```bash
export PATH="/opt/homebrew/bin:$PATH"
gh pr list   --repo phix/sonar-sandbox-app --state open
gh run list  --repo phix/sonar-sandbox-app --limit 10
gh api repos/phix/sonar-sandbox-app/branches --jq '.[].name'
gh api repos/phix/sonar-sandbox-app/branches/main/protection \
  --jq '.required_status_checks.contexts'          # a 404 means unprotected
```

Branch protection on `main`, **measured 2026-09-24** — not quoted from the decision
record, which is stale on two of these:

| Setting | Value | Note |
|---|---|---|
| PR required | yes | |
| Approvals | **0** | Nick is the only human |
| Required check | **`gate`** | the job name, not the workflow's display name — this is what makes a red gate block the merge button |
| `strict` | false | the branch need not be up to date with `main` |
| Force-pushes | allowed | vestigial: the reset stopped pushing `main` |
| Deletions | off | |
| `enforce_admins` | **`true`** | the protection binds admins, including the token a session uses |

Two consequences worth knowing before you try to merge anything:

- **A red gate cannot be merged by anyone here, admin bypass included.** If the
  gate is red, that is a real stop: fix the cause or say so out loud. Do not go
  hunting for a bypass — on this repo's settings there is not one.
- `docs/decisions/cross-repo-auth.md` (automation repo) still describes
  `enforce_admins: false` and justifies it by "the one-click reset force-pushes
  `main` back to `v0-pristine`". Neither holds: admins are enforced, and
  `06 - reset the demo` force-pushes **`demo/planted-smells`** and explicitly never
  touches `main` — it keeps the `v0-clean` tag tracking `main` instead.

## Commands

```bash
npm test              # api + web
npm run test:api      # or test:web
npm run test:coverage # what the gate needs; lcov paths are normalised by
                      # .github/scripts/normalize-lcov.mjs — a bad SF: path fails
                      # the build instead of silently reporting 0%
npm run test:scripts  # pr-gate unit tests
npm run smells:verify # catalogue still matches a real scan
npm run smells:generate
npm run diagram:check # the diagram is stale vs the workflow files
npm run build
```

Node ≥ 22. The gate is legitimate about coverage: **32 code smells still rate an
A for maintainability**, so the red verdict on this repo is new-code coverage,
not the smells — which is why `settle` exits 0 on red.

## Traps

- **`GITHUB_TOKEN` cannot re-trigger workflows.** Any push that must fire the
  scan (demo branch push, PR open, reset force-push) uses `SANDBOX_REPO_TOKEN`.
  A default-token push leaves the re-triggered run at `action_required` with zero
  jobs — found the hard way, twice.
- **`automation-state` is a concurrency lock, not just a branch.** Every job that
  reads or writes `plan.json` carries `concurrency: group: automation-state,
  cancel-in-progress: false`; that is what turns "N group-PRs finish at once"
  from a lost-update race into a FIFO queue.
- **The demo PR is titled "(do not merge)"** as a signal to humans, and nothing
  merges it for you either — `AUTO_MERGE_ENABLED` is unset on this repo. Every
  merge here is a deliberate human or agent action.
- **`archive/` is untracked** (`?? archive/` in `git status`) — a full copy of
  the pre-split automation repo (`SonarScanGenesis`). It is not source. Leave it
  alone unless Nick says otherwise; never let it be committed by accident.
- **Do not reintroduce a notification channel.** Telegram was removed on purpose
  (2026-09-24) after Teams died on M365 licensing; the verdict lives on the PR.
  The automation repo's `docs/decisions/notify-pr-comment-only.md` records why,
  and its `README.md` still carries some pre-removal prose about
  `telegram_notify` — that is stale, the workflows have no such input.
  `docs/research/archify/` also holds a dated pre-removal snapshot; it is
  historical research, not current topology.

## Where to go deeper

- `README.md` — what the repo is for, the `v0-pristine` contract, layout.
- `.github/workflows/README.md` — which workflow to run and when.
- `tools/pipeline-diagram/README.md` — the diagram's inputs and local validation.
- `docs/research/archify/` — why archify is used as a curated topology diagram
  and what it is *not* (it is not a replacement for graphify).
- Automation side: `phix/sonar-remediation-automation` → `README.md`,
  `docs/decisions/`, `AGENTS.md`.
