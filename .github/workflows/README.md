# Which workflow do I run?

There are two independent ways to feed the remediation pipeline, plus a
shared engine both of them funnel into. If you're not sure which one you
want, start here.

## Path 1 — Demo walkthrough (single target, this repo's planted smells)

Use this to see the whole pipeline work end to end, with no real Sonar
backlog required — everything it needs is already planted in this repo.

| Step | Workflow | Run it when |
|---|---|---|
| 1 | [`01 - create the demo PR`](demo-create-pr.yml) | You want to (re)start the walkthrough. Opens the standing demo PR carrying all 32 planted findings. **Run this manually — it's the only step you start yourself.** |
| → | `02 - scan, gate & settle` | Fires **automatically** the instant step 1 opens the PR (and again on every push). You don't run this by hand for the demo. |
| 2 | [`05 - remediate a PR`](remediate.yml) | Run manually to fix eligible findings on the demo PR and push the fix back (which re-triggers `02`). Leave the `pr` input blank to target the standing demo PR. |
| 3 | [`06 - reset the demo`](demo-reset.yml) | Run manually once you want to restore all 32 planted findings and start the walkthrough over. Does **not** recreate the PR — same PR number, re-scanned. |

Repeat 2 ⇄ `02` until the gate is green, or the attempt cap is hit.

## Path 2 — Finding-driven, Jira-tracked (a real project's Sonar backlog)

Use this against a project with actual Sonar findings that need to become
real, tracked work: a Jira ticket, a branch, a PR, fixed and verified.

Pick **one** entry point depending on what you have in hand:

| Workflow | Run it when |
|---|---|
| [`03 - onboard a backlog`](03-onboard-backlog.yml) | You have a pile of **un-ticketed** findings (a fresh backlog) and want to bulk-process many groups at once, throttled by `max_concurrent`. Safe to re-run — resumes wherever the cap left off last time. |
| [`04 - track a finding`](04-track-finding.yml) | You have **one specific** finding group (a fingerprint from `npm run jira:groups`, a Jira ticket, or a PR body) at any stage — nothing filed yet, a hand-made ticket, or already branched — and want it to pick up from wherever it stands. |

Both entry points file a Jira ticket and open a branch + PR per group, then
hand off to the **same shared engine** below to actually fix things. Turn on
their `auto_continue` input if you want remediation to keep going on its own
once the first scan resolves, instead of you re-running `05` by hand each
time.

`auto-continue-watch.yml` is **not something you run** — it's the glue that
makes `auto_continue` real. It fires on every completed `02` run and, if that
PR belongs to a group opted into `auto_continue`, dispatches `05` for you.

## Shared engine (both paths funnel into this)

| Workflow | Role |
|---|---|
| [`02 - scan, gate & settle`](sonar-pr-scan.yml) | Scans a PR, decides the Sonar quality gate (the required check on `main` is this job, named `gate`), comments the result on the PR, and records ready/red. **Always fires automatically** on `pull_request` open/sync/reopen — you don't normally trigger this yourself. Manual dispatch (with a `pr` number) exists only to force a re-run without pushing a new commit. |
| [`05 - remediate a PR`](remediate.yml) | The actual fix step: given a PR number, fixes eligible findings, writes a test per fix, builds, tests, and pushes back — which re-triggers `02`. Used by both paths. |

## Reusable modules — never run these directly

The `_`-prefixed workflows only exist because GitHub lists every workflow in
the Actions sidebar, reusable or not. They're called by the workflows above
(`workflow_call`) and take a manual `workflow_dispatch` form too, but running
them stand-alone means supplying every input by hand with nothing above them
to supply it for you — there's no reason to.

| Workflow | Called by |
|---|---|
| [`_file-ticket.yml`](_file-ticket.yml) | `03`, `04` — files or finds a Jira ticket per finding group in scope. |
| [`_branch-pr.yml`](_branch-pr.yml) | `03`, `04` — creates or finds the branch + PR for one group. |
| [`_settle-notify.yml`](_settle-notify.yml) | `02`'s `settle` job — reads the gate verdict, decides ready/red, optionally auto-merges, notifies Telegram + Jira. |

## Utility — unrelated to either path

| Workflow | Role |
|---|---|
| [`99 - tinman health check`](tinman-health-check.yml) | Standalone liveness probe for tinman's LLM endpoint. Run any time you want to confirm connectivity — no open PR or findings required. |
