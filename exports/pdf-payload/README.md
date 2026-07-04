# PDF payload exports

Per-package itinerary data for all 16 standard JVTO packages, structured to
plug directly into the existing quotation docx-js workflow. Unlike the single
manual-seed sample that used to live here (`sample-itinerary-pdf.json`, still
produced by `npm run compile` as part of the original 5-target MVP payload
set), this is a richer, dedicated generator: one output file per package
instead of one hand-seeded sample.

## Generate

```
npm run export:pdf
```

This runs `src/export/pdf-payload.ts`, which reads:

- `generated/itinerary-intelligence/16-package-pricing.json` (per-pax IDR price table)
- `generated/itinerary-intelligence/agent-contract/standard-route-truth.json` (route sequence, per-leg duration/distance, per-destination activity windows and staging notes, valid pickups/dropoffs)
- `generated/itinerary-intelligence/03-time-window-rules.json` (reviewed for context; not injected directly — it documents live-feasibility rules that need a customer's actual arrival time, which this static per-package payload does not have)
- `generated/itinerary-intelligence/07-operational-events.json` (destination membership used to decide which advisories apply)
- `generated/itinerary-intelligence/22-destinations-master.json` (destination attractions/details)
- `generated/itinerary-intelligence/10-cost-components.json` (`customer_visible` classification drives the inclusions list)
- `generated/itinerary-intelligence/agent-contract/route-validation-rules.json` (reviewed for context; same live-feasibility caveat as above)

and writes one JSON file per package to `exports/pdf-payload/output/`
(gitignored — regenerate on demand, never hand-edit or commit the full
output/ directory). Two named samples are committed under
`exports/pdf-payload/samples/` for review:

- `bali-bromo-ijen-3d2n.json` — package_key `bali/bromo-ijen-3d2n`
- `bromo-2d1n.json` — package_key `bromo-2d1n`

## Output schema

Validated against `pdfPayloadSchema` in
[`src/schemas/exportSchemas.ts`](../../src/schemas/exportSchemas.ts). The
generator parse-validates every payload against that schema before writing it
to disk and throws if any payload doesn't conform. Shape summary:

```
{
  id, label, status, confidence, source_trace,   // BaseEntity contract fields
  package_id, title,
  itinerary_days: [{ day, segments: [{ time_window, activity, location, notes }] }],
  inclusions: string[], exclusions: string[],
  price_table: { currency, origin, ferry_included, bands: [{min_pax, max_pax, idr_per_person}] },
  terms: { deposit: "20%", banks: ["BRI", "BCA"], contact_email: "hello@javavolcano-touroperator.com" },
  advisories: { mandatory_notes: string[], current_advisories: string[] }
}
```

## Consumers

The quotation docx-js document builder, which turns `itinerary_days` +
`inclusions`/`exclusions` + `price_table` + `terms` + `advisories` into the
customer-facing itinerary/quotation PDF. This payload intentionally carries
no hotel/vehicle/crew `name` fields (see PR body for the explicit judgment
call on that).
