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
  manifest.json
```

## Commands

```bash
npm install
npm run build:all
npm run compile
npm run validate
npm run inspect
```

## Status

This initial repo is a strong scaffold. It contains domain contracts, executable TypeScript skeleton, seed data, generated examples, and sample scenario payloads. The next step is connecting real exports from the three source repositories.
