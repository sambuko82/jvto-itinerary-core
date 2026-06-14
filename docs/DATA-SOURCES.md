# Data Sources

## `sambuko82/llm-wiki`

Expected useful paths:

```text
output/products/package-readiness/
output/website/trust-bundle/
wiki/products/
wiki/destinations/
wiki/finance/
wiki/website/
```

Used for:

- package registry
- public itinerary
- public package pricing
- policy/trust notes
- selling context

## `jvto-devteam/jvto-web`

Expected useful paths:

```text
prisma/schema.prisma
src/data/
src/lib/publicContent/
src/app/
src/components/
```

Used for:

- route model
- route details
- destination model
- destination geodata
- website route reality
- page payload compatibility
- map/PDF generation reference

## `jvto-devteam/new-backoffice`

Expected useful exports:

```text
booking logistics
booking finance summary
package prices
package itineraries
hotels
room rates
vehicles
crew roles and rates
destination activities
other activities
actual expense details
```

Used for:

- pickup/dropoff reality
- cost model
- crew/vehicle assignment behavior
- hotel/meal/room rate behavior
- actual cost calibration

## PII rule

Do not ingest raw customer PII into generated datasets. Use aggregate or redacted operational patterns.
