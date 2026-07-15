# llm-wiki policy-bundle snapshot

Committed snapshot of the cancellation policy **decision matrix** produced by
llm-wiki's Policy Bundle Compiler v2.0.

- Source repo: `sambuko82/llm-wiki`
- Source path: `output/website/policy-bundle/decision-matrix.json`
- Schema: `cancellation-policy/v2.0`

`decision-matrix.json` is the rule-engine-ready outcome table consumed by
`src/scenario/evaluateCancellation.ts`. It is the **single source of cancellation
outcomes** — the engine reads refund percentages, the Recovery Fee, and the
Package Credit locks from here; it never hard-codes them.

Refresh by re-running the llm-wiki compiler (`python scripts/compile_policy_bundle.py
--write --strict`) and copying the regenerated `decision-matrix.json` here. Do not
hand-edit — fix the canonical YAML in llm-wiki (`wiki/policies/cancellation-package-credit.yml`)
and recompile.
