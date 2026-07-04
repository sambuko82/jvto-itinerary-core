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

```text
generated/itinerary-intelligence/
  01-pickup-contexts.json
  02-dropoff-contexts.json
  03-time-window-rules.json
  04-route-leg-index.json
  05-road-situation-profiles.json
  06-destination-activity-profiles.json
  07-operational-events.json
  08-meal-logic.json
  09-accommodation-logic.json
  10-cost-components.json
  11-package-route-map.json
  12-recommendation-rules.json
  13-visual-map-layer.json
  14-output-template-map.json
  15-scenario-preview-sample.json
  16-package-pricing.json
  17-hotels-master.json
  18-activities-master.json
  19-transport-master.json
  20-others-master.json
  21-package-expense-map.json
  22-destinations-master.json
  23-transport-crew-rules.json
  24-timezone-rules.json
  25-guest-meeting-protocol.json
  26-bali-transport-addons.json
  27-meal-stops.json
  28-tomtom-geotag-index.json
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

## Status

This initial repo is a strong scaffold. It contains domain contracts, executable TypeScript skeleton, seed data, generated examples, and sample scenario payloads. The next step is connecting real exports from the three source repositories.
