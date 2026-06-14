# Execution Blueprint

## Goal

Build a clean, reusable itinerary intelligence layer for JVTO.

This is not a generic knowledge base. This is the operational brain for:

- custom itinerary generation
- package route normalization
- pickup/dropoff decision logic
- route feasibility checking
- activity timing and fatigue logic
- accommodation and meal logic
- cost component mapping
- Mapbox/Leaflet visual payloads
- PDF/page/WhatsApp/quotation output payloads

## Correct mental model

```text
travel scenario
  → itinerary decision
  → route feasibility
  → operational execution
  → cost model
  → output document/page
```

Package is only the starting template. The real object is an `ItineraryScenario`.

## MVP output

The repo must produce these generated datasets:

1. Pickup contexts
2. Dropoff contexts
3. Time-window rules
4. Route-leg index
5. Road-situation profiles
6. Destination activity profiles
7. Operational events
8. Meal logic
9. Accommodation logic
10. Cost components
11. Package route map
12. Recommendation rules
13. Visual map layer
14. Output template map
15. Scenario preview sample

## Implementation stance

Do not start by building dashboards, MCP, vector DB, or a large database.

Start by producing high-quality generated JSON files that can later power:

- website itinerary pages
- customer PDF
- internal operation sheet
- WhatsApp summary
- quotation
- future dashboard
- future agent/MCP layer

## Phases

### Phase 1 — Repo foundation

- folder structure
- TypeScript skeleton
- contracts
- seed overrides
- generated examples

### Phase 2 — Source extraction

- extract package/template data from `llm-wiki`
- extract route/destination/PDF-map references from `jvto-web`
- extract logistics/cost/actual-expense summary from `new-backoffice`

### Phase 3 — Intelligence compilation

- normalize pickup/dropoff
- normalize route legs
- attach road profiles
- attach destination activity windows
- attach operational events
- attach cost components
- attach warning/recommendation rules

### Phase 4 — Output payload generation

- page payload
- PDF payload
- WhatsApp summary payload
- internal ops payload
- map payload

### Phase 5 — Real integration

- connect generated JSON to `jvto-web`
- optionally add API endpoint
- optionally add itinerary builder UI
