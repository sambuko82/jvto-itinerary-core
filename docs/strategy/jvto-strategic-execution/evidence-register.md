# Evidence Register

Every public claim must exist here before it appears on website, OTA, voucher, WhatsApp, or
sales scripts. Rows below are seeded from this repo's pipeline data where the fact is already
proven; genuinely unknown items stay `needs_verification`. Re-check the live website, OTA,
Trustpilot, and internal booking records before publishing any claim.

## 🔒 All-Inclusive Rule (hard rule — owner-confirmed)

Every JVTO package price is **all-inclusive**: entrance fees and permits for **all** destinations
(Bromo, Ijen, Tumpak Sewu, Madakaripura, Papuma, and any other stop) are already included in
the package price. Therefore:

- **Never publish entrance-fee or tariff amounts** in any customer-facing surface (website, OTA,
  voucher, WhatsApp, sales scripts). The only price a customer sees is the all-in package price.
- **Never use "paid on-site", "mixed", "excluded", or "conditional" wording for entrance fees.**
  The customer-facing answer is always "included in the package price".
- Tariff figures are **internal cost inputs only** and live in the pipeline
  (`generated/itinerary-intelligence/10-cost-components.json`). Do not restate amounts in these
  strategy docs or in any public copy.

## Confidence levels

- `confirmed` — verified against an official or authoritative source.
- `internal_only` — proven inside JVTO systems/repo data; still needs a live cross-channel check before public use.
- `indicated` — supported by product/operational data but not independently confirmed.
- `needs_verification` — not yet checked; must not appear in public copy.

## Claim Register

| Claim ID | Claim | Source Type | Source Location | Date Checked | Owner | Confidence | Status | Action |
|---|---|---|---|---|---|---|---|---|
| CLAIM-001 | JVTO public review count and score | Public review platform | needs_verification | 2026-07-15 | Marketing | needs_verification | Open | Re-check live profile (Google Business, Trustpilot, OTA) before publishing any count or score |
| CLAIM-002 | Canonical legal entity and registration number | JVTO web product snapshot | `input/jvto-web/publicContent/generated/packageDetailSnapshots.json` (`legalEntity: "PT Java Volcano Rendezvous"`, `nib: "1102230032918"`, `tdup: "1102230032918"`) | 2026-07-15 | Compliance | internal_only | Open | Confirm this exact identifier is identical across website footer, checkout, voucher, WhatsApp, and every OTA listing |
| CLAIM-003 | Ijen Blue Fire is conditional, visible only in a narrow overnight window | Destinations master + operational readiness data | `generated/itinerary-intelligence/22-destinations-master.json` (blue fire ~midnight–04:00; `ijen_access_closure_risk` / `live_condition`) | 2026-07-15 | Operations | indicated | Open | Never market Blue Fire as guaranteed; confirm latest access wording and wire into H-7/H-3/H-1 pre-trip messages |
| CLAIM-004 | All entrance fees & permits (every destination) are included in the package price | Owner confirmation + cost components + web snapshot | Owner-confirmed all-inclusive policy (see All-Inclusive Rule above); `10-cost-components.json` marks entrance fees `customer_visible: included_in_package`; web snapshot for `bromo-madakaripura-ijen-3d2n` states "All Entrance Fees & Permits" included | 2026-07-15 | Product | confirmed | Closed | Present entrance as "included in the package price" everywhere; never publish tariff amounts or "paid on-site"/"mixed" wording |
| CLAIM-005 | 3D2N packages carry high sleep disruption (midnight departures) | Product itinerary + internal timing | `generated/itinerary-intelligence/` itinerary-day timing (earliest wake / sleep window); customer review = needs_verification | 2026-07-15 | Product/Ops | indicated | Open | Add Sleep Disruption Rating per product and disclose before checkout |
| CLAIM-006 | 🔒 Entrance tariff amounts are INTERNAL cost data — never public | Cost components | Authoritative per-destination tariff figures live in `generated/itinerary-intelligence/10-cost-components.json` (internal costing only). Amounts are intentionally NOT restated here. | 2026-07-15 | Operations | internal_only | Closed | DO NOT PUBLISH any tariff amount. Entrance is included in the package price (CLAIM-004); customers never see a separate tariff. Use cost-components only for internal margin/costing. |
| CLAIM-007 | Pricing is per-person IDR with pax-tier steps | Package pricing data | `input/llm-wiki/package-readiness/package-pricing.json`; example `bromo-madakaripura-ijen-3d2n`: 1 pax IDR 6,300,000 down to group tiers from IDR 2,450,000 | 2026-07-15 | Product | internal_only | Open | Verify each hero product's live tiers match the registry before promotion |

## Verification Capture Template

For each pain point or claim from the referenced strategic analysis, capture:

```text
claim_id:
source_url:
source_type: website | OTA | review | internal | official authority | supplier | repo_data
capture_date:
exact_claim_supported:
confidence: confirmed | indicated | internal_only | needs_verification
business_decision:
```

## Acceptance

No strategic claim remains in public copy unless its `confidence` is `confirmed`, or
`internal_only` with owner approval. Every `needs_verification` row must be closed or
explicitly held before the product it supports is promoted.
