> [!IMPORTANT]
> **Standing demo target for the remediation pipeline — do not merge.** This diff deliberately carries the 29 planted findings of the smell catalogue — 17 codemod-fixable, 10 needing judgement, and 2 in `api/src/auth/` the eligibility policy must **refuse** by path. `demo-reset` restores it; `03 - remediate` works on it.

The feature story the smells are planted in — three things the operations dashboard needs:

- `api/src/reports/summary.js` — revenue, open counts, flagged orders
- `web/src/app/orders/order-stats.ts` — the panel the dashboard renders
- `api/src/auth/` — bearer token verification and session assembly, behind `/api/session`

Build is green and all 20 existing tests pass.
