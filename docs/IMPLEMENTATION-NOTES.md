# Implementation Notes

## Keep it efficient

Use generated JSON and Zod validation first. Do not add a database until there is a real query/performance need.

## Manual override strategy

Manual data is allowed only for fields missing from existing systems:

- distance_km
- normal/busy duration
- route warnings
- road profile classification
- pickup/dropoff buffer
- rest-time/fatigue thresholds
- visual map metadata

Manual data belongs in `seed/manual-overrides/`, not inside generated files.

## Source trace

Every generated object should record origin:

```json
"source_trace": [
  "llm-wiki:output/products/package-readiness/package-registry.json",
  "jvto-web:prisma/schema.prisma",
  "new-backoffice:booking_logistics_export"
]
```

## Confidence levels

Use:

```text
verified
inferred
manual_seed
needs_review
```

Do not present `inferred` or `needs_review` data as final operational truth.
