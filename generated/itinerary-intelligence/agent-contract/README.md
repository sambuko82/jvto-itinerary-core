# Agent Contract (agent-safe operational projection)

Narrow, **agent-safe** projection of the itinerary-core intelligence layer for
`jvto-whatsapp-agent-runtime`. This is **not** a duplicate of the full datasets — it
is the minimal subset the runtime needs to route, clarify, and guardrail, with all
cost/vendor/PII fields stripped.

Generated read-only from `generated/itinerary-intelligence/*`. Do not hand-edit;
regenerate from source.

| File | What it answers |
|---|---|
| `package-operational-composition.json` | Which route legs / destinations / staging / endpoints a package is built from. |
| `route-validation-rules.json` | When the runtime must NOT answer "possible" without details or a feasibility call. |
| `pickup-dropoff-requirements.json` | The minimum questions the agent must ask per pickup/drop-off. |
| `destination-operational-overlays.json` | Destination data turned into operational triggers (staging, prior events, fatigue, live-checks). |
| `staging-logic.json` | Why we stage near Bromo / Ijen / Tumpak Sewu, etc. (no rates). |
| `package-customization-boundaries.json` | Standard vs handoff/quote; instant-book eligibility. |
| `operational-readiness.json` | Dataset status flags so the runtime never treats seed/inferred data as final truth. |
| `standard-route-truth.json` | Per-package canonical route truth (all 16 packages) — every field classified by evidence strength (`final_jvto_standard` / `source_backed_estimate` / `live_condition` / `exception` / `absent`), never presented above what it's backed by. |
| `manifest.json` | Index + guarantees. |

## Guarantees

- No cost components, vendor/supplier rates, margins, or quote totals.
- No customer PII or raw chat.
- No marketing copy, URLs, media, or booking CTAs (those belong to Bootstrap / Website / Runtime).
- Feasibility truth is computed by the core evaluator, not asserted here.

## Route integrity

`package-operational-composition.json` validates every leg ref against the route
sequence and records `route_integrity` per package:

- **clean** — route map and source strength both `confirmed`, no ambiguous node, and
  every leg either forward-adjacent or a benign transit hop.
- **needs_review** — one or more `route_review_flags` fired: `non_forward_legs` (a leg
  runs reverse or skips a step), `off_sequence_legs` (a leg reaches a destination the
  catalog does not list as sold for this package), `destinations_missing_from_route`,
  `contains_ambiguous_node`, or `route_source_strength` below `confirmed`.
  Each leg carries an `alignment`: `forward_adjacent`, `reverse_adjacent`,
  `non_adjacent`, `off_sequence`, `return_to_origin`, or `transit`. The runtime should
  validate these via feasibility rather than asserting the literal leg.
  `needs_review` **warns; it does not gate instant book.**
- **gap** — unroutable: route map status is not `confirmed`, or `route_sequence` is
  empty. `package-customization-boundaries.json` sets
  `effective_instant_book_eligible: false` for these (forces WhatsApp handoff).

The authoritative **customer-facing** route order is the published itinerary in the
knowledge-catalog `package-variations.json`, not core's operational map.

## Consumption contract

- **Official consumer:** `jvto-whatsapp-agent-runtime`. This directory is not a
  general-purpose export — it exists for that runtime's routing/guardrail
  needs; other consumers should go through the regular `generated/itinerary-intelligence/`
  datasets or `exports/` payloads instead.
- **Entry point:** `manifest.json`. Consumers should read it first — it indexes
  every file in this directory plus the guarantees/gaps that apply repo-wide.
  Don't hardcode the file list; read it from the manifest so a new file being
  added here doesn't silently go unread.
- **Versioning:** follows the repo's release cadence (see E6 — versioned
  `data-vYYYY.MM.DD-<shortsha>` GitHub Releases of `generated/`). Pin to a
  release tag, not to `main` at an arbitrary commit, so the runtime never picks
  up a mid-regeneration or reverted state.
- **Pricing rule:** the runtime must never quote a price, rate, or total from
  anything in this directory — it's redacted of cost/vendor data by design
  (see Guarantees above). Prices come exclusively from `10-cost-components.json`
  and `16-package-pricing.json`, and only the entries/fields marked
  `source_backed` (not `manual_seed`, `needs_field_data`, or unclassified) —
  see `docs/_audit` and E1 for which cost components currently qualify.

## Current integrity state

As of the committed build: **14 clean, 2 needs_review, 0 gap**
(`manifest.json` → `route_integrity_summary`). No package is currently unroutable, and
no package is instant-book gated by route integrity.

Both `needs_review` packages share one upstream cause, owner-adjudicated 2026-07-01:

| Package | Flag | Cause |
|---|---|---|
| `bali/bromo-ijen-3d2n` | `off_sequence_legs: bromo__to__madakaripura` | llm-wiki `destination_tokens` under-lists Madakaripura |
| `bromo-2d1n` | `off_sequence_legs: madakaripura__to__surabaya` | same |

Both packages **do** include the Madakaripura stop — jvto-web's itinerary is correct.
The correction belongs upstream in llm-wiki's
`output/products/package-readiness/package-registry.json`, which generates both the
sold-destination list and the derived `route_sequence`; it cannot be fixed in this repo.
Each is recorded as a structured `missing_data` entry under `manifest.json` →
`composition_gaps`, with `gating: warns`.

A separate, non-blocking gap is tracked in `operational-readiness.json`: the composite
`bali_hotel_area_to_banyuwangi_ijen_area` leg carries null distance/duration in the
legacy `04-route-leg-index.json`. That index feeds only the CLI `scenario` command —
not this contract, and not the WhatsApp runtime.
