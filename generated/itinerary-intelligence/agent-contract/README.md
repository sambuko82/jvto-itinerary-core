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

- **clean** — all legs forward-adjacent, all sold destinations routed, core order
  matches the published itinerary.
- **needs_review** — core's seeded route map reuses a directional leg in reverse
  (`reverse_legs`), references a non-adjacent leg (`non_adjacent_legs`, e.g.
  `surabaya_to_tumpak_sewu` for an Ijen→Tumpak segment), or drops a sold destination
  from the model (`destinations_missing_from_route`, e.g. Papuma / Taman Safari).
  Each leg carries an `alignment` (`forward_adjacent` / `reverse_adjacent` /
  `non_adjacent` / `transit`). The runtime should validate these via feasibility
  rather than asserting the literal leg.
- **gap** — unroutable (no core route entry). `package-customization-boundaries.json`
  sets `effective_instant_book_eligible: false` for these (forces WhatsApp handoff).

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

## Known gap

`bali/ijen-papuma-tumpak-sewu-bromo-5d4n` has no Bali-origin 5D4N entry in
`11-package-route-map.json` → `route_integrity: gap`, empty `route_sequence`
(do-not-invent), instant-book gated, flagged in `operational-readiness.json` +
`manifest.json`.
