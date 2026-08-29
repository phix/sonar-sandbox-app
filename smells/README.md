# The intentional smell catalogue

`catalogue.json` is the **oracle** for the remediation pipeline. Everything
downstream is measured against it: the first-scan gate asserts SonarQube Cloud
actually reports these rule keys, and the fix engine is scored on how many of
them it clears.

It is generated, never hand-written — see [Generating and verifying](#generating-and-verifying).

## What is planted

29 findings across 14 groups, in both modules.

| Role | Findings | What it proves |
|---|---|---|
| `codemod_fixable` | 17 | The cheap deterministic path works end to end |
| `claude_fallback` | 10 | The LLM path works where no mechanical fixer exists |
| `non_automatable` | 2 | The pipeline correctly **refuses** work and escalates |

A group is `module_prefix + sonar_rule_key + expected_severity`, matching the
plan grouping strategy in architecture spec §9. Ten of the fourteen groups hold
more than one finding, and the largest holds four — so grouping is genuinely
exercised rather than degenerating into fourteen groups of one.

Five rule keys are planted in **both** modules (`S1128`, `S3504`, `S3776`,
`S4144`). That is deliberate: it is what makes `module_prefix` a load-bearing
grouping dimension instead of a field that never changes the answer.

## The two refusals

Both live in `api/src/auth/`, which the eligibility policy excludes by path.

| Finding | Rule | Why it must be refused |
|---|---|---|
| Callback pyramid in `session.js` | `javascript:S2004` | Untangling nested session handling is a behavioural rewrite in a security-sensitive path |
| Assignment in a sub-expression in `token-verifier.js` | `javascript:S1121` | **Trivially fixable**, and refused anyway |

The second one is the sharper test. `S1121` is on the allowlist and a codemod
could fix it in one line. The only thing stopping the pipeline is *where the
code lives*. A pipeline that has never correctly refused something easy has not
been tested.

## Two things the catalogue records that are easy to get wrong

**Severities are looked up, not chosen.** A rule's severity comes from Sonar's
own quality profile. `javascript:S3504` is `CRITICAL`, not the `MINOR` you might
expect from "use let instead of var". Every key and severity here was verified
against the live SonarQube Cloud rules API for the default *Sonar way* profile,
including whether the rule is **activated** at all — several plausible
candidates (`S1192` duplicated literals, `S125` commented-out code, `S1172`
unused parameters, `S138` long functions, `typescript:S1481` unused locals) are
real rules that are **not** in Sonar way and would never have fired.

**One planted construct can raise two findings.** An unused `const` raises both
`S1481` (unused variable) and `S1854` (useless assignment) on the same line.
Three of the four `S1854` findings are co-located with an `S1481` in exactly
this way, and one codemod clears both. A catalogue assuming one-finding-per-
plant would report phantom "unexpected" findings at the scan gate.

## Generating and verifying

```bash
npm run smells:verify      # does the tree still match the catalogue?
npm run smells:generate    # regenerate the catalogue from observed findings
```

`smells:verify` is a **pre-flight** version of the first-scan gate: it diffs
observed findings against the catalogue and exits non-zero on any missing or
unexpected finding. It runs the same SonarJS analyzer SonarQube runs, exposed as
ESLint rules, so it costs nothing and needs no Sonar token.

It is a strong proxy, not a substitute. Three entries are marked
`local_rule_is_proxy` — `S3504` and `S6606` are implemented in SonarQube but not
re-exported by the standalone SonarJS plugin, so the local check stands in
`no-var` and `prefer-nullish-coalescing` for them. Same intent, not the same
code. The first real scan is what confirms them.

The smells must never break the build. `npm run build && npm test` passes on
every commit here: 20 tests, green. Smells, not breakage.
