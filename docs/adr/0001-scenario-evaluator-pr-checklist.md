# PR guardrail checklist — Scenario Evaluator

Apply to every PR that touches `src/scenario/**` or `generated/itinerary-intelligence/**`.
Maps to **ADR-0001** locked principles. A box may be checked **only** when a command output,
grep result, or diff proves it — not on assumption.

> Default rule: **no evaluator rewrite in a PR unless a failing test proves a gap.** If a rewrite
> is included, link the failing test that justifies it.

---

## P1 — Deterministic, data-driven core
- [ ] No LLM call / network request in the core path  (`grep -rinE "fetch|anthropic|openai|http" src/scenario` returns nothing relevant)
- [ ] `evaluateScenario` is pure given `(input, datasets)`: same input → identical output
- [ ] `deriveStatus` is a pure function of accumulated state (no I/O, no randomness, no clock)

## P2 — LLM stays at the edge
- [ ] No LLM output selects `recommended_route`, `route_leg_ids`, `status`, or `cost_components`
- [ ] If an LLM edge is added (input parsing / wording only), its output is validated against
      real dataset IDs and dropped when unmatched

## P3 — Cost IDs only
- [ ] `cost_components` is `string[]` of IDs
- [ ] No `unit_price`, `subtotal`, `estimated_total_cost`, or numeric price field anywhere on the
      evaluator path  (`grep -rinE "unit_price|subtotal|estimated_total_cost|price" src/scenario`)
- [ ] No pricing module imported into `src/scenario`

> Note: the `price` grep is an **aid, not proof**. It will produce false positives — e.g.
> `price_id` used purely as a dataset key, field names in comments, or cost-component ID strings
> that contain the word. The reviewer must manually confirm that **no numeric pricing value
> reaches the evaluator output contract**. A clean grep alone does not satisfy this check.

## P4 — Traceability
- [ ] `source_trace` covers the generated **dataset categories** used by the emitted
      outputs — i.e. every emitted ID is joinable to a dataset whose `ref` appears in
      `source_trace` (`route_leg_ids`→`04`, `operational_events`→`07`/`06`,
      `meal_logic`→`08`, `accommodation_logic`→`09`, `cost_components`→`10`).
      This is the current **dataset-level** trace contract; one `source_trace` entry
      per emitted ID is **not** required here (per-ID traces are a future revisit
      trigger, not a precondition for these PRs).
- [ ] A value with no source dataset record is **not** emitted — it degrades to
      `needs_manual_review`

## P5 — Honest fallback
- [ ] Insufficient data → `needs_manual_review` (not a forced `recommended` / `possible_with_warning`)
- [ ] Status precedence respected: `needs_manual_review` / `not_recommended` dominate
      `possible_with_warning`

## PII guard
- [ ] No `customer_name`, `email`, `phone`, `whatsapp`, or `passport` in input handling or output

---

## Validation — paste command output into the PR

```bash
npm run typecheck
npm run test
npm run scenario -- samples/customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json
```

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes, including a golden-file regression for the Surabaya late-arrival sample
- [ ] CLI output for the Surabaya sample returns:
  - [ ] `status` = `possible_with_warning`
  - [ ] `cost_components` are IDs only (no numbers)
  - [ ] `source_trace` covers every emitted ID's dataset category (dataset-level contract)
  - [ ] no PII fields present

---

## Reviewer sign-off
- [ ] Change stays within `jvto-itinerary-core`; no unrelated repo touched
- [ ] No new scope beyond the PR's stated issue
- [ ] If evaluator logic changed, a failing test justified it (linked above)
