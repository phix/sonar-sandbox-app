# ⚠️ sonar-sandbox-app — INTENTIONALLY DEFECTIVE CODE

**Do not copy anything from this repository. The defects are the point.**

This is a deliberately flawed Angular + Express application used as a scan target for [sonar-remediation-automation](https://github.com/phix/sonar-remediation-automation). Every code smell in it was planted on purpose, catalogued in `smells/catalogue.json`, and exists so an automated remediation pipeline has something real to find, ticket, fix, and verify.

If you arrived here from a search engine: this is a test fixture, not an example. The patterns here are ones you should **avoid**.

## What this repository is for

A remediation pipeline runs against it end to end:

```
SonarQube Cloud scan
    → recon    normalize findings, fingerprint them
    → plan     group them, create Jira issues
    → execute  branch, fix, build, test, re-scan
    → verify   PR opened, Jira transitioned, Telegram notified
    → reset    one click back to the pristine defective baseline
```

## The `v0-pristine` tag

`v0-pristine` marks the **complete, un-remediated set of planted defects** — the dirtiest this code ever gets.

"Pristine" here means *pristine as a test fixture*, not *clean code*. It is the restore point the one-click reset returns to, so that a fixed smell can be un-fixed and the pipeline re-run from a known state. Do not read the tag name as an invitation to branch from it expecting good code.

## Layout

```
web/    Angular frontend
api/    Express API
smells/ catalogue of every planted defect and its expected Sonar rule
```

Two modules, deliberately: it makes the pipeline's module-prefix grouping meaningful rather than degenerate.

## Contributing

Please don't. Fixes to the planted smells defeat the purpose — the automation is supposed to find and fix them. If you have found a defect that is *not* in `smells/catalogue.json`, that is genuinely interesting; open an issue on the automation repo.
