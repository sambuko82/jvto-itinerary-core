# Output Spec

## Generated intelligence files

All generated files live in:

```text
generated/itinerary-intelligence/
```

Each file must be versionable and human-readable JSON.

## Consumer outputs

Exports are generated from the intelligence files:

```text
exports/page-payload/
exports/pdf-payload/
exports/whatsapp-payload/
exports/internal-ops-payload/
exports/ai-context-pack/
```

## Required output modes

| Output mode | Purpose |
|---|---|
| `customer_pdf` | polished itinerary sent to customer |
| `website_page` | package/custom itinerary page payload |
| `quotation` | sales quote support |
| `whatsapp_summary` | short CS response |
| `internal_ops_sheet` | crew/vendor execution context |
| `map_payload` | Mapbox/Leaflet visualization |

## Sample payload fields

```json
{
  "scenario_id": "custom_surabaya_bromo_ijen_ketapang_3d2n",
  "status": "possible_with_warning",
  "recommended_route": [],
  "warnings": [],
  "operational_events": [],
  "cost_components": [],
  "map_payload": {},
  "pdf_payload": {},
  "page_payload": {}
}
```
