# Contributing

Rules adopted post-consolidation (audit 2026-07-04), after the agent-contract
layer was found stranded on stacked PRs #20–#23 for weeks.

1. **All changes go through a PR into `main`. No stacked PRs** (a PR whose
   base is anything other than `main`). Stacked PRs were the direct cause of
   the agent-contract layer being stranded and nearly lost — every PR must
   target `main` directly so it can be reviewed and merged independently.
2. **Agent branches (`claude/*`, `codex/*`) are ephemeral** and are expected
   to be auto-deleted on merge (see repo setting `delete_branch_on_merge`).
   Don't build on top of another still-open agent branch.
3. **`generated/**` only changes via npm scripts** (`npm run compile`, etc.).
   Hand-editing a generated JSON file is a review reject — fix the builder in
   `src/compile/` instead and regenerate.
4. **Manual rates/prices go in `seed/manual-overrides/*.yaml`**, never
   directly in `generated/`. The compile pipeline reads overrides as input;
   it does not accept hand-authored generated output.
5. **PII rules in `contracts/pii-rules.yaml` are a hard gate.** Raw backoffice
   extracts, hotel/vehicle/crew `name` keys, and anything under
   `input/**/raw-private/` or `input/**/pii/` must never be committed or
   persisted as JSON — they stay in-memory only during extraction.
