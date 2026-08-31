<!-- sonar-agentic -->
### Agentic remediation

**8 finding(s) were deferred by `--max-findings`** and were not attempted. They remain unresolved:

- `javascript:S3776` api/src/reports/summary.js:65
- `javascript:S3776` api/src/services/order-service.js:23
- `typescript:S4144` web/src/app/orders/order-stats.ts:47
- `typescript:S3358` web/src/app/orders/order-stats.ts:58
- `typescript:S3358` web/src/app/orders/order-stats.ts:60
- `typescript:S3358` web/src/app/orders/order-stats.ts:69
- `typescript:S3358` web/src/app/orders/order-stats.ts:71
- `typescript:S3776` web/src/app/orders/order-stats.ts:80

| Outcome | Findings |
|---|---|
| Fixed and verified | **1** |
| Rejected by a gate | 1 |
| **Considered** | **2** |

Approximately 13956 tokens. Every other finding in this pull request was resolved or refused without one.

- `javascript:S4144` at `api/src/reports/summary.js:39` — **ambiguous_root_cause**: 3 proposals were rejected; the last at "testDiscriminates".
  - rejected at `testDiscriminates`: the accompanying test does not pass against the proposed fix
  - rejected at `testDiscriminates`: the accompanying test does not pass against the proposed fix
  - rejected at `testDiscriminates`: the accompanying test does not pass against the proposed fix