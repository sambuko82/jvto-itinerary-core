# JVTO Itinerary Core

Reusable itinerary intelligence core for Java Volcano Tour Operator.

This repository does **not** replace existing repositories. It compiles useful itinerary, route, pickup/dropoff, activity, accommodation, cost, visual-map, and output-payload data from existing JVTO sources into a clean generated layer.

## Main purpose

Turn this:

```text
Package + pickup + arrival time + dropoff + pax + duration + requested destinations
```

Into this:

```text
Recommended route + feasibility warnings + operational events + cost components + map payload + PDF/page-ready itinerary payload
```

## Core principle

```text
Extract what is useful.
Do not refactor old repositories.
Do not duplicate raw sensitive data.
Generate reusable itinerary intelligence.
```

## Data sources

| Source | Role | Used for |
|---|---|---|
| `sambuko82/llm-wiki` | knowledge source | package registry, public itinerary, pricing, policy/trust notes |
| `jvto-devteam/jvto-web` | publishing/runtime source | website route reality, destination models, route details, map/PDF references |
| `jvto-devteam/new-backoffice` | operational source | pickup/dropoff reality, logistics, package cost, hotels, vehicles, crews, activities |

## First generated layer

Datasets 01–15 and 28 are written and validated by the compile pipeline
(`npm run compile` / `npm run validate` — see `src/compile/index.ts` and
`src/validate/validate-generated-data.ts`). Datasets 16–27 are static/imported
fixtures with their own `source_trace` metadata; they are **not** currently
regenerated or checked by `npm run compile`/`validate` — treat them as
manually-maintained until a builder + validation path is added for them.

```text
generated/itinerary-intelligence/
  01-pickup-contexts.json                # compiled + validated
  02-dropoff-contexts.json                # compiled + validated
  03-time-window-rules.json               # compiled + validated
  04-route-leg-index.json                 # compiled + validated
  05-road-situation-profiles.json         # compiled + validated
  06-destination-activity-profiles.json   # compiled + validated
  07-operational-events.json              # compiled + validated
  08-meal-logic.json                      # compiled + validated
  09-accommodation-logic.json             # compiled + validated
  10-cost-components.json                 # compiled + validated
  11-package-route-map.json               # compiled + validated
  12-recommendation-rules.json            # compiled + validated
  13-visual-map-layer.json                # compiled + validated
  14-output-template-map.json             # compiled + validated
  15-scenario-preview-sample.json         # compiled + validated
  16-package-pricing.json                 # static/imported fixture, not yet wired into compile/validate
  17-hotels-master.json                   # static/imported fixture, not yet wired into compile/validate
  18-activities-master.json               # static/imported fixture, not yet wired into compile/validate
  19-transport-master.json                # static/imported fixture, not yet wired into compile/validate
  20-others-master.json                   # static/imported fixture, not yet wired into compile/validate
  21-package-expense-map.json             # static/imported fixture, not yet wired into compile/validate
  22-destinations-master.json             # static/imported fixture, not yet wired into compile/validate
  23-transport-crew-rules.json            # static/imported fixture, not yet wired into compile/validate
  24-timezone-rules.json                  # static/imported fixture, not yet wired into compile/validate
  25-guest-meeting-protocol.json          # static/imported fixture, not yet wired into compile/validate
  26-bali-transport-addons.json           # static/imported fixture, not yet wired into compile/validate
  27-meal-stops.json                      # static/imported fixture, not yet wired into compile/validate
  28-tomtom-geotag-index.json             # compiled + validated
  manifest.json
  agent-contract/
    -- agent-safe operational contract: standard route truth,
       route-validation rules, instant-book gating — consumed by
       jvto-whatsapp-agent-runtime
```

## Commands

```bash
npm install
npm run build:all       # compile + validate
npm run compile
npm run validate
npm run agent-contract   # regenerate generated/itinerary-intelligence/agent-contract/
npm run intelligence:all # full extract -> catalog -> routes -> context -> source-contracts -> agent-contract -> validate
npm run inspect
npm run scenario
npm run typecheck
npm test
```

## Scenario service

`src/scenario/evaluateScenario.ts` is also exposed as a thin internal HTTP
service (`node:http` only, zero new dependencies) so a scenario JSON in gets
feasibility + route + warnings + cost back out in under a second, without
shelling out to the CLI. It mechanically enforces the fixed-package business
rules already encoded in the evaluator, notably:

- only the fixed packages / destinations in `generated/itinerary-intelligence/11-package-route-map.json` and `06-destination-activity-profiles.json` are recognized — unknown destinations fall back to `needs_manual_review`, they are never invented;
- Ijen staging **ex-Surabaya is via Bondowoso**, not Banyuwangi (Banyuwangi staging only applies when the trip originates from Bali) — see `bondowoso_ijen_staging` / `banyuwangi_staging` in `09-accommodation-logic.json`.

Start it with:

```bash
npm run scenario:serve          # listens on PORT (default 4174)
PORT=5000 npm run scenario:serve
```

Then evaluate a scenario:

```bash
curl -X POST localhost:4174/evaluate \
  -H 'Content-Type: application/json' \
  -d @samples/customer-scenario-surabaya-bromo-ijen-ketapang.json

curl localhost:4174/health
```

`POST /evaluate` accepts an `ItineraryScenario` JSON body (same shape as the
files in `samples/*.json`), validated against `itineraryScenarioSchema` in
`src/domain/itinerary.ts`. Responses:

- `200` — evaluation succeeded; body is the `ScenarioEvaluation` plus a `meta: { dataset_manifest_version, evaluated_at }` block.
- `422` — the evaluator scored the scenario `not_recommended` (infeasible by contract, e.g. not enough days for the requested destinations); the full evaluation body (warnings, notes, etc.) is still returned.
- `400` — the request body is not valid JSON, or doesn't match the scenario schema; the response includes the zod issues.
- `500` — an unexpected server error; the response body is a generic message only, details are logged to stderr, never returned to the client.

`GET /health` returns `{ status, datasets_loaded, package_count }` and can be
used for basic liveness checks. Datasets are loaded once at boot via the
existing `loadDatasets()`, not per request.

## Status

This initial repo is a strong scaffold. It contains domain contracts, executable TypeScript skeleton, seed data, generated examples, and sample scenario payloads. The next step is connecting real exports from the three source repositories.
