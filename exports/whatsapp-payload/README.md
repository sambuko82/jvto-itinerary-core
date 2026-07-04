# WhatsApp payload exports

Per-package, ready-to-send WhatsApp answers for all 16 standard JVTO packages.
Unlike the single manual-seed sample that used to live here
(`sample-whatsapp-summary.json`, still produced by `npm run compile` as part
of the original 5-target MVP payload set), this is a richer, dedicated
generator: one output file per package instead of one hand-seeded sample.

## Generate

```
npm run export:whatsapp
```

This runs `src/export/whatsapp-payload.ts`, which reads:

- `generated/itinerary-intelligence/16-package-pricing.json` (per-pax IDR price bands)
- `generated/itinerary-intelligence/agent-contract/standard-route-truth.json` (the 16 canonical packages, ordered route node sequence)
- `generated/itinerary-intelligence/agent-contract/package-customization-boundaries.json` (`effective_instant_book_eligible` / `instant_book_gated_reason`)
- `generated/itinerary-intelligence/07-operational-events.json` (destination membership used to decide which mandatory notes/advisories apply)
- `generated/itinerary-intelligence/22-destinations-master.json` (`main_attractions` for `highlights`)

and writes one JSON file per package to `exports/whatsapp-payload/output/`
(gitignored — regenerate on demand, never hand-edit or commit the full
output/ directory). Two named samples are committed under
`exports/whatsapp-payload/samples/` for review:

- `bali-bromo-ijen-3d2n.json` — package_key `bali/bromo-ijen-3d2n`
- `bromo-2d1n.json` — package_key `bromo-2d1n`

## Output schema

Validated against `whatsappPayloadSchema` in
[`src/schemas/exportSchemas.ts`](../../src/schemas/exportSchemas.ts). The
generator parse-validates every payload against that schema before writing it
to disk and throws if any payload doesn't conform. Shape summary:

```
{
  id, label, status, confidence, source_trace,   // BaseEntity contract fields
  package_id, display_name, duration,
  price_bands: { currency, origin, ferry_included, bands: [{min_pax, max_pax, idr_per_person}] },
  route_summary: string[],                        // ordered node sequence
  highlights: string[],                           // max 5
  mandatory_notes: string[],                       // health screening, blue fire disclaimer, temps, gas mask (only the ones relevant to this package's destinations)
  current_advisories: string[],                    // Madakaripura / Ijen crater floor live-status advisories, if applicable
  instant_book_eligible, gated_reason,
  wa_message_en: string                            // <= 900 chars, <= 3 emoji, no blue-fire "guarantee" language
}
```

## Consumers

The WhatsApp/CS runtime (sales and customer-service handoff flow) that needs
a ready-to-send English answer per package without recomputing pricing or
advisories itself. `wa_message_en` is meant to be sent as-is or lightly
edited; the structured fields (`price_bands`, `route_summary`, etc.) are for
building follow-up replies or CRM logging.
