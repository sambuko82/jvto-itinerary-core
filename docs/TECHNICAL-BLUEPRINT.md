# JVTO Itinerary Intelligence — Technical Blueprint v1.1

**Mode:** deterministic-first
**Target repo:** `sambuko82/jvto-itinerary-core`
**Source repos:** `llm-wiki`, `jvto-web`, `new-backoffice`
**Primary goal:** a reusable, auditable itinerary intelligence layer — NOT an AI itinerary generator.

> Single technical source of truth. Pipeline: source data → deterministic scripts → generated datasets → validators → preview/PDF/AI consumer.

---

## 0. Core Logic

```
Customer Scenario
→ normalize pickup/dropoff/time
→ select route template/package
→ resolve route nodes + route legs
→ evaluate feasibility
→ attach operational events
→ attach meal/accommodation logic
→ attach cost components
→ produce page/PDF/WhatsApp/internal payload
→ optional AI explanation
```

Main object: `ItineraryScenario`. `Package` is only a starting template.

## 2. Repo Responsibility

| Repo | Role | Use |
| --- | --- | --- |
| `llm-wiki` | canonical knowledge | package registry, pricing, itinerary, compatibility, trust/policy |
| `jvto-web` | website/runtime consumer | Prisma model reference, package detail, map/PDF/page rendering |
| `new-backoffice` | operational source | logistics, cost, hotel, vehicle, crew, booking pattern |
| `jvto-itinerary-core` | intelligence layer | generated JSON, validation, scenario evaluator, payload export |

## 3. Non-Goals (do NOT build first)

customer chatbot · dynamic AI itinerary generator · dynamic AI pricing · public UI · PDF generator · Mapbox enrichment · new repo · manual JSON per package · raw booking data export.

## 6. Required Record Contract

Every generated record must include:

```json
{
  "id": "string",
  "schema_version": "string",
  "source_trace": [{ "repo": "string", "path": "string", "field": "string|null" }],
  "confidence": "high|medium|low",
  "generated_at": "ISO-8601",
  "manual_fields": [],
  "missing_fields": [],
  "status": "active|incomplete|deprecated"
}
```

Fail if: source_trace missing · PII detected · unknown route node · package slug conflict · cost formula without source · raw booking ID exposed.

## 7. PII Policy

Forbidden: customer name, email, phone, passport, ticket number, raw WhatsApp message, payment detail, full booking identifier, private document.

Allowed aggregated: pickup_area, dropoff_area, pickup_type, dropoff_type, arrival_time_bucket, departure_time_bucket, route_pattern, pax_bucket, vehicle_class, crew_role, cost_bucket, channel_bucket.

## 8. Determinism principle

Builds must be reproducible and offline. Source structure is captured into committed
`input/` snapshots by a manual online refresh (`npm run refresh:snapshots`). The compile
scripts parse those snapshots only — no network at build time. `generated_at` comes from
`INVENTORY_GENERATED_AT` or `input/source-snapshot-manifest.json.snapshot_generated_at`,
never `Date.now()`.

## 9. Validation Severity

- **Critical / Fail:** PII leakage · missing source_trace · package slug conflict · route leg references unknown node · cost formula without source · raw booking identifier · AI-generated data used as source.
- **High:** package count mismatch · missing package route map · common pickup/dropoff context missing · unexplained price discrepancy.
- **Medium:** missing distance/duration/coordinate · destination profile incomplete · meal inclusion unclear.
- **Low:** missing label/icon · format inconsistency · optional note missing.

## Phase status

- **Phase 0 — Blueprint Lock:** this document. ✅
- **Phase 1 — Source Discovery:** `source-inventory.json`, `schema-inventory.json`,
  `export-endpoint-inventory.json`, `validation-report.json` via `npm run inventory`.
  Source structure snapshots in `input/`; refresh via `npm run refresh:snapshots`.
- **Phases 2–9** (extractor connection, package/location normalization, route intelligence,
  pickup/dropoff/time rules, operational intelligence, cost, map, preview/PDF/AI): deferred.
  Do not proceed past a phase until its `validation-report.json` shows 0 critical errors.

## Folder discipline

Keep all work inside `src/extract/`, `src/compile/`, `src/validate/`, `src/scenario/`,
`generated/itinerary-intelligence/`, and committed `input/` snapshots. Avoid `data/`,
`compiled/`, `ai-data/`, `route-data/`, `temp/`, `manual-json/`.
