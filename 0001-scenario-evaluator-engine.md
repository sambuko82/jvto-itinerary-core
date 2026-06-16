# ADR-0001: Scenario Evaluator engine model

**Status:** Accepted — architecture guardrail (not a refactor mandate)
**Date:** 2026-06-16
**Deciders:** Sam (founder)
**Scope:** `sambuko82/jvto-itinerary-core` only. No changes to `llm-wiki`, `new-backoffice`, or `jvto-web`.

## Purpose of this record

This ADR is a **guardrail, not a task**. It constrains *how* the Scenario Evaluator may be
implemented and extended so the system stays deterministic, auditable, and scope-bounded.

It does **not** authorize a rewrite. Existing evaluator code is changed only when a test proves
a gap against the principles below. No new scope is introduced by this document.

## Locked principles

1. **Deterministic core.** The core Scenario Evaluator is deterministic and data-driven.
   No LLM at runtime in the core path.
2. **LLM only at the edge, later.** An LLM may be introduced later ONLY for (a) parsing free-text
   input into the structured input, or (b) wording human-readable notes. It must never decide
   `recommended_route`, `route_leg_ids`, `status`, or `cost_components`.
3. **Cost IDs only.** The evaluator outputs cost component IDs only. No final pricing —
   no `unit_price`, `subtotal`, or `estimated_total_cost`.
4. **Traceable.** Every output ID must be traceable to a generated dataset record via `source_trace`.
5. **Honest fallback.** When data is insufficient, the system returns `needs_manual_review`.
   It must not force a recommendation.

## Decision

Build the evaluator as a **deterministic, data-driven pipeline in pure TypeScript**. The 12–15
generated datasets under `generated/itinerary-intelligence/` are the knowledge; the pipeline is
pure orchestration over them. If an LLM is later introduced, it is a **bounded edge layer**
(input parsing / note wording) whose output is validated against real dataset IDs and dropped
when unmatched — additive, never a core rewrite.

## Pipeline (reference)

Each stage is a pure function returning `{ values, traces }`. The `trace` collector accumulates
every stage's traces, so a value that no stage could source carries no trace entry and the
scenario degrades to `needs_manual_review`.

| # | Stage | Reads dataset(s) | Contributes | Trace emits |
|---|---|---|---|---|
| 1 | normalizeInput | — | clean typed input | input echo |
| 2 | resolveContext | 01-pickup, 02-dropoff | ready-buffer, direction constraint | pickup_context_id, dropoff_context_id |
| 3 | selectRoute | 11-package-route-map, 04-route-leg-index | recommended_route, route_leg_ids | each leg record id |
| 4 | applyTimeRules | 03-time-window-rules, 05-road-situation | warnings (timing/fatigue) | each time_rule_id fired |
| 5 | applyRecommendationRules | 12-recommendation-rules | better_route_notes, warnings | each rule id |
| 6 | mapOperationalEvents | 07-operational-events, 06-destination-profiles | operational_events | each event_id |
| 7 | mapMealLogic | 08-meal-logic | meal_logic | each meal_event_id |
| 8 | mapAccommodationLogic | 09-accommodation-logic | accommodation_logic | each area id |
| 9 | mapCostComponents | 10-cost-components | cost_components (IDs only) | each cost_component_id |
| 10 | deriveStatus | — (accumulated state) | status, next_required_info | rule that set status |

## Status precedence (first match wins)

1. Unresolved required input (e.g. airport pickup without `arrival_time`, route cannot be
   composed) → `needs_manual_review`
2. Blocking infeasibility (duration too short for required heavy activities; impossible
   timing/deadline) → `not_recommended`
3. Non-blocking warnings present (fatigue, late arrival, weather-sensitive leg) →
   `possible_with_warning`
4. Route resolved, no warnings, all required info present → `recommended`

`needs_manual_review` and `not_recommended` dominate `possible_with_warning`. Never silently
downgrade a hard stop into a soft warning.

## Bound sub-decisions

| Decision | Choice | Reason |
|---|---|---|
| Route selection | Hybrid: seed from `package-route-map` when a close `route_signature` exists, else compose from `route-leg-index`; always resolve to real leg IDs and validate west→east direction when dropoff is Ketapang/Bali | "Package is only a template"; both paths terminate in traceable leg IDs |
| Cost boundary | Hard wall: core emits IDs; pricing is a separate, gated module with no access to any price field | Honors locked principle 3 and the Cost Engine sequencing (new-backoffice export first) |
| Source-trace | Each stage returns values and traces as one unit | Traces cannot drift from outputs |
| Status derivation | Deterministic precedence (above) | Locked principle 1 |

## Out of scope (scope guard)

- No dashboard, final pricing engine, full PDF renderer, Mapbox full polyline, MCP/API server,
  WhatsApp automation, raw customer PII ingestion, or repo-wide refactor.
- No changes to `llm-wiki`, `new-backoffice`, or `jvto-web` under this ADR.
- The pricing module stays out of `src/` until a **verified redacted backoffice cost source**
  exists, calibrated from the existing `/export-data/itinerary-core/bundle` export. No new
  bundle name is assumed here until it actually ships.

## Consequences

- Easier: golden-file regression testing; auditing any output back to a dataset record; adding
  rules = adding dataset records, not code; the LLM edge layer slots in later without touching
  the core.
- Harder: the system is only as good as the datasets — sparse coverage means more
  `needs_manual_review`. This is the correct, honest failure mode for an ops tool.

## Revisit triggers

- A verified redacted backoffice cost source becomes available → unblocks the pricing module.
- Free-text scenario intake is needed → add the bounded LLM parser (edge layer only).
- A failing test proves the existing evaluator diverges from these principles → scoped fix
  (not a blanket rewrite).
