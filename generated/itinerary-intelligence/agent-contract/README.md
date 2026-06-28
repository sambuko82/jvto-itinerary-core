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
| `manifest.json` | Index + guarantees. |

## Guarantees

- No cost components, vendor/supplier rates, margins, or quote totals.
- No customer PII or raw chat.
- No marketing copy, URLs, media, or booking CTAs (those belong to Bootstrap / Website / Runtime).
- Feasibility truth is computed by the core evaluator, not asserted here.

## Known gap

`bali/ijen-papuma-tumpak-sewu-bromo-5d4n` has no Bali-origin 5D4N entry in
`11-package-route-map.json`; its `route_sequence` / `route_leg_refs` are left empty
(do-not-invent) and flagged in `operational-readiness.json` + `manifest.json`.
